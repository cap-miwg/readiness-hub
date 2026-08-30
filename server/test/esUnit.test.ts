import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  type DatasetInput,
  type MbrAchievementRow,
  type MemberRow,
} from '../src/domain/dataset.js'
import { analyzeUnit, getMembersForOrg } from '../src/domain/esUnit.js'

const ASOF = new Date(2026, 7, 29)
const MS_PER_DAY = 86_400_000

const daysAfter = (days: number): Date => new Date(ASOF.getTime() + days * MS_PER_DAY)
const yearsBefore = (years: number): Date =>
  new Date(ASOF.getFullYear() - years, ASOF.getMonth(), ASOF.getDate())

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
    achievements: [
      { achvId: 53, achv: 'GES - General Emergency Services', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 69, achv: 'GTL - Ground Team Leader', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 70, achv: 'GTM3 - Ground Team Member 3', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 124, achv: 'SET - Skills Evaluator Training', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 57, achv: 'MP - SAR/DR Mission Pilot', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 55, achv: 'MS - Mission Scanner', functionalArea: 'OPS-Emergency_Services' },
    ],
    tasks: [],
    achvStepTasks: [],
    achvStepAchv: [],
    cdtAchvEnum: [],
  }
}

function makeMember(over: Partial<MemberRow> & { capid: number }): MemberRow {
  return {
    nameLast: 'Doe',
    nameFirst: 'Jane',
    nameMiddle: null,
    nameSuffix: null,
    dob: new Date(1980, 0, 1),
    orgid: 1000,
    wing: 'MI',
    unit: '090',
    rank: 'Capt',
    joined: new Date(2015, 0, 1),
    expiration: null,
    orgJoined: null,
    dateMod: null,
    type: 'SENIOR',
    rankDate: null,
    region: 'GLR',
    mbrStatus: 'ACTIVE',
    ...over,
  }
}

function makeAchv(
  over: Partial<MbrAchievementRow> & { capid: number; achvId: number },
): MbrAchievementRow {
  return {
    status: 'ACTIVE',
    originallyAccomplished: null,
    completed: yearsBefore(2),
    expiration: daysAfter(365),
    authDate: null,
    dateMod: null,
    orgid: 1000,
    ...over,
  }
}

describe('getMembersForOrg', () => {
  it('excludes PATRON, CADET SPONSOR, and non-ACTIVE members; includes cadets', () => {
    const input = emptyInput()
    input.members = [
      makeMember({ capid: 1, type: 'SENIOR' }),
      makeMember({ capid: 2, type: 'CADET' }),
      makeMember({ capid: 3, type: 'PATRON' }),
      makeMember({ capid: 4, type: 'CADET SPONSOR' }),
      makeMember({ capid: 5, type: 'SENIOR', mbrStatus: 'EXPIRED' }),
      makeMember({ capid: 6, type: 'SENIOR', orgid: 2000 }),
    ]
    const ds = buildDataset(input)
    const members = getMembersForOrg(ds, new Set([1000]))
    expect(members.map(m => m.capid).sort()).toEqual([1, 2])
  })
})

describe('analyzeUnit: 1 GTL + 3 GTM fixture', () => {
  function gtlUnit(): DatasetInput {
    const input = emptyInput()
    input.members = [
      makeMember({ capid: 301, nameFirst: 'Greta', nameLast: 'Leader' }),
      makeMember({ capid: 302 }),
      makeMember({ capid: 303 }),
      makeMember({ capid: 304 }),
    ]
    input.mbrAchievements = [
      makeAchv({ capid: 301, achvId: 69 }),
      makeAchv({ capid: 302, achvId: 70 }),
      makeAchv({ capid: 303, achvId: 70 }),
      makeAchv({ capid: 304, achvId: 70 }),
    ]
    return input
  }

  it('fields exactly one ground team and scores the fieldOps component 80', () => {
    const ds = buildDataset(gtlUnit())
    const analysis = analyzeUnit(ds, 1000, new Set([301, 302, 303, 304]), ASOF)

    expect(analysis.memberCount).toBe(4)
    expect(analysis.teams.fieldOps.canFieldGround).toBe(true)
    expect(analysis.teams.fieldOps.groundTeamsFieldable).toBe(1)
    expect(analysis.teams.fieldOps.positionCounts).toEqual({ GTL: 1, GTM1: 0, GTM2: 0, GTM3: 3, UDF: 0, GBD: 0 })
    expect(analysis.teams.fieldOps.gaps).toContain('Single GTL (SPOF)')
    // One fieldable team: the v1 step function scores 80, not 100.
    expect(analysis.readinessComponents.teamScores.fieldOps).toBe(80)
  })

  it('computes the weighted composite: 49 for this fixture', () => {
    const ds = buildDataset(gtlUnit())
    const analysis = analyzeUnit(ds, 1000, new Set([301, 302, 303, 304]), ASOF)

    // All 4 displayed quals active, none expired.
    expect(analysis.qualifications.byStatus).toEqual({ active: 4, training: 0, expired: 0 })
    expect(analysis.readinessComponents.qualScore).toBe(100)
    // Single GTL is the only SPOF: 100 - 25.
    expect(analysis.risks.singlePointsOfFailure).toHaveLength(1)
    expect(analysis.risks.singlePointsOfFailure[0]?.position).toBe('GTL')
    expect(analysis.readinessComponents.riskScore).toBe(75)
    // No one in training.
    expect(analysis.readinessComponents.pipelineScore).toBe(30)
    // No SET holder: zero evaluator coverage.
    expect(analysis.readinessComponents.evaluatorScore).toBe(0)
    // teamScore = 80*0.3 + 0 + 0 + 0 + 30*0.15 = 28.5 (command scores 30 without an IC);
    // overall = round(28.5*0.35 + 100*0.25 + 0*0.15 + 75*0.15 + 30*0.10) = 49.
    expect(analysis.readinessComponents.teamScore).toBe(29)
    expect(analysis.readinessScore).toBe(49)
    expect(analysis.readinessRating).toBe('needs-attention')
    expect(analysis.quickSummary).toBe('Can field 1 ground team')
  })

  it('flags every member without active GES and recommends GES training', () => {
    const ds = buildDataset(gtlUnit())
    const analysis = analyzeUnit(ds, 1000, new Set([301, 302, 303, 304]), ASOF)
    expect(analysis.qualifications.missingGES).toHaveLength(4)
    expect(analysis.risks.recommendations.some(r => r.area === 'Foundation')).toBe(true)
  })
})

