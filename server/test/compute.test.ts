import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  type CadetAchvAprRow,
  type CadetHfzRow,
  type CadetRankRow,
  type Dataset,
  type DatasetInput,
  type DutyPositionRow,
  type MemberRow,
  type OrganizationRow,
  type PlMemberTaskCreditRow,
  type SeniorLevelRow,
  type SpecTrackRow,
} from '../src/domain/dataset.js'
import { deriveCadetState, isExpiringSoon, isPromotableNow } from '../src/domain/timeSensitive.js'
import type { CadetStateFacts } from '../src/domain/computedTypes.js'

// config.ts validates env at import time; satisfy it before loading compute.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'
const { assembleMemberRow, assembleOrgRows, buildOrgComputeContext, buildOrgChart } = await import(
  '../src/domain/compute.js'
)

const DAY_MS = 24 * 60 * 60 * 1000

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function isoOf(date: Date | null): string | null {
  return date !== null ? date.toISOString().slice(0, 10) : null
}

function member(capid: number, orgid: number, over: Partial<MemberRow> = {}): MemberRow {
  return {
    capid,
    nameLast: 'Member',
    nameFirst: `M${capid}`,
    nameMiddle: null,
    nameSuffix: null,
    dob: null,
    orgid,
    wing: 'MI',
    unit: '205',
    rank: 'CADET',
    joined: null,
    expiration: null,
    orgJoined: null,
    dateMod: null,
    type: 'CADET',
    rankDate: null,
    region: 'GLR',
    mbrStatus: 'ACTIVE',
    ...over,
  }
}

function org(orgid: number, unit: string, over: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    orgid,
    region: 'GLR',
    wing: 'MI',
    unit,
    nextLevel: null,
    name: `Unit ${unit}`,
    type: 'COMPOSITE SQUADRON',
    dateChartered: null,
    status: 'ACTIVE',
    scope: 'UNIT',
    ...over,
  }
}

function duty(
  capid: number,
  orgid: number,
  dutyName: string,
  over: Partial<DutyPositionRow> = {},
): DutyPositionRow {
  return {
    capid,
    duty: dutyName,
    functArea: null,
    lvl: null,
    asst: false,
    dateMod: null,
    orgid,
    ...over,
  }
}

function seniorLevel(capid: number, lvl: string, completed: Date): SeniorLevelRow {
  return { capid, lvl, completed }
}

function specTrack(capid: number, track: string, trackLevel: string): SpecTrackRow {
  return { capid, track, trackLevel, howComplete: null, completed: null, dateMod: d('2024-01-01') }
}

function cadetRank(capid: number, rankName: string, rankDate: Date): CadetRankRow {
  return { capid, rank: rankName, rankDate, dateMod: rankDate }
}

function apr(capid: number, cadetAchvId: number, dateMod: Date): CadetAchvAprRow {
  return { capid, cadetAchvId, status: 'APR', awardNo: null, dateMod, dateCreated: null }
}

let creditSeq = 1
function taskCredit(capid: number, taskId: number): PlMemberTaskCreditRow {
  return { memberTaskCreditId: creditSeq++, taskId, capid, statusId: 8, completed: null, expiration: null }
}

function hfz(capid: number, hfzId: number, dateTaken: Date, isPassed: boolean): CadetHfzRow {
  return {
    hfzId,
    capid,
    dateTaken,
    orgid: null,
    isPassed,
    pacerRun: null,
    pacerRunPassed: null,
    mileRun: null,
    mileRunPassed: null,
    curlUp: null,
    curlUpPassed: null,
    pushUp: null,
    pushUpPassed: null,
    sitAndReach: null,
    sitAndReachPassed: null,
  }
}

function emptyInput(): DatasetInput {
  return {
    members: [],
    organizations: [],
    mbrContact: [],
    dutyPositions: [],
    cadetDutyPositions: [],
    mbrAchievements: [],
    mbrTasks: [],
    cadetAchv: [],
    cadetAchvAprs: [],
    cadetAchvFullReport: [],
    cadetActivities: [],
    cadetHfz: [],
    cadetRank: [],
    cadetPhase: [],
    cadetAwards: [],
    seniorLevel: [],
    seniorAwards: [],
    specTrack: [],
    training: [],
    oFlight: [],
    mbrCommittee: [],
    orgStatistics: [],
    plPaths: [],
    plGroups: [],
    plTasks: [],
    plTaskGroupAssignments: [],
    plMemberPathCredit: [],
    plMemberTaskCredit: [],
    plVolUInstructors: [],
    achievements: [],
    tasks: [],
    achvStepTasks: [],
    achvStepAchv: [],
    cdtAchvEnum: [],
  }
}

