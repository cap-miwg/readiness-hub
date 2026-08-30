/**
 * Synthetic CAPWATCH demo dataset generator. Produces an in-memory zip that is
 * structurally faithful to a real wing extract (real upstream headers from the
 * 2026-08-29 extract, including non-allowlisted columns like Member.SSN so
 * ingest provably drops them) while every member is obviously fake: CAPIDs
 * 900000+, name-pool names, @example.org contacts. Catalogue/config tables
 * (PL_*, Achievements, Tasks, AchvStep*, CdtAchvEnum) are the real national
 * catalogues from configTables.ts, and generated member credit rows are
 * derived from them so domain rules compute real results. Deterministic:
 * one seeded PRNG, no Math.random, no wall clock; all dates are relative to
 * DEMO_REFERENCE_DATE.
 */
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import { CONFIG_TABLE_TEXT } from './configTables.js'

export const DEMO_SEED_DEFAULT = 42

/** Fixed "today" every generated date hangs off; also the DownLoadDate. */
export const DEMO_REFERENCE_DATE = new Date(Date.UTC(2026, 7, 15))

export const DEMO_README_ENTRY = 'DemoReadme.txt'

export const DEMO_ORGIDS = {
  national: 900001,
  region: 900002,
  wing: 900010,
  group1: 900021,
  group2: 900022,
  squadrons: [900101, 900102, 900103, 900104, 900105, 900106],
  otherWing: 900201,
  strayNational: 900202,
  /** Assigned as a member home org but absent from Organization.txt, so the
   *  member lands under the synthetic UNASSIGNED_ORGID -1 (ingest/orgTree.ts). */
  missingHome: 999999,
} as const

const WING = 'DM'
const REGION = 'GLR'

export interface DemoFixture {
  zip: Buffer
  seed: number
  fileNames: string[]
  rowCounts: Record<string, number>
  memberCount: number
  cadetCount: number
  mitchellEdgeCapid: number
  groundTeamOrgid: number
  skillsEvaluatorCapid: number
  unassignedCapid: number
  doNotContactCapid: number
}

// --- deterministic PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- date and CSV helpers ---

const DAY_MS = 86_400_000

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS)
}

