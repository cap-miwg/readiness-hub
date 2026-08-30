import { describe, expect, it } from 'vitest'
import { listReportMeta, REPORTS_BY_ID, REPORT_DEFINITIONS } from '../src/reports/catalog.js'
import {
  generateApproachingAgeMilestoneReport,
  generateMembershipLapseReport,
  generateNearPromotionReport,
  generatePromotionEligibilityReport,
  generateRecentPromotionsReport,
  generateTlcComplianceReport,
} from '../src/reports/generators.js'
import { emptyReportData, type JsonLevelsProgress, type ReportData, type ReportMember } from '../src/reports/types.js'
import type { LevelId } from '../src/domain/constants/index.js'

const ASOF = new Date(2026, 7, 29)

const EXPECTED_IDS = [
  'training',
  'discrepancies',
  'approval',
  'promotion',
  'near-promotion',
  'cadet-no-promotion',
  'membership-lapse',
  'cadet-protection',
  'tlc-compliance',
  'aerospace-education',
  'encampment-status',
  'oflight-status',
  'recent-promotions',
  'promotion-requirements',
  'approaching-age-milestone',
  'qcua',
  'qua',
  'recruiting-trends',
  'retention-analysis',
  'participation-summary',
  'quiet-members',
  'cac-representatives',
]