/**
 * Fixture: wing 1000 <- composite squadron 2001. CAPIDs:
 * 600001 senior Capt in 2001: legacy LV1-LV4, safety duty, one spec track;
 *   Capt -> Maj needs 48 months TIG from 2020-06-15 and Level 4 (met).
 * 100001 cadet in 2001: achievement 1 approved 2026-03-01, every controllable
 *   achievement-2 requirement done (same shape as cadet.test.ts), HFZ attempt
 *   2026-03-10.
 * 700001 senior LIFE in 2001 with no duty: the additional-members node.
 * 900001 senior in out-of-tree org 9999: normalizes to UNASSIGNED (-1).
 */
function buildFixture(): { dataset: Dataset } {
  const input = emptyInput()
  input.organizations = [
    org(1000, '001', { type: 'WING', name: 'Michigan Wing', scope: 'WING' }),
    org(2001, '205', { nextLevel: 1000 }),
  ]
  input.members = [
    member(600001, 2001, {
      type: 'SENIOR',
      rank: 'Capt',
      nameLast: 'Senior',
      rankDate: d('2020-06-15'),
      joined: d('2015-01-10'),
      expiration: d('2027-01-31'),
      dob: d('1990-06-15'),
    }),
    member(100001, 2001, { nameLast: 'Cadet', rank: 'C/Amn' }),
    member(700001, 2001, { type: 'LIFE', rank: 'Maj', nameLast: 'Unassigned' }),
    member(900001, 9999, { type: 'SENIOR', rank: '1st Lt', nameLast: 'Outof' }),
  ]

  input.seniorLevel.push(
    seniorLevel(600001, 'LV1', d('2016-01-01')),
    seniorLevel(600001, 'LV2', d('2017-01-01')),
    seniorLevel(600001, 'LV3', d('2018-01-01')),
    seniorLevel(600001, 'LV4', d('2020-01-01')),
  )
  input.dutyPositions.push(
    duty(600001, 2001, 'COMMANDER', { dateMod: d('2021-01-01') }),
    duty(600001, 2001, 'SAFETY OFFICER', { functArea: 'SE', dateMod: d('2022-01-01') }),
  )
  input.specTrack.push(specTrack(600001, 'SAFETY', 'SENIOR'))

  input.cadetRank.push(cadetRank(100001, 'C/Amn', d('2026-01-01')))
  input.cadetAchvAprs.push(apr(100001, 1, d('2026-03-01')))
  input.plMemberTaskCredit.push(
    taskCredit(100001, 331), // leadership interactive module, achv 2
    taskCredit(100001, 334), // aerospace dimensions 1, achv 2
    taskCredit(100001, 333), // drill test, achv 2
    taskCredit(100001, 458), // leadership expectations, achv 2
    taskCredit(100001, 516), // uniform, achv 2
    taskCredit(100001, 340), // character forum, achv 2
  )
  input.cadetHfz.push(hfz(100001, 11, d('2026-03-10'), false))

  return { dataset: buildDataset(input) }
}