/** MM/DD/YYYY, the padded CAPWATCH date form. */
function fmt(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getUTCFullYear()}`
}

/** Date string `days` relative to the reference date (negative = past). */
function rel(days: number): string {
  return fmt(addDays(DEMO_REFERENCE_DATE, days))
}

type Cell = string | number

/** CAPWATCH shape: plain header row, every data value double-quoted, CRLF. */
function csvFile(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

// --- catalogue access (the real config tables embedded in configTables.ts) ---

function configText(file: string): string {
  const text = CONFIG_TABLE_TEXT[file]
  if (text === undefined) throw new Error(`demo generator: config table missing: ${file}`)
  return text
}

function configRows(file: string): Record<string, string>[] {
  return parse(configText(file), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]
}

function need(row: Record<string, string>, key: string, file: string): string {
  const v = row[key]
  if (v === undefined) throw new Error(`demo generator: ${file} lacks column ${key}`)
  return v
}

interface Catalogue {
  pathIdByName: Map<string, number>
  groupsByPathId: Map<number, { groupId: number; required: number }[]>
  taskIdsByGroupId: Map<number, number[]>
  /** CadetAchvID -> grade string, N/A rows skipped (CdtAchvEnum.txt). */
  cadetRankByAchv: Map<number, string>
  cadetNameByAchv: Map<number, string>
  esStepTaskIdsByAchv: Map<number, number[]>
}

function loadCatalogue(): Catalogue {
  const pathIdByName = new Map<string, number>()
  for (const r of configRows('PL_Paths.txt')) {
    pathIdByName.set(need(r, 'PathName', 'PL_Paths.txt'), Number(need(r, 'PathID', 'PL_Paths.txt')))
  }
  const groupsByPathId = new Map<number, { groupId: number; required: number }[]>()
  for (const r of configRows('PL_Groups.txt')) {
    const pathId = Number(need(r, 'PathID', 'PL_Groups.txt'))
    const entry = {
      groupId: Number(need(r, 'GroupID', 'PL_Groups.txt')),
      required: Number(need(r, 'NumberOfRequiredTasks', 'PL_Groups.txt')),
    }
    const arr = groupsByPathId.get(pathId)
    if (arr) arr.push(entry)
    else groupsByPathId.set(pathId, [entry])
  }
  const taskIdsByGroupId = new Map<number, number[]>()
  for (const r of configRows('PL_TaskGroupAssignments.txt')) {
    const groupId = Number(need(r, 'GroupID', 'PL_TaskGroupAssignments.txt'))
    const taskId = Number(need(r, 'TaskID', 'PL_TaskGroupAssignments.txt'))
    const arr = taskIdsByGroupId.get(groupId)
    if (arr) arr.push(taskId)
    else taskIdsByGroupId.set(groupId, [taskId])
  }
  const cadetRankByAchv = new Map<number, string>()
  const cadetNameByAchv = new Map<number, string>()
  for (const r of configRows('CdtAchvEnum.txt')) {
    const id = Number(need(r, 'CadetAchvID', 'CdtAchvEnum.txt'))
    const rank = need(r, 'Rank', 'CdtAchvEnum.txt')
    cadetNameByAchv.set(id, need(r, 'AchvName', 'CdtAchvEnum.txt'))
    if (rank !== 'N/A') cadetRankByAchv.set(id, rank)
  }
  const esStepTaskIdsByAchv = new Map<number, number[]>()
  for (const r of configRows('AchvStepTasks.txt')) {
    const achvId = Number(need(r, 'AchvID', 'AchvStepTasks.txt'))
    const taskId = Number(need(r, 'TaskID', 'AchvStepTasks.txt'))
    const arr = esStepTaskIdsByAchv.get(achvId)
    if (arr) arr.push(taskId)
    else esStepTaskIdsByAchv.set(achvId, [taskId])
  }
  return {
    pathIdByName,
    groupsByPathId,
    taskIdsByGroupId,
    cadetRankByAchv,
    cadetNameByAchv,
    esStepTaskIdsByAchv,
  }
}

/**
 * Completing a path means completing NumberOfRequiredTasks tasks in each of
 * its groups (the PL model the senior domain computes over); the demo picks
 * the first N assigned tasks of each group so generated credit rows are
 * consistent with the real PL_Groups/PL_TaskGroupAssignments config.
 */
function pathTaskPlan(cat: Catalogue, pathId: number): number[] {
  const out: number[] = []
  for (const g of cat.groupsByPathId.get(pathId) ?? []) {
    const tasks = cat.taskIdsByGroupId.get(g.groupId) ?? []
    const n = Math.min(g.required, tasks.length)
    for (let i = 0; i < n; i++) out.push(tasks[i] as number)
  }
  return out
}

/** The six E&T level paths in completion order (senior domain LEVELS order). */
const LEVEL_PATH_NAMES = [
  'Level 1',
  'Level 2 Part 1',
  'Level 2 Part 2',
  'Level 3',
  'Level 4',
  'Level 5',
] as const

// --- fake identity pools (all names obviously synthetic pairings) ---

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn',
  'Rowan', 'Emerson', 'Skyler', 'Dakota', 'Reese', 'Finley', 'Harper', 'Sage',
  'Peyton', 'Cameron', 'Drew', 'Ellis', 'Hayden', 'Jules', 'Kai', 'Lane',
  'Marlow', 'Noor', 'Oakley', 'Parker', 'Remy', 'Shiloh',
] as const

const LAST_NAMES = [
  'Rivera', 'Chen', 'Okafor', 'Nakamura', 'Ortiz', 'Kowalski', 'Haddad',
  'Lindqvist', 'Mbeki', 'Petrov', 'Alvarez', 'Singh', 'Fontaine', 'Novak',
  'Reyes', 'Kim', 'Diallo', 'Vasquez', 'Larsen', 'Moreau', 'Tanaka', 'Osei',
  'Bergman', 'Castillo', 'Nguyen', 'Farrell', 'Ibarra', 'Sato', 'Weber',
  'Zamora',
] as const

const SENIOR_RANKS = [
  '2d Lt', '1st Lt', 'Capt', 'Maj', 'Lt Col', 'SM',
  'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt',
] as const

// --- ES achievement ids used by the fixture (domain constants esConstants.ts) ---

const ES = {
  GES: 53,
  MS: 55,
  GTL: 69,
  GTM3: 70,
  UDF: 71,
  SET: 124,
  GTM1: 127,
} as const

/** Milestone exam PL TaskIDs (domain constants cadetConstants.ts MILESTONE_EXAM_TASKS). */
const MITCHELL_EXAM_TASKS = { lead: 378, aero: 379 } as const

interface DemoMember {
  capid: number
  first: string
  last: string
  type: 'CADET' | 'SENIOR' | 'LIFE'
  orgid: number
  unit: string
  rank: string
  dobDays: number
  joinedDays: number
  expirationDays: number
  rankDateDays: number
}

interface DemoOrg {
  orgid: number
  region: string
  wing: string
  unit: string
  nextLevel: number | ''
  name: string
  type: string
  scope: string
}

export function generateDemo(seed: number = DEMO_SEED_DEFAULT): DemoFixture {
  const rng = mulberry32(seed === 0 ? 1 : seed)
  const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))
  const cat = loadCatalogue()

  // Deterministic collision-free name assignment: shuffle the full pool once.
  const namePool: { first: string; last: string }[] = []
  for (const f of FIRST_NAMES) for (const l of LAST_NAMES) namePool.push({ first: f, last: l })
  for (let i = namePool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = namePool[i] as { first: string; last: string }
    namePool[i] = namePool[j] as { first: string; last: string }
    namePool[j] = a
  }
  let nameIdx = 0
  const nextName = (): { first: string; last: string } =>
    namePool[nameIdx++] as { first: string; last: string }

  const O = DEMO_ORGIDS

  const orgs: DemoOrg[] = [
    { orgid: O.national, region: '', wing: '', unit: '000', nextLevel: '', name: 'DEMO NATIONAL HEADQUARTERS', type: 'National', scope: 'NATIONAL' },
    { orgid: O.region, region: REGION, wing: '', unit: '001', nextLevel: O.national, name: 'DEMO GREAT LAKES REGION', type: 'Region', scope: 'REGION' },
    { orgid: O.wing, region: REGION, wing: WING, unit: '001', nextLevel: O.region, name: 'DEMO WING', type: 'Wing', scope: 'WING' },
    { orgid: O.group1, region: REGION, wing: WING, unit: '701', nextLevel: O.wing, name: 'DEMO GROUP 701', type: 'Group', scope: 'GROUP' },
    { orgid: O.group2, region: REGION, wing: WING, unit: '702', nextLevel: O.wing, name: 'DEMO GROUP 702', type: 'Group', scope: 'GROUP' },
    // Out-of-anchor-subtree orgs: exercise the LCA anchor derivation. No demo
    // member homes here, otherwise the anchor would climb to national.
    { orgid: O.otherWing, region: 'NER', wing: 'XD', unit: '001', nextLevel: O.national, name: 'DEMO OTHER WING', type: 'Wing', scope: 'WING' },
    { orgid: O.strayNational, region: '', wing: '', unit: '999', nextLevel: '', name: 'DEMO NATIONAL ACTIVITY', type: 'Activity', scope: 'NATIONAL' },
  ]
  const squadronUnits = ['101', '102', '103', '104', '105', '106'] as const
  O.squadrons.forEach((orgid, i) => {
    orgs.push({
      orgid,
      region: REGION,
      wing: WING,
      unit: squadronUnits[i] as string,
      nextLevel: i < 3 ? O.group1 : O.group2,
      name: `DEMO COMPOSITE SQUADRON ${squadronUnits[i]}`,
      type: 'Composite Squadron',
      scope: 'UNIT',
    })
  })
  const unitByOrgid = new Map<number, string>(orgs.map(o => [o.orgid, o.unit]))

  // --- members ---
  const members: DemoMember[] = []
  let capidCounter = 900001

  function mkMember(
    type: DemoMember['type'],
    orgid: number,
    rank: string,
    ageYears: number,
  ): DemoMember {
    const { first, last } = nextName()
    const capid = capidCounter++
    const dobDays = ageYears * 365 + int(0, 300)
    const joinedDays =
      type === 'CADET'
        ? Math.max(30, Math.min(int(120, 2000), dobDays - 12 * 365))
        : int(365, 20 * 365)
    // Every 15th member's expiration lands inside 60 days so renewal tiles
    // always have data.
    const expirationDays = members.length % 15 === 7 ? int(5, 55) : int(61, 700)
    const rankDateDays = Math.min(int(30, 1200), joinedDays)
    const m: DemoMember = {
      capid, first, last, type, orgid,
      unit: unitByOrgid.get(orgid) ?? '000',
      rank, dobDays, joinedDays, expirationDays, rankDateDays,
    }
    members.push(m)
    return m
  }

  const seniorRank = (): string => SENIOR_RANKS[int(0, SENIOR_RANKS.length - 1)] as string

  // Wing HQ staff.
  const wingCC = mkMember('SENIOR', O.wing, 'Col', int(45, 60))
  const wingCV = mkMember('SENIOR', O.wing, 'Lt Col', int(40, 60))
  const wingDC = mkMember('SENIOR', O.wing, 'Maj', int(35, 60)) // Director of Communications
  const wingIT = mkMember('SENIOR', O.wing, 'Capt', int(30, 55))
  const wingNCO = mkMember('SENIOR', O.wing, 'SMSgt', int(35, 60))
  const wingExtras: DemoMember[] = []
  for (let i = 0; i < 5; i++) wingExtras.push(mkMember('SENIOR', O.wing, seniorRank(), int(25, 70)))
  mkMember('LIFE', O.wing, 'Col', int(55, 70))
  mkMember('LIFE', O.wing, 'Lt Col', int(55, 70))

  // Group staff.
  const groupCCs = [
    mkMember('SENIOR', O.group1, 'Lt Col', int(40, 65)),
    mkMember('SENIOR', O.group2, 'Maj', int(40, 65)),
  ]
  mkMember('SENIOR', O.group1, seniorRank(), int(25, 70))
  mkMember('SENIOR', O.group2, seniorRank(), int(25, 70))

  // Squadrons: 7 seniors (first is commander) + 10 cadets each.
  const squadronCCs: DemoMember[] = []
  const squadronSeniors = new Map<number, DemoMember[]>()
  const cadets: DemoMember[] = []
  for (const orgid of O.squadrons) {
    const cc = mkMember('SENIOR', orgid, 'Capt', int(30, 60))
    squadronCCs.push(cc)
    const staff: DemoMember[] = [cc]
    for (let i = 0; i < 6; i++) {
      staff.push(mkMember(i === 5 ? 'LIFE' : 'SENIOR', orgid, seniorRank(), int(25, 70)))
    }
    squadronSeniors.set(orgid, staff)
    for (let i = 0; i < 10; i++) {
      cadets.push(mkMember('CADET', orgid, 'C/AB', int(12, 19)))
    }
  }

  // A member whose home org is not in Organization.txt: rides the synthetic
  // UNASSIGNED_ORGID -1 closure attachment.
  const unassigned = mkMember('SENIOR', O.missingHome, 'Maj', int(35, 60))

  // --- table row buffers ---
  const memberRows: Cell[][] = []
  const orgRows: Cell[][] = []
  const mbrContactRows: Cell[][] = []
  const dutyRows: Cell[][] = []
  const cadetDutyRows: Cell[][] = []
  const mbrAchvRows: Cell[][] = []
  const mbrTaskRows: Cell[][] = []
  const cadetAchvRows: Cell[][] = []
  const cadetAprsRows: Cell[][] = []
  const cadetFullRows: Cell[][] = []
  const cadetActivityRows: Cell[][] = []
  const hfzRows: Cell[][] = []
  const cadetRankRows: Cell[][] = []
  const cadetPhaseRows: Cell[][] = []
  const cadetAwardRows: Cell[][] = []
  const seniorLevelRows: Cell[][] = []
  const seniorAwardRows: Cell[][] = []
  const specTrackRows: Cell[][] = []
  const trainingRows: Cell[][] = []
  const oFlightRows: Cell[][] = []
  const committeeRows: Cell[][] = []
  const orgStatRows: Cell[][] = []
  const commanderRows: Cell[][] = []
  const orgContactRows: Cell[][] = []
  const pathCreditRows: Cell[][] = []
  const taskCreditRows: Cell[][] = []
  const volURows: Cell[][] = []

  const MOD = rel(-3)

  // --- organizations ---
  for (const o of orgs) {
    orgRows.push([
      o.orgid, o.region, o.wing, o.unit, o.nextLevel, o.name, o.type,
      '06/01/1995', 'ACTIVE', o.scope, 'demo', MOD, 'demo', '06/01/1995', '', '',
    ])
  }

  // --- cadet progression ---
  let hfzCounter = 500001
  let awardCounter = 90001
  let pathCreditCounter = 700001
  let taskCreditCounter = 800001
  const email = (m: DemoMember): string =>
    `${m.first}.${m.last}.${m.capid}@example.org`.toLowerCase()

  interface CadetPlan { member: DemoMember; depth: number; aprDays: number[] }
  const cadetPlans: CadetPlan[] = []
  cadets.forEach((m, i) => {
    // Fixed fixtures first: the Mitchell edge (8 and 9 both C/CMSgt, TIG must
    // run from 9's approval), a Mitchell recipient, a Wright Brothers cadet,
    // and a Phase IV cadet; the rest skew low like a real unit.
    const depth =
      i === 0 ? 9 : i === 1 ? 10 : i === 2 ? 4 : i === 3 ? 15 : Math.floor(rng() * rng() * 8)
    const aprDays: number[] = []
    let day = -int(30, 200)
    for (let k = depth; k >= 1; k--) {
      aprDays[k - 1] = day
      day -= int(60, 120)
    }
    cadetPlans.push({ member: m, depth, aprDays })
  })
  const mitchellEdge = (cadetPlans[0] as CadetPlan).member

  const rankForDepth = (depth: number): { rank: string; achv: number } => {
    let rank = 'C/AB'
    let achv = 0
    for (let i = 1; i <= depth; i++) {
      const r = cat.cadetRankByAchv.get(i)
      if (r !== undefined) {
        rank = r
        achv = i
      }
    }
    return { rank, achv }
  }

  for (const [idx, plan] of cadetPlans.entries()) {
    const m = plan.member
    const { rank, achv: rankAchv } = rankForDepth(plan.depth)
    m.rank = rank
    if (rankAchv > 0) m.rankDateDays = -(plan.aprDays[rankAchv - 1] as number)
    cadetRankRows.push([m.capid, rank, rel(-m.rankDateDays), '', 'demo', MOD, 'demo', rel(-m.rankDateDays)])

    for (let a = 1; a <= plan.depth; a++) {
      const aprDay = plan.aprDays[a - 1] as number
      const milestone = a === 4 || a === 10 || a === 14 || a === 20 || a === 21
      cadetAprsRows.push([
        m.capid, a, 'APR', wingCC.capid, '', milestone ? String(awardCounter++) : '0',
        '', 'demo', rel(aprDay), 'demo', rel(aprDay), '',
      ])
      const hfzId = hfzCounter++
      hfzRows.push([
        hfzId, m.capid, rel(aprDay - 20), m.orgid, 'True', '',
        '45', '', 'True', '', '', '', '30', '', 'True', '25', '', 'True', '12', '', 'True',
      ])
      cadetAchvRows.push([
        m.capid, a, rel(aprDay - 20), rel(aprDay - 15), '85', rel(aprDay - 12), '82', '', 'O',
        rel(aprDay - 10), 'True', '', '', 'demo', rel(aprDay), 'demo', rel(aprDay - 30),
        a <= 10 ? rel(aprDay - 8) : '', a <= 10 ? '90' : '', '', 'True', '',
        '', '', '', '', '', hfzId, '', '', '', '', '', '',
      ])
      const name = cat.cadetNameByAchv.get(a) ?? `Achievement ${a}`
      cadetFullRows.push([m.capid, name, rel(aprDay), '', '', ''])
    }

    // In-progress next achievement: a partially dated CadetAchv row, and for
    // some cadets a PENDING approval row.
    if (plan.depth < 21) {
      const nextA = plan.depth + 1
      cadetAchvRows.push([
        m.capid, nextA, rel(-int(5, 25)), '', '', '', '', '', '', '', '', '', '',
        'demo', MOD, 'demo', rel(-int(5, 25)), '', '', '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '',
      ])
      if (plan.depth >= 2 && rng() < 0.25) {
        cadetAprsRows.push([m.capid, nextA, 'PENDING', '', '', '0', '', 'demo', MOD, 'demo', MOD, ''])
      }
    }

    // HFZ currency spread: stale passes and recent fails alongside the
    // per-achievement passes (HFZ credit window is 180 days).
    if (idx % 5 === 1) {
      hfzRows.push([
        hfzCounter++, m.capid, rel(-int(200, 400)), m.orgid, 'True', '',
        '40', '', 'True', '', '', '', '28', '', 'True', '22', '', 'True', '11', '', 'True',
      ])
    } else if (idx % 5 === 3) {
      hfzRows.push([
        hfzCounter++, m.capid, rel(-int(20, 170)), m.orgid, 'False', '',
        '20', '', 'False', '', '', '', '12', '', 'False', '8', '', 'False', '4', '', 'True',
      ])
    } else if (plan.depth > 0) {
      hfzRows.push([
        hfzCounter++, m.capid, rel(-int(20, 170)), m.orgid, 'True', '',
        '48', '', 'True', '', '', '', '32', '', 'True', '26', '', 'True', '13', '', 'True',
      ])
    }

    // Milestone awards and encampment/CLS activity credit.
    if (plan.depth >= 4) {
      cadetAwardRows.push([m.capid, 'Wright Brothers', String(awardCounter++), rel(plan.aprDays[3] as number), 'demo', MOD])
      cadetPhaseRows.push([m.capid, 'PHASE I', rel(plan.aprDays[3] as number), 'demo', MOD])
    }
    if (plan.depth >= 10) {
      cadetAwardRows.push([m.capid, 'Billy Mitchell', String(awardCounter++), rel(plan.aprDays[9] as number), 'demo', MOD])
      cadetPhaseRows.push([m.capid, 'PHASE II', rel(plan.aprDays[9] as number), 'demo', MOD])
    }
    if (plan.depth >= 14) {
      cadetAwardRows.push([m.capid, 'Amelia Earhart', String(awardCounter++), rel(plan.aprDays[13] as number), 'demo', MOD])
      cadetPhaseRows.push([m.capid, 'PHASE III', rel(plan.aprDays[13] as number), 'demo', MOD])
    }
    if (plan.depth >= 9) {
      cadetActivityRows.push([m.capid, 'ENCAMP', 'DEMO ENCAMPMENT', rel((plan.aprDays[8] as number) - 30), 'demo', MOD])
    }
    if (plan.depth >= 15) {
      cadetActivityRows.push([m.capid, 'COS', 'DEMO COS', rel((plan.aprDays[14] as number) - 10), 'demo', MOD])
    }
    if (idx % 4 === 2) {
      cadetActivityRows.push([m.capid, 'NCSA', 'DEMO ACTIVITY', rel(-int(100, 500)), 'demo', MOD])
    }

    // O-flights for younger cadets.
    if (idx % 3 === 0) {
      const flights = int(1, 3)
      for (let f = 1; f <= flights; f++) {
        oFlightRows.push([
          m.capid, WING, m.unit, '0', String(f), 'P', rel(-int(30, 400)), rel(-int(1, 29)),
          '', 'N900DM', '0.8', 'demo', MOD, '',
        ])
      }
    }
  }

  // Mitchell edge extras: honor credit on the Achievement 8 path plus both
  // Mitchell exam task credits, so the promotion panel shows a live edge case.
  const achv8Path = cat.pathIdByName.get('Achievement 8')
  if (achv8Path !== undefined) {
    pathCreditRows.push([
      pathCreditCounter++, achv8Path, mitchellEdge.capid, 8,
      rel((cadetPlans[0] as CadetPlan).aprDays[7] as number), '',
      '{ CreditEarned: true, EarnedDate: 2026-03-01 }',
    ])
  }
  taskCreditRows.push([taskCreditCounter++, MITCHELL_EXAM_TASKS.lead, mitchellEdge.capid, 8, rel(-20), '', '', ''])
  taskCreditRows.push([taskCreditCounter++, MITCHELL_EXAM_TASKS.aero, mitchellEdge.capid, 8, rel(-15), '', '', ''])

  // --- senior professional learning, consistent with the real PL config ---
  const seniors = members.filter(m => m.type !== 'CADET')
  const levelPathIds = LEVEL_PATH_NAMES.map(name => {
    const id = cat.pathIdByName.get(name)
    if (id === undefined) throw new Error(`demo generator: PL_Paths.txt lacks path ${name}`)
    return id
  })

  seniors.forEach((m, i) => {
    // A few legacy-only members: SeniorLevel awards, no PL credit rows. The
    // first carries the full LV1..LV5 ladder so every legacy level appears.
    if (i % 17 === 5) {
      const lv = i === 5 ? 5 : int(1, 4)
      for (let n = 1; n <= lv; n++) {
        seniorLevelRows.push([m.capid, `LV${n}`, rel(-(2200 - n * 300)), 'demo', MOD, 'demo', rel(-(2200 - n * 300)), String(600000 + i * 10 + n)])
      }
      return
    }
    const isCC = m === wingCC
    const completed = isCC ? 6 : Math.min(Math.floor(rng() * rng() * 7), 6)
    for (let n = 0; n < completed; n++) {
      const pathId = levelPathIds[n] as number
      const doneDay = -(completed - n) * 250 - int(0, 120)
      pathCreditRows.push([pathCreditCounter++, pathId, m.capid, 8, rel(doneDay), '', ''])
      for (const taskId of pathTaskPlan(cat, pathId)) {
        taskCreditRows.push([taskCreditCounter++, taskId, m.capid, 8, rel(doneDay - int(1, 90)), '', '', ''])
      }
    }
    // One in-progress path: pending credit and half the task plan complete.
    if (completed < 6 && i % 4 === 1) {
      const pathId = levelPathIds[completed] as number
      pathCreditRows.push([pathCreditCounter++, pathId, m.capid, 26, '', '', ''])
      const plan = pathTaskPlan(cat, pathId)
      for (const taskId of plan.slice(0, Math.ceil(plan.length / 2))) {
        taskCreditRows.push([taskCreditCounter++, taskId, m.capid, 8, rel(-int(5, 200)), '', '', ''])
      }
    }
    if (completed >= 4) {
      seniorAwardRows.push([m.capid, 'Paul E. Garber', String(awardCounter++), rel(-int(200, 900)), 'demo', MOD])
    }
    const tracks = ['INFORMATION TECHNOLOGY OFFICER', 'CADET PROGRAMS', 'COMMUNICATIONS', 'EMERGENCY SERVICES', 'AEROSPACE EDUCATION'] as const
    if (i % 2 === 0) {
      specTrackRows.push([
        m.capid, tracks[i % tracks.length] as string,
        (['TECHNICIAN', 'SENIOR', 'MASTER'] as const)[i % 3] as string,
        'Training', rel(-int(100, 1500)), 'demo', MOD,
      ])
    }
    if (i % 3 === 0) {
      trainingRows.push([m.capid, (['SLS', 'TLC', 'UCC'] as const)[i % 3] as string, 'Classroom', String(1000 + i), rel(-int(100, 1500)), 'demo', MOD])
    }
  })

  // --- duty positions ---
  function duty(m: DemoMember, title: string, functArea: string, lvl: string, asst: 0 | 1, orgid: number): void {
    dutyRows.push([m.capid, title, functArea, lvl, asst, 'demo', MOD, orgid])
  }
  duty(wingCC, 'Commander', 'CC', 'WING', 0, O.wing)
  duty(wingCV, 'Vice Commander', 'CV', 'WING', 0, O.wing)
  duty(wingDC, 'Director of Communications', 'DC', 'WING', 0, O.wing)
  duty(wingIT, 'Director of Information Technology', 'IT', 'WING', 0, O.wing)
  duty(wingNCO, 'Command NCO', 'CC', 'WING', 0, O.wing)
  const extraAsst = wingExtras[0]
  if (extraAsst) duty(extraAsst, 'Director of Communications', 'DC', 'WING', 1, O.wing)
  groupCCs.forEach((m, i) => duty(m, 'Commander', 'CC', 'GROUP', 0, i === 0 ? O.group1 : O.group2))
  squadronCCs.forEach(m => duty(m, 'Commander', 'CC', 'UNIT', 0, m.orgid))
  for (const orgid of O.squadrons) {
    const staff = squadronSeniors.get(orgid) ?? []
    const [, s1, s2, s3] = staff
    if (s1) duty(s1, 'Deputy Commander for Cadets', 'CP', 'UNIT', 0, orgid)
    if (s2) duty(s2, 'Communications Officer', 'DC', 'UNIT', 0, orgid)
    if (s3) duty(s3, 'Aerospace Education Officer', 'AE', 'UNIT', 0, orgid)
  }
  // Cadet staff, including the third comms duty title.
  cadetPlans.forEach((plan, i) => {
    if (plan.depth >= 8 && i % 2 === 0) {
      cadetDutyRows.push([plan.member.capid, 'Cadet Commander', 'CP', 'UNIT', 0, 'demo', MOD, plan.member.orgid])
    } else if (plan.depth >= 4 && i % 3 === 1) {
      cadetDutyRows.push([plan.member.capid, 'Cadet Communications Officer', 'DC', 'UNIT', 0, 'demo', MOD, plan.member.orgid])
    } else if (plan.depth >= 2 && i % 3 === 2) {
      cadetDutyRows.push([plan.member.capid, 'Cadet First Sergeant', 'CP', 'UNIT', 1, 'demo', MOD, plan.member.orgid])
    }
  })

  // --- commanders mirror table ---
  const orgOf = new Map<number, DemoOrg>(orgs.map(o => [o.orgid, o]))
  function commanderRow(m: DemoMember, orgid: number): void {
    const o = orgOf.get(orgid)
    commanderRows.push([
      orgid, o?.region ?? '', o?.wing ?? '', o?.unit ?? '', m.capid, rel(-int(100, 900)),
      'demo', MOD, m.last, m.first, '', '', m.rank,
    ])
  }
  commanderRow(wingCC, O.wing)
  groupCCs.forEach((m, i) => commanderRow(m, i === 0 ? O.group1 : O.group2))
  squadronCCs.forEach(m => commanderRow(m, m.orgid))

  // --- ES qualifications: one fieldable ground team and one Skills Evaluator ---
  const groundTeamOrgid = O.squadrons[0] as number
  const gtStaff = squadronSeniors.get(groundTeamOrgid) ?? []
  const [, gtl, gtm1, gtm2, gtm3] = gtStaff
  if (!gtl || !gtm1 || !gtm2 || !gtm3) throw new Error('demo generator: ground team staff underflow')

  function esQual(
    m: DemoMember,
    achvId: number,
    status: string,
    completedDay: number,
    expirationDay: number | '',
  ): void {
    mbrAchvRows.push([
      m.capid, achvId, status, rel(completedDay - 400), rel(completedDay),
      expirationDay === '' ? '' : rel(expirationDay),
      wingCC.capid, '', rel(completedDay), 'demo', String(300000 + mbrAchvRows.length),
      'demo', rel(completedDay), 'demo', MOD, m.orgid,
    ])
  }

  // GTL held for 2 years + active SET: this member is the Skills Evaluator
  // (SET 124 plus a qual completed 1+ year before the reference date).
  esQual(gtl, ES.GTL, 'ACTIVE', -730, 365)
  esQual(gtl, ES.SET, 'ACTIVE', -400, 700)
  esQual(gtl, ES.GES, 'ACTIVE', -900, '')
  esQual(gtm1, ES.GTM3, 'ACTIVE', -300, 400)
  esQual(gtm2, ES.GTM3, 'ACTIVE', -250, 500)
  esQual(gtm3, ES.GTM1, 'ACTIVE', -220, 40) // expires inside 90 days
  const gtTrainee = gtStaff[5]
  if (gtTrainee) esQual(gtTrainee, ES.GTM3, 'TRAINING', -60, '')
  esQual(wingDC, ES.UDF, 'EXPIRED', -1200, -100)
  esQual(unassigned, ES.MS, 'ACTIVE', -500, 300)

  seniors.forEach((m, i) => {
    if (i % 5 < 2) esQual(m, ES.GES, 'ACTIVE', -int(100, 1500), '')
  })

  // ES task progress for the GTM trainee, from the real AchvStepTasks steps.
  const gtmTaskIds = (cat.esStepTaskIdsByAchv.get(ES.GTM3) ?? []).slice(0, 4)
  gtmTaskIds.forEach((taskId, i) => {
    if (!gtTrainee) return
    mbrTaskRows.push([
      gtTrainee.capid, taskId, String(400000 + i), 'ACTIVE', rel(-70 - i * 5), rel(-70 - i * 5), '',
      gtl.capid, '', rel(-70 - i * 5), 'demo', String(410000 + i), 'demo', rel(-70 - i * 5),
      'demo', MOD, gtl.capid, '', '', '', gtTrainee.orgid, '',
    ])
  })

  // --- contacts ---
  members.forEach((m, i) => {
    mbrContactRows.push([
      m.capid, 'EMAIL', 'PRIMARY', email(m), 'demo', MOD,
      i === 10 ? 'True' : 'False', '',
    ])
    if (m.type === 'CADET' && i % 3 === 0) {
      mbrContactRows.push([m.capid, 'CADET PARENT EMAIL', 'PRIMARY', `parent.${m.capid}@example.org`, 'demo', MOD, 'False', ''])
    }
  })
  const doNotContact = members[10] as DemoMember

  // --- org contacts, committees, VolU instructors ---
  for (const o of orgs) {
    if (o.scope === 'UNIT' || o.scope === 'WING') {
      orgContactRows.push([o.orgid, o.wing, o.unit, 'EMAIL', 'PRIMARY', `unit.${o.unit}@example.org`, 'demo', MOD])
    }
  }
  committeeRows.push([wingCV.capid, 'DEMO CONFERENCE COMMITTEE', 'True', O.wing, rel(-200)])
  committeeRows.push([wingIT.capid, 'DEMO CONFERENCE COMMITTEE', 'False', O.wing, rel(-200)])
  volURows.push([`${wingCV.first} ${wingCV.last}`, wingCV.capid, REGION, WING, '001', 'Instructor', 'Volunteer University', 'Level 4', ])
  volURows.push([`${wingCC.first} ${wingCC.last}`, wingCC.capid, REGION, WING, '001', 'Senior Instructor', 'Volunteer University', 'Level 5', ])

  // --- org statistics: four month-end TOTAL snapshots per org ---
  const statOrgs = [O.wing, ...O.squadrons]
  for (let k = 1; k <= 4; k++) {
    const monthEnd = new Date(Date.UTC(
      DEMO_REFERENCE_DATE.getUTCFullYear(),
      DEMO_REFERENCE_DATE.getUTCMonth() - k + 1,
      0,
    ))
    for (const orgid of statOrgs) {
      const o = orgOf.get(orgid)
      const inOrg = members.filter(m => m.orgid === orgid)
      const cadetsHere = inOrg.filter(m => m.type === 'CADET').length
      const seniorsHere = inOrg.length - cadetsHere
      orgStatRows.push([orgid, REGION, WING, o?.unit ?? '', 'CADET', 'TOTAL', Math.max(0, cadetsHere - (k % 2)), fmt(monthEnd)])
      orgStatRows.push([orgid, REGION, WING, o?.unit ?? '', 'SENIOR', 'TOTAL', Math.max(0, seniorsHere - (k > 2 ? 1 : 0)), fmt(monthEnd)])
    }
  }

  // --- Member.txt: real upstream header including allowlist-dropped columns
  // (SSN, Gender, ...) with obviously fake filler, proving parse drops them ---
  for (const m of members) {
    memberRows.push([
      m.capid, '000-00-0000', m.last, m.first, '', '', '', rel(-m.dobDays), '', '', '',
      m.orgid, WING, m.unit, m.rank, rel(-m.joinedDays), rel(m.expirationDays), rel(-m.joinedDays),
      'demo', MOD, '', m.type, rel(-m.rankDateDays), REGION, 'ACTIVE', '', '', '', '',
    ])
  }

  // --- assemble the zip ---
  const files = new Map<string, string>()
  const rowCounts: Record<string, number> = {}
  const put = (name: string, header: readonly string[], rows: readonly (readonly Cell[])[]): void => {
    files.set(name, csvFile(header, rows))
    rowCounts[name] = rows.length
  }

  put('Member.txt', ['CAPID', 'SSN', 'NameLast', 'NameFirst', 'NameMiddle', 'NameSuffix', 'Gender', 'DOB', 'Profession', 'EducationLevel', 'Citizen', 'ORGID', 'Wing', 'Unit', 'Rank', 'Joined', 'Expiration', 'OrgJoined', 'UsrID', 'DateMod', 'LSCode', 'Type', 'RankDate', 'Region', 'MbrStatus', 'PicStatus', 'PicDate', 'CdtWaiver', 'Ethnicity'], memberRows)
  put('Organization.txt', ['ORGID', 'Region', 'Wing', 'Unit', 'NextLevel', 'Name', 'Type', 'DateChartered', 'Status', 'Scope', 'UsrID', 'DateMod', 'FirstUsr', 'DateCreated', 'DateReceived', 'OrgNotes'], orgRows)
  put('MbrContact.txt', ['CAPID', 'Type', 'Priority', 'Contact', 'UsrID', 'DateMod', 'DoNotContact', 'ContactName'], mbrContactRows)
  put('DutyPosition.txt', ['CAPID', 'Duty', 'FunctArea', 'Lvl', 'Asst', 'UsrID', 'DateMod', 'ORGID'], dutyRows)
  put('CadetDutyPositions.txt', ['CAPID', 'Duty', 'FunctArea', 'Lvl', 'Asst', 'UsrID', 'DateMod', 'ORGID'], cadetDutyRows)
  put('MbrAchievements.txt', ['CAPID', 'AchvID', 'Status', 'OriginallyAccomplished', 'Completed', 'Expiration', 'AuthByCAPID', 'AuthReason', 'AuthDate', 'Source', 'RecID', 'FirstUsr', 'DateCreated', 'UsrID', 'DateMod', 'ORGID'], mbrAchvRows)
  put('MbrTasks.txt', ['CAPID', 'TaskID', 'ID', 'Status', 'OriginallyAccomplished', 'Completed', 'Expiration', 'AuthByCAPID', 'AuthReason', 'AuthDate', 'Source', 'RecID', 'FirstUsr', 'DateCreated', 'UsrID', 'DateMod', 'EvalCAPID', 'MissionID', 'CertID', 'CheckPilot', 'ORGID', 'AircraftType'], mbrTaskRows)
  put('CadetAchv.txt', ['CAPID', 'CadetAchvID', 'PhyFitTest', 'LeadLabDateP', 'LeadLabScore', 'AEDateP', 'AEScore', 'AEMod', 'AETest', 'MoralLDateP', 'ActivePart', 'OtherReq', 'SDAReport', 'UsrID', 'DateMod', 'FirstUsr', 'DateCreated', 'DrillDate', 'DrillScore', 'LeadCurr', 'CadetOath', 'AEBookValue', 'MileRun', 'ShuttleRun', 'SitAndReach', 'PushUps', 'CurlUps', 'HFZID', 'StaffServiceDate', 'TechnicalWritingAssignment', 'TechnicalWritingAssignmentDate', 'OralPresentationDate', 'SpeechDate', 'LeadershipEssayDate'], cadetAchvRows)
  put('CadetAchvAprs.txt', ['CAPID', 'CadetAchvID', 'Status', 'AprCAPID', 'DspReason', 'AwardNo', 'JROTCWaiver', 'UsrID', 'DateMod', 'FirstUsr', 'DateCreated', 'PrintedCert'], cadetAprsRows)
  put('CadetAchvFullReport.txt', ['CAPID', 'AchvName', 'AprDate', 'PhyFitTest', 'LeadLabDateP', 'LeadLabScore'], cadetFullRows)
  put('CadetActivities.txt', ['CAPID', 'Type', 'Location', 'Completed', 'UsrID', 'DateMod'], cadetActivityRows)
  put('CadetHFZInformation.txt', ['HFZID', 'CAPID', 'DateTaken', 'ORGID', 'IsPassed', 'WeatherWaiver', 'PacerRun', 'PacerRunWaiver', 'PacerRunPassed', 'MileRun', 'MileRunWaiver', 'MileRunPassed', 'CurlUp', 'CurlUpWaiver', 'CurlUpPassed', 'PushUp', 'PushUpWaiver', 'PushUpPassed', 'SitAndReach', 'SitAndReachWaiver', 'SitAndReachPassed'], hfzRows)
  put('CadetRank.txt', ['CAPID', 'Rank', 'RankDate', 'Waiver', 'UsrID', 'DateMod', 'FirstUsr', 'DateCreated'], cadetRankRows)
  put('CadetPhase.txt', ['CAPID', 'Type', 'Completed', 'UsrID', 'DateMod'], cadetPhaseRows)
  put('CadetAwards.txt', ['CAPID', 'Award', 'AwardNo', 'Completed', 'UsrID', 'DateMod'], cadetAwardRows)
  put('SeniorLevel.txt', ['CAPID', 'Lvl', 'Completed', 'UsrID', 'DateMod', 'FirstUsr', 'DateCreated', 'RecID'], seniorLevelRows)
  put('SeniorAwards.txt', ['CAPID', 'Award', 'AwardNo', 'Completed', 'UsrID', 'DateMod'], seniorAwardRows)
  put('SpecTrack.txt', ['CAPID', 'Track', 'TrackLevel', 'HowComplete', 'Completed', 'UsrID', 'DateMod'], specTrackRows)
  put('Training.txt', ['CAPID', 'TypeCrs', 'HowComplete', 'CrsID', 'Completed', 'UsrID', 'DateMod'], trainingRows)
  put('OFlight.txt', ['CAPID', 'Wing', 'Unit', 'Amount', 'Syllabus', 'Type', 'FltDate', 'TransDate', 'FltRlsNum', 'AcftTailNum', 'FltTime', 'LstUsr', 'LstDateMod', 'Comments'], oFlightRows)
  put('MbrCommittee.txt', ['CAPID', 'Committee', 'Chair', 'ORGID', 'DateAssigned'], committeeRows)
  put('ORGStatistics.txt', ['ORGID', 'Region', 'Wing', 'Unit', 'MbrType', 'CntType', 'Quantity', 'CntDate'], orgStatRows)
  put('Commanders.txt', ['ORGID', 'Region', 'Wing', 'Unit', 'CAPID', 'DateAsg', 'UsrID', 'DateMod', 'NameLast', 'NameFirst', 'NameMiddle', 'NameSuffix', 'Rank'], commanderRows)
  put('OrgContact.txt', ['ORGID', 'Wing', 'Unit', 'Type', 'Priority', 'Contact', 'UsrID', 'DateMod'], orgContactRows)
  put('PL_MemberPathCredit.txt', ['MemberPathCreditID', 'PathID', 'CAPID', 'StatusID', 'Completed', 'Expiration', 'ExtraCreditEarned'], pathCreditRows)
  put('PL_MemberTaskCredit.txt', ['MemberTaskCreditID', 'TaskID', 'CAPID', 'StatusID', 'Completed', 'Expiration', 'Comments', 'AdditionalOptions'], taskCreditRows)
  put('PL_VolUInstructors.txt', ['FullName', 'CAPID', 'Region', 'Wing', 'Unit', 'InstructorType', 'Category', 'PathName'], volURows)

  // Real catalogue/config tables, verbatim.
  for (const [name, text] of Object.entries(CONFIG_TABLE_TEXT)) files.set(name, text)

  files.set('DownLoadDate.txt', 'DownLoadDate\r\n"08/15/2026 3:00:00 AM"\r\n')
  files.set(
    DEMO_README_ENTRY,
    'Synthetic Readiness Hub demo dataset. Every member is fake (CAPIDs 900000+, example.org contacts). This entry is unregistered on purpose: ingest must skip it.\r\n',
  )

  const zip = new AdmZip()
  for (const [name, text] of files) zip.addFile(name, Buffer.from(text, 'utf8'))

  return {
    zip: zip.toBuffer(),
    seed,
    fileNames: [...files.keys()].sort(),
    rowCounts,
    memberCount: members.length,
    cadetCount: cadets.length,
    mitchellEdgeCapid: mitchellEdge.capid,
    groundTeamOrgid,
    skillsEvaluatorCapid: gtl.capid,
    unassignedCapid: unassigned.capid,
    doNotContactCapid: doNotContact.capid,
  }
}

export function generateDemoZip(seed: number = DEMO_SEED_DEFAULT): Buffer {
  return generateDemo(seed).zip
}
