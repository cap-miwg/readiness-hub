import { describe, expect, it } from 'vitest'
import {
  DEMO_ORGIDS,
  DEMO_README_ENTRY,
  DEMO_REFERENCE_DATE,
  generateDemo,
  generateDemoZip,
  type DemoFixture,
} from '../src/seed/generateDemo.js'
import { extractRegistryFiles } from '../src/ingest/zip.js'
import { parseCsvTable, parseDownloadDate, type CellValue, type ParsedTable } from '../src/ingest/parse.js'
import { checkRequiredTables } from '../src/ingest/load.js'
import { buildOrgClosure, UNASSIGNED_ORGID } from '../src/ingest/orgTree.js'
import { TABLES } from '../src/ingest/tables.js'

interface ParsedZip {
  files: Map<string, Buffer>
  skipped: string[]
  parsedByTable: Map<string, ParsedTable>
  parsedByFile: Map<string, ParsedTable>
}

function parseAll(zip: Buffer): ParsedZip {
  const { files, skipped } = extractRegistryFiles(zip)
  const parsedByTable = new Map<string, ParsedTable>()
  const parsedByFile = new Map<string, ParsedTable>()
  for (const spec of TABLES) {
    const buf = files.get(spec.file)
    if (!buf) continue
    const parsed = parseCsvTable(spec, buf)
    parsedByTable.set(parsed.table, parsed)
    parsedByFile.set(spec.file, parsed)
  }
  return { files, skipped, parsedByTable, parsedByFile }
}

function table(z: ParsedZip, file: string): ParsedTable {
  const parsed = z.parsedByFile.get(file)
  if (!parsed) throw new Error(`demo zip lacks ${file}`)
  return parsed
}

function col(parsed: ParsedTable, name: string): number {
  const i = parsed.columns.indexOf(name)
  if (i === -1) throw new Error(`${parsed.file} lacks column ${name}`)
  return i
}

function cell(row: readonly CellValue[], i: number): CellValue {
  return row[i] ?? null
}

const fixture: DemoFixture = generateDemo(42)
const z: ParsedZip = parseAll(fixture.zip)

describe('generateDemo determinism', () => {
  it('same seed produces identical entry lists, row counts, and file contents', () => {
    const again = generateDemo(42)
    expect(again.fileNames).toEqual(fixture.fileNames)
    expect(again.rowCounts).toEqual(fixture.rowCounts)
    expect(again.memberCount).toBe(fixture.memberCount)
    expect(again.mitchellEdgeCapid).toBe(fixture.mitchellEdgeCapid)

    const first = extractRegistryFiles(fixture.zip)
    const second = extractRegistryFiles(again.zip)
    expect([...second.files.keys()].sort()).toEqual([...first.files.keys()].sort())
    for (const [name, buf] of first.files) {
      const other = second.files.get(name)
      expect(other, name).toBeDefined()
      expect(other?.equals(buf), `${name} content drifted between runs`).toBe(true)
    }
  })

  it('a different seed produces different member data', () => {
    const other = parseAll(generateDemoZip(7))
    const a = z.files.get('Member.txt')
    const b = other.files.get('Member.txt')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a?.equals(b as Buffer)).toBe(false)
  })
})