describe('assembleMemberRow: senior', () => {
  const asOf = d('2026-03-31')

  it('yields nonzero current_level, promotion details, and promotability dates', () => {
    const { dataset } = buildFixture()
    const ctx = buildOrgComputeContext(dataset)
    const senior = dataset.memberByCapid.get(600001) as MemberRow
    const { member: row, duties, tracks } = assembleMemberRow(dataset, senior, asOf, ctx)

    expect(row.isSeniorScope).toBe(true)
    expect(row.isCadetScope).toBe(false)
    expect(row.fullName).toBe('Capt Senior, M600001')
    expect(row.currentLevel).toBe('Level 4')
    expect(row.levelProgress?.L4.status).toBe('completed')

    expect(row.promotion?.kind).toBe('senior')
    if (row.promotion?.kind !== 'senior') throw new Error('expected senior promotion')
    expect(row.promotion.details.nextRank).toBe('Maj')
    expect(row.promotion.details.tigMonthsRequired).toBe(48)
    expect(row.promotion.details.isLevelMet).toBe(true)
    expect(row.promotion.details.isEligible).toBe(true)

    // Capt -> Maj: 48 months TIG from 2020-06-15 (CAPR 35-5 fig 2), all other
    // requirements met, so promotable_on is the TIG date and already passed.
    expect(isoOf(row.tigEligibleOn)).toBe('2024-06-15')
    expect(isoOf(row.promotableOn)).toBe('2024-06-15')
    expect(isPromotableNow(row.promotableOn, asOf)).toBe(true)
    expect(isPromotableNow(row.promotableOn, d('2023-01-01'))).toBe(false)

    expect(row.dobYear).toBe(1990)
    expect(row.ageAsofCompute).toBe(35)
    expect(row.cadetStateFacts).toBeNull()
    expect(row.honorCredit).toBeNull()

    expect(duties).toHaveLength(2)
    const safety = duties.find(x => x.duty === 'SAFETY OFFICER')
    expect(safety?.functArea).toBe('SE')
    expect(safety?.heldAtOrgid).toBe(2001)
    expect(safety?.source).toBe('senior')
    expect(tracks).toEqual([{ capid: 600001, track: 'SAFETY', trackLevel: 'SENIOR' }])
  })

  it('membership expiration windows re-derive at read time', () => {
    const { dataset } = buildFixture()
    const ctx = buildOrgComputeContext(dataset)
    const senior = dataset.memberByCapid.get(600001) as MemberRow
    const { member: row } = assembleMemberRow(dataset, senior, asOf, ctx)
    expect(isoOf(row.expiration)).toBe('2027-01-31')
    expect(isExpiringSoon(row.expiration, d('2026-12-15'), 90)).toBe(true)
    expect(isExpiringSoon(row.expiration, d('2026-03-31'), 90)).toBe(false)
    expect(isExpiringSoon(row.expiration, d('2027-06-01'), 90)).toBe(false)
  })
})

describe('assembleMemberRow: cadet and deriveCadetState', () => {
  const asOf = d('2026-03-31')

  it('stores TIG facts that flip TIME_PENDING to READY as asOf advances', () => {
    const { dataset } = buildFixture()
    const ctx = buildOrgComputeContext(dataset)
    const cadet = dataset.memberByCapid.get(100001) as MemberRow
    const { member: row } = assembleMemberRow(dataset, cadet, asOf, ctx)

    expect(row.isCadetScope).toBe(true)
    expect(row.nextAchvId).toBe(2)
    expect(row.nextAchvPublicNumber).toBe(2)
    expect(row.phase).toBe('1')
    // Approval 2026-03-01 + 56 days TIG (CAPP 60-31 cadet TIG, v1 constant).
    expect(isoOf(row.tigCompleteOn)).toBe('2026-04-26')
    expect(isoOf(row.hfzValidUntil)).toBe('2026-09-06')
    expect(isoOf(row.lastPromotionOn)).toBe('2026-03-01')

    expect(row.promotion?.kind).toBe('cadet')
    if (row.promotion?.kind !== 'cadet') throw new Error('expected cadet promotion')
    expect(row.promotion.readiness.state).toBe('TIME_PENDING')

    const facts = row.cadetStateFacts as CadetStateFacts
    expect(facts.reqsReady).toBe(true)
    expect(facts.spaatzComplete).toBe(false)
    expect(facts.hfzCounted).toBe(true)
    expect(facts.tigEligibleOn).toBe('2026-04-26')
    expect(facts.hardDone).toBe(3)
    expect(facts.controllableTotal).toBeGreaterThan(0)

    // Read-time re-derivation from stored facts, not frozen state.
    expect(deriveCadetState(facts, d('2026-03-31'))).toBe('TIME_PENDING')
    expect(deriveCadetState(facts, d('2026-04-30'))).toBe('READY')

    // promotable_on: only time remains, so it equals the TIG date.
    expect(isoOf(row.promotableOn)).toBe('2026-04-26')
    expect(isPromotableNow(row.promotableOn, d('2026-04-30'))).toBe(true)
  })

  it('degrades READY when the HFZ window has expired at read time', () => {
    const { dataset } = buildFixture()
    const ctx = buildOrgComputeContext(dataset)
    const cadet = dataset.memberByCapid.get(100001) as MemberRow
    const { member: row } = assembleMemberRow(dataset, cadet, asOf, ctx)
    const facts = row.cadetStateFacts as CadetStateFacts
    // TIG met but HFZ credit (valid until 2026-09-06) lapsed: no longer READY;
    // two of three hard groups remain, so NEARLY_READY.
    expect(deriveCadetState(facts, d('2026-10-01'))).toBe('NEARLY_READY')
  })
})