describe('analyzeUnit: evaluator coverage', () => {
  it('a SET holder with a year-old GTL covers GTL but not GTM3', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 305 }), makeMember({ capid: 306 })]
    input.mbrAchievements = [
      makeAchv({ capid: 305, achvId: 69, completed: yearsBefore(2) }),
      makeAchv({ capid: 305, achvId: 124 }),
      makeAchv({ capid: 306, achvId: 70 }),
    ]
    const ds = buildDataset(input)
    const analysis = analyzeUnit(ds, 1000, new Set([305, 306]), ASOF)

    expect(analysis.evaluators.evaluatorCount).toBe(1)
    expect(analysis.evaluators.available[0]?.canEvaluate.map(c => c.achvId)).toEqual([69])
    // Active evaluator-eligible quals are GTL(69) and GTM3(70); only GTL is covered.
    expect(analysis.evaluators.coverage).toBe(50)
    expect(analysis.evaluators.gaps).toEqual(['GTM3 - Ground Team Member 3'])
  })
})

describe('analyzeUnit: aircrew and pipeline', () => {
  it('one pilot and one scanner field one aircrew with two SPOFs', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 307 }), makeMember({ capid: 308 })]
    input.mbrAchievements = [
      makeAchv({ capid: 307, achvId: 57 }),
      makeAchv({ capid: 308, achvId: 55 }),
      makeAchv({ capid: 308, achvId: 70, status: 'TRAINING' }),
    ]
    const ds = buildDataset(input)
    const analysis = analyzeUnit(ds, 1000, new Set([307, 308]), ASOF)

    expect(analysis.teams.aircrew.canField).toBe(true)
    expect(analysis.teams.aircrew.teamsFieldable).toBe(1)
    expect(analysis.readinessComponents.teamScores.aircrew).toBe(80)
    const spofPositions = analysis.risks.singlePointsOfFailure.map(s => s.position).sort()
    expect(spofPositions).toEqual(['Pilot', 'Scanner'])
    // One member training toward GTM3: pipeline 50 + 10.
    expect(analysis.pipeline.activeTraining).toHaveLength(1)
    expect(analysis.pipeline.activeTraining[0]?.position).toBe('GTM3')
    expect(analysis.readinessComponents.pipelineScore).toBe(60)
    expect(analysis.quickSummary).toBe('Can field 1 aircrew')
  })
})

describe('analyzeUnit: empty and excluded members', () => {
  it('returns the zeroed skeleton for an empty member set', () => {
    const ds = buildDataset(emptyInput())
    const analysis = analyzeUnit(ds, 1000, new Set(), ASOF)
    expect(analysis.readinessScore).toBe(0)
    expect(analysis.readinessRating).toBe('needs-attention')
    expect(analysis.quickSummary).toBe('No active members')
    expect(analysis.memberCount).toBe(0)
  })

  it('filters ineligible capids passed by the caller', () => {
    const input = emptyInput()
    input.members = [
      makeMember({ capid: 309, type: 'PATRON' }),
      makeMember({ capid: 310, type: 'SENIOR' }),
    ]
    input.mbrAchievements = [makeAchv({ capid: 309, achvId: 69 })]
    const ds = buildDataset(input)
    const analysis = analyzeUnit(ds, 1000, new Set([309, 310]), ASOF)
    expect(analysis.memberCount).toBe(1)
    // The Patron's GTL must not count.
    expect(analysis.teams.fieldOps.positionCounts.GTL).toBe(0)
  })
})
