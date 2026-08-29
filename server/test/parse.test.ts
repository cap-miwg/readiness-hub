import { describe, expect, it } from 'vitest'
import {
  convertCell,
  parseCapwatchDate,
  parseCapwatchTimestamp,
  parseCsvTable,
  parseDownloadDate,
} from '../src/ingest/parse.js'
import { TABLES_BY_FILE, type TableSpec } from '../src/ingest/tables.js'

const spec: TableSpec = {
  file: 'T.txt',
  table: 't',
  required: true,
  columns: { CAPID: 'int', NameLast: 'string', DOB: 'date', Asst: 'bool' },
}

function buf(text: string): Buffer {
  return Buffer.from(text, 'utf8')
}

describe('parseCsvTable', () => {
  it('parses quoted DOS-CRLF CSV with a BOM and maps headers by name, not position', () => {
    const csv =
      '\uFEFF"NameLast","CAPID","DOB","Asst"\r\n' + '"Doe","123456","3/15/2005","1"\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.columns).toEqual(['capid', 'name_last', 'dob', 'asst'])
    expect(out.rows).toEqual([[123456, 'Doe', new Date(Date.UTC(2005, 2, 15)), true]])
    expect(out.dropped).toEqual({ columns: [], rejects: 0 })
  })

  it('normalizes the 01/01/1900 sentinel to null in both padded and bare forms', () => {
    const csv =
      'CAPID,NameLast,DOB,Asst\r\n' +
      '1,A,01/01/1900,True\r\n' +
      '2,B,1/1/1900,False\r\n' +
      '3,C,12/31/1999,True\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows.map(r => r[2])).toEqual([null, null, new Date(Date.UTC(1999, 11, 31))])
    expect(out.dropped.rejects).toBe(0)
  })

  it('accepts MM/DD/YYYY with a trailing time and stores the date only', () => {
    const csv = 'CAPID,NameLast,DOB,Asst\r\n9,Z,"03/15/2005 12:00:00 AM",0\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows[0]?.[2]).toEqual(new Date(Date.UTC(2005, 2, 15)))
  })

  it('keeps a quoted field containing a newline as one row', () => {
    const csv = 'CAPID,NameLast,DOB,Asst\r\n7,"Smith,\nJr.",6/1/2010,1\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]?.[1]).toBe('Smith,\nJr.')
  })

  it('drops non-allowlisted upstream columns (Member.txt SSN never survives parse)', () => {
    const memberSpec = TABLES_BY_FILE.get('Member.txt') as TableSpec
    const csv =
      'CAPID,SSN,NameLast,NameFirst,NameMiddle,NameSuffix,Gender,DOB,ORGID,Wing,Unit,Rank,Joined,Expiration,OrgJoined,DateMod,Type,RankDate,Region,MbrStatus\r\n' +
      '100001,999-99-9999,Doe,Jane,,,F,2/2/2008,1157,MI,205,C/AMN,1/5/2024,1/5/2026,1/5/2024,1/6/2024,CADET,3/1/2024,GLR,ACTIVE\r\n'
    const out = parseCsvTable(memberSpec, buf(csv))
    expect(out.dropped.columns).toEqual(['SSN', 'Gender'])
    expect(out.columns).not.toContain('ssn')
    const flat = out.rows[0] ?? []
    expect(flat).not.toContain('999-99-9999')
    expect(flat).not.toContain('F')
    expect(out.rows[0]?.[out.columns.indexOf('capid')]).toBe(100001)
  })

  it('counts a structurally short row as a reject and skips it', () => {
    const csv = 'CAPID,NameLast,DOB,Asst\r\n1,A,6/1/2010,1\r\n2,B\r\n3,C,6/2/2010,0\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows).toHaveLength(2)
    expect(out.dropped.rejects).toBe(1)
  })

  it('nulls an unparseable int cell, counts the reject, and keeps the row', () => {
    const csv = 'CAPID,NameLast,DOB,Asst\r\nABC,A,6/1/2010,1\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows).toEqual([[null, 'A', new Date(Date.UTC(2010, 5, 1)), true]])
    expect(out.dropped.rejects).toBe(1)
  })

  it('fills an allowlisted column absent from the file with nulls', () => {
    const csv = 'CAPID,NameLast\r\n5,E\r\n'
    const out = parseCsvTable(spec, buf(csv))
    expect(out.rows).toEqual([[5, 'E', null, null]])
    expect(out.dropped.rejects).toBe(0)
  })
})

describe('convertCell', () => {
  it('treats empty as null, never a reject', () => {
    for (const type of ['int', 'string', 'date', 'bool'] as const) {
      expect(convertCell(type, '')).toEqual({ value: null, reject: false })
      expect(convertCell(type, undefined)).toEqual({ value: null, reject: false })
    }
  })

  it('accepts True/False/1/0 case-insensitively for bools and rejects anything else', () => {
    expect(convertCell('bool', 'True').value).toBe(true)
    expect(convertCell('bool', 'FALSE').value).toBe(false)
    expect(convertCell('bool', '1').value).toBe(true)
    expect(convertCell('bool', '0').value).toBe(false)
    expect(convertCell('bool', 'yes')).toEqual({ value: null, reject: true })
  })

  it('rejects non-integer and unsafe int values', () => {
    expect(convertCell('int', '12.5')).toEqual({ value: null, reject: true })
    expect(convertCell('int', '-42')).toEqual({ value: -42, reject: false })
  })
})

describe('date helpers', () => {
  it('rejects impossible calendar components', () => {
    expect(parseCapwatchDate('13/01/2020')).toBeUndefined()
    expect(parseCapwatchDate('not a date')).toBeUndefined()
  })

  it('parses a DownLoadDate timestamp keeping the time', () => {
    expect(parseCapwatchTimestamp('8/29/2026 5:03:24 AM')).toEqual(
      new Date(Date.UTC(2026, 7, 29, 5, 3, 24)),
    )
    expect(parseCapwatchTimestamp('8/29/2026 5:03:24 PM')).toEqual(
      new Date(Date.UTC(2026, 7, 29, 17, 3, 24)),
    )
  })

  it('reads DownLoadDate.txt (header row plus one quoted value)', () => {
    const d = parseDownloadDate(buf('DownLoadDate\r\n"8/29/2026 4:12:00 AM"\r\n'))
    expect(d).toEqual(new Date(Date.UTC(2026, 7, 29, 4, 12, 0)))
    expect(parseDownloadDate(buf('DownLoadDate\r\n'))).toBeNull()
  })
})