describe('assembleOrgRows', () => {
  const asOf = d('2026-03-31')

  it('emits self and subtree rows, counting unassigned members at the anchor only', () => {
    const { dataset } = buildFixture()
    // All fixture members live in 2001, so the derived LCA would be the
    // squadron; anchor at the wing explicitly (config.ANCHOR_ORGID path).
    const ctx = buildOrgComputeContext(dataset, 1000)
    expect(ctx.anchorOrgid).toBe(1000)

    const rows = assembleOrgRows(dataset, ctx, asOf)
    expect(rows).toHaveLength(4) // 2 orgs x 2 scopes

    const bySel = (orgid: number, scope: string) =>
      rows.find(r => r.orgid === orgid && r.scope === scope)

    const wingSelf = bySel(1000, 'self')
    const wingSubtree = bySel(1000, 'subtree')
    const sqSelf = bySel(2001, 'self')
    const sqSubtree = bySel(2001, 'subtree')

    expect(sqSelf?.memberCount).toBe(3)
    expect(sqSelf?.seniorCount).toBe(2)
    expect(sqSelf?.cadetCount).toBe(1)
    expect(sqSubtree?.memberCount).toBe(3)
    expect(wingSelf?.memberCount).toBe(0)
    // Wing subtree = squadron members + the out-of-tree member via UNASSIGNED.
    expect(wingSubtree?.memberCount).toBe(4)

    expect(sqSelf?.es.memberCount).toBe(3)
    expect(wingSubtree?.es.memberCount).toBe(4)
    // No org_statistics rows in the fixture: org_stats is null, not fabricated.
    expect(sqSelf?.orgStats).toBeNull()
    expect(sqSelf?.orgchart).not.toBeNull()
  })

  it('org chart carries the commander, the cadet chain, and additional members', () => {
    const { dataset } = buildFixture()
    const squadron = dataset.orgByOrgid.get(2001) as OrganizationRow
    const chart = buildOrgChart(
      dataset,
      squadron,
      new Set([2001]),
      dataset.membersByOrgid.get(2001) ?? [],
    )

    expect(chart.id).toBe('commander')
    expect(chart.members.map(m => m.capid)).toEqual([600001])
    expect(chart.members[0]?.display).toBe('Capt Senior, M600001')
    expect(chart.vacant).toBe(false)

    const byId = new Map(chart.children.map(c => [c.id, c] as const))
    // Composite squadron: vacant Deputy Commander is suppressed
    // (v1 Index.html:5133), vacant DC for Seniors/Cadets still shows.
    expect(byId.has('deputy')).toBe(false)
    expect(byId.has('cds')).toBe(true)
    const dcCadets = byId.get('cdc')
    expect(dcCadets).toBeDefined()
    // Cadet chain attaches under DC-Cadets (v1 Index.html:5199-5201); the
    // fixture cadet holds no duty, so they land in the flight-enlisted node.
    const cadetCommander = dcCadets?.children.find(c => c.id === 'ccmdr')
    expect(cadetCommander).toBeDefined()
    const depOps = cadetCommander?.children.find(c => c.id === 'c_dep_ops')
    const enlisted = depOps?.children.find(c => c.id === 'flight_enlisted')
    expect(enlisted?.members.map(m => m.capid)).toEqual([100001])

    // Safety staff node is filled; the safety officer is assigned, so only the
    // duty-less LIFE member appears under Additional Members.
    const safetyNode = byId.get('safety')
    expect(safetyNode?.members.map(m => m.capid)).toEqual([600001])
    const additional = byId.get('additional_members')
    expect(additional?.title).toBe('Additional Members (1)')
    expect(additional?.members.map(m => m.capid)).toEqual([700001])

    // A staff node with nobody beneath it is present but flagged vacant.
    expect(byId.get('ig')?.vacant).toBe(true)
  })
})

describe('timeSensitive window arithmetic', () => {
  it('isExpiringSoon brackets the window inclusively and rejects already-expired', () => {
    const asOf = d('2026-01-01')
    expect(isExpiringSoon(d('2026-01-01'), asOf, 90)).toBe(true)
    expect(isExpiringSoon(new Date(asOf.getTime() + 90 * DAY_MS), asOf, 90)).toBe(true)
    expect(isExpiringSoon(new Date(asOf.getTime() + 91 * DAY_MS), asOf, 90)).toBe(false)
    expect(isExpiringSoon(d('2025-12-31'), asOf, 90)).toBe(false)
    expect(isExpiringSoon(null, asOf, 90)).toBe(false)
  })
})