describe('report catalog', () => {
  it('carries all 20 v1 reports plus the 2 v2 participation reports with unique ids', () => {
    const metas = listReportMeta()
    expect(metas).toHaveLength(22)
    const ids = metas.map(m => m.id)
    expect(new Set(ids).size).toBe(22)
    expect(ids.slice().sort()).toEqual(EXPECTED_IDS.slice().sort())
    for (const id of EXPECTED_IDS) expect(REPORTS_BY_ID.has(id)).toBe(true)
  })

  it('every definition has complete display metadata and a generator', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(def.meta.title.length).toBeGreaterThan(0)
      expect(def.meta.description.length).toBeGreaterThan(0)
      expect(def.meta.icon.length).toBeGreaterThan(0)
      expect(def.meta.accent.length).toBeGreaterThan(0)
      expect(def.meta.tags.length).toBeGreaterThan(0)
      expect(typeof def.generate).toBe('function')
      // House style: no em/en dashes anywhere in served metadata.
      expect(def.meta.title).not.toMatch(/[\u2013\u2014]/)
      expect(def.meta.description).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

function levelProgress(completed: LevelId[]): JsonLevelsProgress {
  const ids: LevelId[] = ['L1', 'L2P1', 'L2P2', 'L3', 'L4', 'L5']
  const out = {} as JsonLevelsProgress
  for (const id of ids) {
    out[id] = {
      percent: completed.includes(id) ? 100 : 0,
      status: completed.includes(id) ? 'completed' : 'not-started',
      approvalStatus: completed.includes(id) ? 'approved' : null,
      date: null,
      pathId: null,
      totalReq: 4,
      totalComp: completed.includes(id) ? 4 : 0,
      legacy: false,
    }
  }
  return out
}

function member(capid: number, over: Partial<ReportMember> = {}): ReportMember {
  return {
    capid,
    orgid: 200,
    nameLast: 'Member',
    nameFirst: `M${capid}`,
    fullName: `Capt Member, M${capid}`,
    rank: 'Capt',
    memberType: 'SENIOR',
    joined: new Date(2015, 0, 1),
    expiration: new Date(2027, 0, 1),
    rankDate: new Date(2020, 0, 1),
    dobYear: 1985,
    ageAsofCompute: 41,
    isSeniorScope: true,
    isCadetScope: false,
    currentLevel: 'Level 4',
    promotableOn: null,
    tigEligibleOn: null,
    nextAchvId: null,
    nextAchvPublicNumber: null,
    tigCompleteOn: null,
    hfzValidUntil: null,
    lastPromotionOn: null,
    phase: null,
    honorCredit: null,
    esExpiringCount: 0,
    ...over,
  }
}

function fixtureData(over: Partial<ReportData> = {}): ReportData {
  const orgs = new Map([
    [
      100,
      {
        orgid: 100,
        region: 'GLR',
        wing: 'MI',
        unit: '001',
        nextLevel: null,
        name: 'Michigan Wing',
        type: 'WING',
        scope: 'WING',
      },
    ],
    [
      200,
      {
        orgid: 200,
        region: 'GLR',
        wing: 'MI',
        unit: '205',
        nextLevel: 100,
        name: 'Test Composite Squadron',
        type: 'COMPOSITE SQUADRON',
        scope: 'UNIT',
      },
    ],
  ])
  return emptyReportData({
    asOf: ASOF,
    orgid: 200,
    descendants: false,
    scopeOrgids: new Set([200]),
    orgs,
    ...over,
  })
}

describe('promotion eligibility and near promotion (request-time now)', () => {
  const eligible = member(1, {
    // Capt -> Maj: 48 months TIG (CAPR 35-5 fig 2), Level 4; rank date
    // 2020-01-01 gives ~80 months at the fixed asOf.
    levelProgress: levelProgress(['L1', 'L2P1', 'L2P2', 'L3', 'L4']),
    seniorCurrentLevelNum: 4,
    seniorDuties: [],
    seniorTracks: [],
  })
  const tigShort = member(2, {
    // Same rule, rank date 2024-06-01: TIG unmet at asOf, everything else met.
    rankDate: new Date(2024, 5, 1),
    levelProgress: levelProgress(['L1', 'L2P1', 'L2P2', 'L3', 'L4']),
    seniorCurrentLevelNum: 4,
    seniorDuties: [],
    seniorTracks: [],
  })
  const data = fixtureData({ members: [eligible, tigShort] })

  it('lists only the member whose corrected-rule TIG has elapsed at asOf', () => {
    const result = generatePromotionEligibilityReport(data)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['capid']).toBe(1)
    expect(row['nextRank']).toBe('Maj')
    expect(row['tigRequired']).toBe(48)
    expect(result.scope).toEqual({
      orgid: 200,
      descendants: false,
      orgName: 'GLR-MI-205',
      memberCount: 2,
    })
    expect(result.generatedAt).toBe(ASOF.toISOString())
  })

  it('puts the TIG-short member on the near-promotion report instead', () => {
    const result = generateNearPromotionReport(data)
    const capids = result.rows.map(r => (r as Record<string, unknown>)['capid'])
    expect(capids).toContain(2)
    expect(capids).not.toContain(1)
    const row = result.rows.find(r => (r as Record<string, unknown>)['capid'] === 2) as Record<
      string,
      unknown
    >
    expect(row['category']).toBe('TIG Pending')
    expect(row['tigStatus']).toContain('remaining')
  })
})

describe('membership expiring soon', () => {
  it('windows on request-time now and skips open-ended expirations', () => {
    const expiring = member(10, { expiration: new Date(2026, 8, 20) })
    const farOut = member(11, { expiration: new Date(2027, 5, 1) })
    const lifeSentinel = member(12, { expiration: new Date(9999, 11, 31), memberType: 'LIFE' })
    const data = fixtureData({ members: [expiring, farOut, lifeSentinel] })
    const result = generateMembershipLapseReport(data)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['capid']).toBe(10)
    expect(row['daysUntil']).toBe(22)
    expect(row['urgency']).toBe('critical')
  })

  it('includes already-expired memberships (a year back), urgency expired, first', () => {
    // The memberships-expired finding deep-links here: a member whose
    // membership lapsed while still on the ACTIVE roster must appear.
    const lapsed = member(20, { expiration: new Date(2026, 6, 15) }) // 45 days past
    const expiring = member(21, { expiration: new Date(2026, 8, 20) })
    const ancient = member(22, { expiration: new Date(2024, 0, 1) }) // beyond the lookback
    const data = fixtureData({ members: [expiring, lapsed, ancient] })
    const result = generateMembershipLapseReport(data)
    expect(result.rows).toHaveLength(2)
    const first = result.rows[0] as Record<string, unknown>
    expect(first['capid']).toBe(20)
    expect(first['daysUntil']).toBe(-45)
    expect(first['urgency']).toBe('expired')
    const second = result.rows[1] as Record<string, unknown>
    expect(second['capid']).toBe(21)
    expect(second['urgency']).toBe('critical')
  })
})

describe('recent promotions keyed on CadetRank.RankDate (v1 parity)', () => {
  const cadetBase = {
    memberType: 'CADET',
    rank: 'C/SrA',
    isSeniorScope: false,
    isCadetScope: true,
  } as const

  it('windows and dates rows on the latest rank date, not the approval date', () => {
    // Approval-based last_promotion_on sits outside the 60-day window; the
    // latest CadetRank.RankDate is 19 days before the fixed asOf.
    const cadet = member(10, { ...cadetBase, lastPromotionOn: new Date(2026, 0, 1) })
    const data = fixtureData({
      members: [cadet],
      cadetRanks: [
        { capid: 10, rank: 'C/A1C', rankDate: new Date(2026, 2, 1) },
        { capid: 10, rank: 'C/SrA', rankDate: new Date(2026, 7, 10) },
      ],
    })
    const result = generateRecentPromotionsReport(data)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['promotionDate']).toBe('2026-08-10')
    expect(row['daysSincePromotion']).toBe(19)
    expect(row['timeframe']).toBe('30-day')
    // From/To still come from the rank history and the member row.
    expect(row['previousRank']).toBe('C/A1C')
    expect(row['rank']).toBe('C/SrA')
  })

  it('excludes a cadet whose latest rank date is outside the window even with a recent approval date', () => {
    const cadet = member(11, { ...cadetBase, lastPromotionOn: new Date(2026, 7, 20) })
    const data = fixtureData({
      members: [cadet],
      cadetRanks: [{ capid: 11, rank: 'C/Amn', rankDate: new Date(2026, 0, 5) }],
    })
    expect(generateRecentPromotionsReport(data).rows).toHaveLength(0)
  })

  it('skips cadets with no rank history rows', () => {
    const cadet = member(12, { ...cadetBase, lastPromotionOn: new Date(2026, 7, 20) })
    expect(generateRecentPromotionsReport(fixtureData({ members: [cadet] })).rows).toHaveLength(0)
  })
})