describe('demo zip through the real ingest parse path', () => {
  it('contains every required table, non-empty', () => {
    const gate = checkRequiredTables(z.parsedByTable)
    expect(gate).toEqual({ ok: true })
  })

  it('parses every registered file with zero rejects', () => {
    for (const parsed of z.parsedByFile.values()) {
      expect(parsed.dropped.rejects, `${parsed.file} rejects`).toBe(0)
    }
  })

  it('skips the unregistered readme entry without extracting it', () => {
    expect(z.skipped).toContain(DEMO_README_ENTRY)
    expect(z.files.has(DEMO_README_ENTRY)).toBe(false)
  })

  it('carries the fixed DownLoadDate timestamp', () => {
    const buf = z.files.get('DownLoadDate.txt')
    expect(buf).toBeDefined()
    expect(parseDownloadDate(buf as Buffer)).toEqual(new Date(Date.UTC(2026, 7, 15, 3, 0, 0)))
  })

  it('member rows match the manifest and the allowlist drops the fake SSN column', () => {
    const members = table(z, 'Member.txt')
    expect(members.rows.length).toBe(fixture.memberCount)
    expect(fixture.memberCount).toBeGreaterThanOrEqual(100)
    expect(members.dropped.columns).toContain('SSN')
    expect(members.dropped.columns).toContain('Gender')
    expect(members.columns).not.toContain('ssn')
    for (const row of members.rows) {
      expect(row).not.toContain('000-00-0000')
    }
  })

  it('members are obviously fake: CAPIDs 900000+ and example.org contacts only', () => {
    const members = table(z, 'Member.txt')
    const capidIdx = col(members, 'capid')
    const typeIdx = col(members, 'type')
    const types = new Set<string>()
    for (const row of members.rows) {
      expect(cell(row, capidIdx)).toBeGreaterThanOrEqual(900000)
      types.add(String(cell(row, typeIdx)))
    }
    expect(types).toContain('CADET')
    expect(types).toContain('SENIOR')
    expect(types).toContain('LIFE')

    const contacts = table(z, 'MbrContact.txt')
    const contactIdx = col(contacts, 'contact')
    const dncIdx = col(contacts, 'do_not_contact')
    let dncCount = 0
    for (const row of contacts.rows) {
      expect(String(cell(row, contactIdx))).toMatch(/@example\.org$/)
      if (cell(row, dncIdx) === true) dncCount++
    }
    expect(dncCount).toBe(1)
  })

  it('spreads expirations so some memberships expire within 60 days', () => {
    const members = table(z, 'Member.txt')
    const expIdx = col(members, 'expiration')
    const ref = DEMO_REFERENCE_DATE.getTime()
    const soon = members.rows.filter(row => {
      const d = cell(row, expIdx)
      return d instanceof Date && d.getTime() > ref && d.getTime() <= ref + 60 * 86_400_000
    })
    expect(soon.length).toBeGreaterThanOrEqual(3)
  })
})

describe('demo org tree', () => {
  it('anchors at the demo wing with out-of-tree orgs excluded and the unassigned node attached', () => {
    const orgs = table(z, 'Organization.txt')
    const orgidIdx = col(orgs, 'orgid')
    const nextIdx = col(orgs, 'next_level')
    const treeInput = orgs.rows.map(row => ({
      orgid: cell(row, orgidIdx) as number,
      nextLevel: cell(row, nextIdx) as number | null,
    }))
    const members = table(z, 'Member.txt')
    const homeIdx = col(members, 'orgid')
    const homes = members.rows.map(row => cell(row, homeIdx) as number)

    const tree = buildOrgClosure(treeInput, homes)
    expect(tree.anchorOrgid).toBe(DEMO_ORGIDS.wing)
    for (const orgid of DEMO_ORGIDS.squadrons) expect(tree.subtreeOrgids.has(orgid)).toBe(true)
    expect(tree.subtreeOrgids.has(DEMO_ORGIDS.otherWing)).toBe(false)
    expect(tree.subtreeOrgids.has(DEMO_ORGIDS.strayNational)).toBe(false)
    expect(
      tree.closureRows.some(
        r => r.ancestorOrgid === DEMO_ORGIDS.wing && r.descendantOrgid === UNASSIGNED_ORGID && r.depth === 1,
      ),
    ).toBe(true)
    expect(homes).toContain(DEMO_ORGIDS.missingHome)
  })
})

