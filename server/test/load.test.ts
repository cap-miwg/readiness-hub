import { describe, expect, it } from 'vitest'
import {
  buildInsertStatements,
  checkDownloadDateGate,
  checkRequiredTables,
  checkShrinkGuard,
  createStagingSql,
  MAX_INSERT_PARAMS,
  SHRINK_GUARD_TABLES,
  skipEmptyOptionalTable,
  stagingName,
} from '../src/ingest/load.js'
import type { ParsedTable } from '../src/ingest/parse.js'
import { TABLES, type TableSpec } from '../src/ingest/tables.js'

function mkParsed(table: string, file: string, rowCount: number): ParsedTable {
  return {
    file,
    table,
    columns: ['capid'],
    rows: Array.from({ length: rowCount }, (_, i) => [i + 1]),
    droppedRows: 0,
    dropped: { columns: [], rejects: 0 },
  }
}

function allRequired(rowCount = 5): Map<string, ParsedTable> {
  const m = new Map<string, ParsedTable>()
  for (const spec of TABLES.filter(t => t.required)) {
    m.set(spec.table, mkParsed(spec.table, spec.file, rowCount))
  }
  return m
}

describe('checkRequiredTables', () => {
  it('passes when every required table is present and non-empty', () => {
    expect(checkRequiredTables(allRequired())).toEqual({ ok: true })
  })

  it('aborts when a required file is missing, naming it', () => {
    const parsed = allRequired()
    parsed.delete('members')
    const result = checkRequiredTables(parsed)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Member.txt missing')
  })

  it('aborts when a required table parsed to zero rows', () => {
    const parsed = allRequired()
    parsed.set('mbr_tasks', mkParsed('mbr_tasks', 'MbrTasks.txt', 0))
    const result = checkRequiredTables(parsed)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('MbrTasks.txt empty')
  })
})

describe('checkShrinkGuard', () => {
  const prev = new Map([
    ['members', 100],
    ['mbr_tasks', 1000],
    ['mbr_achievements', 500],
  ])

  it('guards exactly the surfaces-critical tables', () => {
    expect([...SHRINK_GUARD_TABLES]).toEqual(['members', 'mbr_tasks', 'mbr_achievements'])
  })

  it('aborts on a shrink greater than 40 percent', () => {
    const next = new Map([
      ['members', 59],
      ['mbr_tasks', 1000],
      ['mbr_achievements', 500],
    ])
    const result = checkShrinkGuard(next, prev, false)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('members shrank 100 -> 59')
  })

  it('allows a shrink of exactly 40 percent', () => {
    const next = new Map([
      ['members', 60],
      ['mbr_tasks', 600],
      ['mbr_achievements', 300],
    ])
    expect(checkShrinkGuard(next, prev, false)).toEqual({ ok: true })
  })

  it('force overrides the guard', () => {
    const next = new Map([
      ['members', 1],
      ['mbr_tasks', 1],
      ['mbr_achievements', 1],
    ])
    expect(checkShrinkGuard(next, prev, false).ok).toBe(false)
    expect(checkShrinkGuard(next, prev, true)).toEqual({ ok: true })
  })

  it('does not fire on a first run (no previous counts)', () => {
    expect(checkShrinkGuard(new Map([['members', 5]]), new Map(), false)).toEqual({ ok: true })
  })
})

describe('skipEmptyOptionalTable', () => {
  const optional = TABLES.find(t => !t.required) as TableSpec
  const required = TABLES.find(t => t.required) as TableSpec

  it('treats a present-but-empty non-required file as absent, so live rows survive', () => {
    expect(skipEmptyOptionalTable(optional, 0)).toBe(true)
  })

  it('never skips a non-empty file or a required table (required empties abort instead)', () => {
    expect(skipEmptyOptionalTable(optional, 1)).toBe(false)
    expect(skipEmptyOptionalTable(required, 0)).toBe(false)
    expect(skipEmptyOptionalTable(required, 5)).toBe(false)
  })
})

describe('checkDownloadDateGate', () => {
  const older = new Date('2026-08-01T03:00:00Z')
  const newer = new Date('2026-08-15T03:00:00Z')

  it('aborts when the incoming extract is older than the current dataset', () => {
    const result = checkDownloadDateGate(older, newer, false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('download date regression')
      expect(result.reason).toContain('2026-08-01')
      expect(result.reason).toContain('2026-08-15')
    }
  })

  it('passes for a newer or equal incoming extract', () => {
    expect(checkDownloadDateGate(newer, older, false)).toEqual({ ok: true })
    expect(checkDownloadDateGate(newer, new Date(newer), false)).toEqual({ ok: true })
  })

  it('passes when either side is null (caller warns on a null incoming date)', () => {
    expect(checkDownloadDateGate(null, newer, false)).toEqual({ ok: true })
    expect(checkDownloadDateGate(older, null, false)).toEqual({ ok: true })
  })

  it('force overrides the gate', () => {
    expect(checkDownloadDateGate(older, newer, true)).toEqual({ ok: true })
  })
})

describe('buildInsertStatements', () => {
  it('chunks so no statement exceeds the parameter budget', () => {
    const rows = [
      [1, 'a', true],
      [2, 'b', false],
      [3, 'c', null],
      [4, 'd', true],
      [5, 'e', false],
    ]
    const stmts = buildInsertStatements('t__incoming', ['x', 'y', 'z'], rows, 7)
    // floor(7 / 3) = 2 rows per statement
    expect(stmts.map(s => s.params.length)).toEqual([6, 6, 3])
    expect(stmts[0]?.sql).toBe(
      'INSERT INTO "t__incoming" ("x", "y", "z") VALUES ($1, $2, $3), ($4, $5, $6)',
    )
    expect(stmts[0]?.params).toEqual([1, 'a', true, 2, 'b', false])
    expect(stmts[2]?.sql).toBe('INSERT INTO "t__incoming" ("x", "y", "z") VALUES ($1, $2, $3)')
  })

  it('stays under the Postgres bind limit at the default budget', () => {
    const columns = Array.from({ length: 18 }, (_, i) => `c${i}`)
    const rows = Array.from({ length: 9000 }, () => columns.map(() => 1))
    const stmts = buildInsertStatements('members__incoming', columns, rows)
    expect(stmts.length).toBeGreaterThan(1)
    for (const s of stmts) expect(s.params.length).toBeLessThanOrEqual(MAX_INSERT_PARAMS)
    expect(stmts.reduce((n, s) => n + s.params.length, 0)).toBe(9000 * 18)
  })

  it('serializes Date cells as calendar-date strings so no timezone can shift the day', () => {
    const stmts = buildInsertStatements('t', ['d'], [[new Date(Date.UTC(2005, 2, 15))]])
    expect(stmts[0]?.params).toEqual(['2005-03-15'])
  })

  it('emits nothing for zero rows', () => {
    expect(buildInsertStatements('t', ['a'], [])).toEqual([])
  })
})

describe('staging DDL', () => {
  it('creates the staging table from the live one, indexes included', () => {
    expect(stagingName('members')).toBe('members__incoming')
    expect(createStagingSql('members')).toEqual([
      'DROP TABLE IF EXISTS "members__incoming"',
      'CREATE TABLE "members__incoming" (LIKE "members" INCLUDING ALL)',
    ])
  })
})