describe('approaching age 18/21 DOB gating', () => {
  const cadet = member(20, {
    memberType: 'CADET',
    rank: 'C/SrA',
    isSeniorScope: false,
    isCadetScope: true,
    dobYear: 2008,
    ageAsofCompute: 17,
    dob: new Date(2008, 10, 15),
  })

  it('omits the DOB column and values for viewers', () => {
    const data = fixtureData({ members: [cadet], role: 'viewer' })
    const result = generateApproachingAgeMilestoneReport(data)
    expect(result.rows).toHaveLength(1)
    expect(result.columns.map(c => c.key)).not.toContain('dob')
    expect(result.columns.map(c => c.key)).not.toContain('milestoneDate')
    const row = result.rows[0] as Record<string, unknown>
    expect(row['milestone']).toBe(18)
    expect(row['currentAge']).toBe(18)
    expect(row).not.toHaveProperty('dob')
    expect(row).not.toHaveProperty('milestoneDate')
    expect(row).not.toHaveProperty('daysUntil')
  })

  it('adds the DOB column and exact dates for admins', () => {
    const data = fixtureData({ members: [cadet], role: 'admin' })
    const result = generateApproachingAgeMilestoneReport(data)
    expect(result.columns.map(c => c.key)).toContain('dob')
    const row = result.rows[0] as Record<string, unknown>
    expect(row['dob']).toBe('2008-11-15')
    expect(row['milestoneDate']).toBe('2026-11-15')
    // 78 calendar days away; the DST fall-back hour rounds the ceil up to 79.
    expect(row['daysUntil']).toBe(79)
  })
})

describe('TLC compliance views', () => {
  const seniorCurrent = member(30, {
    orgid: 200,
  })
  const seniorMissing = member(31, { orgid: 200 })
  const training = [
    // TLC Basic completed 2024-01-10 expires 2027-01-10 (36-month renewal),
    // inside the 365-day due-soon warning window at the fixed asOf.
    { capid: 30, typeCrs: 'Training Leaders of Cadets - Basic Course', completed: new Date(2024, 0, 10) },
  ]

  it('produces individual rows for a single unit', () => {
    const data = fixtureData({ members: [seniorCurrent, seniorMissing], training })
    const result = generateTlcComplianceReport(data)
    expect(result.meta?.['view']).toBe('individual')
    expect(result.rows).toHaveLength(2)
    const byCapid = new Map(result.rows.map(r => [r['capid'], r]))
    expect((byCapid.get(30) as Record<string, unknown>)['status']).toBe('Due Soon')
    expect((byCapid.get(31) as Record<string, unknown>)['status']).toBe('Missing')
  })

  it('produces a unit summary when descendants are included', () => {
    const data = fixtureData({
      members: [seniorCurrent, seniorMissing],
      training,
      descendants: true,
      orgid: 100,
      scopeOrgids: new Set([100, 200]),
    })
    const result = generateTlcComplianceReport(data)
    expect(result.meta?.['view']).toBe('unit-summary')
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row['unit']).toBe('GLR-MI-205')
    expect(row['qualified']).toBe(1)
    expect(row['compliance']).toBe('Needs TLC')
  })
})