describe('cadet fixtures', () => {
  it('includes the Mitchell edge cadet: achievements 8 and 9 both approved on distinct dates', () => {
    const aprs = table(z, 'CadetAchvAprs.txt')
    const capidIdx = col(aprs, 'capid')
    const achvIdx = col(aprs, 'cadet_achv_id')
    const statusIdx = col(aprs, 'status')
    const createdIdx = col(aprs, 'date_created')
    const mine = aprs.rows.filter(
      row => cell(row, capidIdx) === fixture.mitchellEdgeCapid && cell(row, statusIdx) === 'APR',
    )
    const byAchv = new Map<number, Date>(
      mine.map(row => [cell(row, achvIdx) as number, cell(row, createdIdx) as Date]),
    )
    expect([...byAchv.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const at8 = byAchv.get(8)
    const at9 = byAchv.get(9)
    expect(at8).toBeInstanceOf(Date)
    expect(at9).toBeInstanceOf(Date)
    expect((at9 as Date).getTime()).toBeGreaterThan((at8 as Date).getTime())

    const ranks = table(z, 'CadetRank.txt')
    const rankRow = ranks.rows.find(row => cell(row, col(ranks, 'capid')) === fixture.mitchellEdgeCapid)
    expect(rankRow).toBeDefined()
    expect(cell(rankRow as CellValue[], col(ranks, 'rank'))).toBe('C/CMSgt')

    const members = table(z, 'Member.txt')
    const memberRow = members.rows.find(
      row => cell(row, col(members, 'capid')) === fixture.mitchellEdgeCapid,
    )
    expect(cell(memberRow as CellValue[], col(members, 'type'))).toBe('CADET')
  })

  it('has HFZ passes inside and outside the 180-day window plus a recent fail, and an ENCAMP activity', () => {
    const hfz = table(z, 'CadetHFZInformation.txt')
    const takenIdx = col(hfz, 'date_taken')
    const passedIdx = col(hfz, 'is_passed')
    const ref = DEMO_REFERENCE_DATE.getTime()
    const within = (row: readonly CellValue[]): boolean => {
      const d = cell(row, takenIdx)
      return d instanceof Date && ref - d.getTime() <= 180 * 86_400_000
    }
    expect(hfz.rows.some(r => cell(r, passedIdx) === true && within(r))).toBe(true)
    expect(hfz.rows.some(r => cell(r, passedIdx) === true && !within(r))).toBe(true)
    expect(hfz.rows.some(r => cell(r, passedIdx) === false && within(r))).toBe(true)

    const activities = table(z, 'CadetActivities.txt')
    const typeIdx = col(activities, 'type')
    const completedIdx = col(activities, 'completed')
    expect(
      activities.rows.some(r => cell(r, typeIdx) === 'ENCAMP' && cell(r, completedIdx) instanceof Date),
    ).toBe(true)
  })
})

describe('ES fixtures', () => {
  it('gives one unit a fieldable ground team (1 GTL + 3 GTM active) and a Skills Evaluator', () => {
    const achv = table(z, 'MbrAchievements.txt')
    const capidIdx = col(achv, 'capid')
    const achvIdx = col(achv, 'achv_id')
    const statusIdx = col(achv, 'status')
    const orgidIdx = col(achv, 'orgid')
    const completedIdx = col(achv, 'completed')
    const inUnit = achv.rows.filter(
      row => cell(row, orgidIdx) === fixture.groundTeamOrgid && cell(row, statusIdx) === 'ACTIVE',
    )
    const gtlHolders = new Set(
      inUnit.filter(r => cell(r, achvIdx) === 69).map(r => cell(r, capidIdx)),
    )
    const gtmHolders = new Set(
      inUnit
        .filter(r => [70, 126, 127].includes(cell(r, achvIdx) as number))
        .map(r => cell(r, capidIdx)),
    )
    expect(gtlHolders.size).toBe(1)
    expect(gtmHolders.size).toBeGreaterThanOrEqual(3)

    // Skills Evaluator: active SET 124 plus an active qual completed 1+ year
    // before the reference date (domain rule in esUnit.ts).
    const evaluator = fixture.skillsEvaluatorCapid
    const evalRows = achv.rows.filter(
      row => cell(row, capidIdx) === evaluator && cell(row, statusIdx) === 'ACTIVE',
    )
    expect(evalRows.some(r => cell(r, achvIdx) === 124)).toBe(true)
    const yearAgo = DEMO_REFERENCE_DATE.getTime() - 365 * 86_400_000
    expect(
      evalRows.some(r => {
        const done = cell(r, completedIdx)
        return cell(r, achvIdx) !== 124 && done instanceof Date && done.getTime() <= yearAgo
      }),
    ).toBe(true)
  })
})

describe('professional learning consistency with the real catalogue', () => {
  it('every member credit row references a real path and task, and completed paths satisfy their groups', () => {
    const paths = table(z, 'PL_Paths.txt')
    const pathIds = new Set(paths.rows.map(r => cell(r, col(paths, 'path_id'))))
    const tasks = table(z, 'PL_Tasks.txt')
    const taskIds = new Set(tasks.rows.map(r => cell(r, col(tasks, 'task_id'))))

    const groups = table(z, 'PL_Groups.txt')
    const groupsByPath = new Map<number, { groupId: number; required: number }[]>()
    for (const r of groups.rows) {
      const pathId = cell(r, col(groups, 'path_id')) as number
      const entry = {
        groupId: cell(r, col(groups, 'group_id')) as number,
        required: cell(r, col(groups, 'number_of_required_tasks')) as number,
      }
      const arr = groupsByPath.get(pathId)
      if (arr) arr.push(entry)
      else groupsByPath.set(pathId, [entry])
    }
    const assignments = table(z, 'PL_TaskGroupAssignments.txt')
    const tasksByGroup = new Map<number, Set<number>>()
    for (const r of assignments.rows) {
      const groupId = cell(r, col(assignments, 'group_id')) as number
      const taskId = cell(r, col(assignments, 'task_id')) as number
      const set = tasksByGroup.get(groupId)
      if (set) set.add(taskId)
      else tasksByGroup.set(groupId, new Set([taskId]))
    }

    const pathCredits = table(z, 'PL_MemberPathCredit.txt')
    const pcPath = col(pathCredits, 'path_id')
    const pcCapid = col(pathCredits, 'capid')
    const pcStatus = col(pathCredits, 'status_id')
    expect(pathCredits.rows.length).toBeGreaterThan(0)
    for (const r of pathCredits.rows) expect(pathIds.has(cell(r, pcPath))).toBe(true)

    const taskCredits = table(z, 'PL_MemberTaskCredit.txt')
    const tcTask = col(taskCredits, 'task_id')
    const tcCapid = col(taskCredits, 'capid')
    const tcStatus = col(taskCredits, 'status_id')
    expect(taskCredits.rows.length).toBeGreaterThan(0)
    const completedTasksByCapid = new Map<number, Set<number>>()
    for (const r of taskCredits.rows) {
      expect(taskIds.has(cell(r, tcTask))).toBe(true)
      if (cell(r, tcStatus) !== 8) continue
      const capid = cell(r, tcCapid) as number
      const set = completedTasksByCapid.get(capid)
      if (set) set.add(cell(r, tcTask) as number)
      else completedTasksByCapid.set(capid, new Set([cell(r, tcTask) as number]))
    }

    // Every completed (StatusID 8) level-path credit is backed by enough
    // completed task credits in each of the path's groups.
    const levelPathIds = new Set(
      paths.rows
        .filter(r => /^Level \d/.test(String(cell(r, col(paths, 'path_name')))))
        .map(r => cell(r, col(paths, 'path_id')) as number),
    )
    let checkedCompletedPaths = 0
    for (const r of pathCredits.rows) {
      if (cell(r, pcStatus) !== 8) continue
      const pathId = cell(r, pcPath) as number
      if (!levelPathIds.has(pathId)) continue
      checkedCompletedPaths++
      const done = completedTasksByCapid.get(cell(r, pcCapid) as number) ?? new Set<number>()
      for (const g of groupsByPath.get(pathId) ?? []) {
        const assigned = tasksByGroup.get(g.groupId) ?? new Set<number>()
        const have = [...assigned].filter(t => done.has(t)).length
        expect(have, `path ${pathId} group ${g.groupId}`).toBeGreaterThanOrEqual(
          Math.min(g.required, assigned.size),
        )
      }
    }
    expect(checkedCompletedPaths).toBeGreaterThan(0)
  })
})
