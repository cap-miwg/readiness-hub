import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  type DatasetInput,
  type MbrAchievementRow,
  type MemberRow,
} from '../src/domain/dataset.js'
import {
  buildEsPrerequisiteTree,
  buildEsQualifications,
  checkEsQualificationEligibility,
  getEsAchievementTasks,
} from '../src/domain/es.js'

const ASOF = new Date(2026, 7, 29)
const MS_PER_DAY = 86_400_000

const daysBefore = (days: number): Date => new Date(ASOF.getTime() - days * MS_PER_DAY)
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
    plPaths: [{ pathId: 1, pathName: 'Level 1 - CAP Onboarding' }],
    plGroups: [],
    plTasks: [],
    plTaskGroupAssignments: [],
    plMemberPathCredit: [],
    plMemberTaskCredit: [],
    plVolUInstructors: [],
    achievements: [
      { achvId: 53, achv: 'GES - General Emergency Services', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 169, achv: 'OPSEC - Operations Security', functionalArea: 'OPS-OPSEC' },
      { achvId: 69, achv: 'GTL - Ground Team Leader', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 70, achv: 'GTM3 - Ground Team Member 3', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 67, achv: 'AOBD - Air Operations Branch Director', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 64, achv: 'PSC - Planning Section Chief', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 124, achv: 'SET - Skills Evaluator Training', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 257, achv: 'UASMP - sUAS Mission Pilot', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 100, achv: 'Node A', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 101, achv: 'Node B', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 102, achv: 'Node C', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 200, achv: 'Cycle X', functionalArea: 'OPS-Emergency_Services' },
      { achvId: 201, achv: 'Cycle Y', functionalArea: 'OPS-Emergency_Services' },
    ],
    tasks: [
      { taskId: 131, taskName: 'CAPT 116 ICS 100', functionalArea: 'OPS-Emergency_Services' },
      { taskId: 1502, taskName: 'FAA Part 107 Remote Pilot Certification', functionalArea: 'OPS-Emergency_Services' },
      { taskId: 1544, taskName: 'Current and valid Form 5U', functionalArea: 'OPS-Emergency_Services' },
    ],
    achvStepTasks: [],
    achvStepAchv: [
      // Node A requires B and C; C requires B: the direct B edge must prune.
      { achvStepTaskId: 1, achvId: 100, stepId: 1, origAchvId: 101 },
      { achvStepTaskId: 2, achvId: 100, stepId: 1, origAchvId: 102 },
      { achvStepTaskId: 3, achvId: 102, stepId: 1, origAchvId: 101 },
      // Cycle: X requires Y, Y requires X.
      { achvStepTaskId: 4, achvId: 200, stepId: 1, origAchvId: 201 },
      { achvStepTaskId: 5, achvId: 201, stepId: 1, origAchvId: 200 },
    ],
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

describe('Skills Evaluator derivation', () => {
  it('an Active GTL held over a year plus an active SET makes a Skills Evaluator', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 201 })]
    input.mbrAchievements = [
      makeAchv({ capid: 201, achvId: 69, completed: yearsBefore(2) }),
      makeAchv({ capid: 201, achvId: 124, completed: yearsBefore(2) }),
    ]
    const ds = buildDataset(input)
    const member = ds.memberByCapid.get(201) as MemberRow
    const quals = buildEsQualifications(ds, member, {}, ASOF)
    const gtl = quals.find(q => q.achvId === 69)
    expect(gtl).toBeDefined()
    expect(gtl?.isSkillsEvaluator).toBe(true)
    // SET itself can never have a Skills Evaluator.
    expect(quals.find(q => q.achvId === 124)?.isSkillsEvaluator).toBe(false)
  })

  it('a qual held under a year is not evaluatable', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 202 })]
    input.mbrAchievements = [
      makeAchv({ capid: 202, achvId: 69, completed: daysBefore(200) }),
      makeAchv({ capid: 202, achvId: 124 }),
    ]
    const ds = buildDataset(input)
    const quals = buildEsQualifications(ds, ds.memberByCapid.get(202) as MemberRow, {}, ASOF)
    expect(quals.find(q => q.achvId === 69)?.isSkillsEvaluator).toBe(false)
  })

  it('cadets are never Skills Evaluators', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 203, type: 'CADET', dob: yearsBefore(17) })]
    input.mbrAchievements = [
      makeAchv({ capid: 203, achvId: 70, completed: yearsBefore(2) }),
      makeAchv({ capid: 203, achvId: 124 }),
    ]
    const ds = buildDataset(input)
    const quals = buildEsQualifications(ds, ds.memberByCapid.get(203) as MemberRow, {}, ASOF)
    expect(quals.find(q => q.achvId === 70)?.isSkillsEvaluator).toBe(false)
  })
})

describe('qualification building', () => {
  it('synthesizes Missing GES and OPSEC rows on the senior dashboard', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 204 })]
    const ds = buildDataset(input)
    const quals = buildEsQualifications(
      ds,
      ds.memberByCapid.get(204) as MemberRow,
      { forDashboard: true },
      ASOF,
    )
    const ges = quals.find(q => q.achvId === 53)
    const opsec = quals.find(q => q.achvId === 169)
    expect(ges?.status).toBe('Missing')
    expect(opsec?.status).toBe('Missing')
    expect(quals).toHaveLength(2)
  })

  it('hides Active GES/OPSEC and all SET rows on the dashboard', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 205 })]
    input.mbrAchievements = [
      makeAchv({ capid: 205, achvId: 53 }),
      makeAchv({ capid: 205, achvId: 169 }),
      makeAchv({ capid: 205, achvId: 124 }),
    ]
    const ds = buildDataset(input)
    const dashboard = buildEsQualifications(
      ds,
      ds.memberByCapid.get(205) as MemberRow,
      { forDashboard: true },
      ASOF,
    )
    expect(dashboard).toHaveLength(0)
    // The profile view still shows them.
    const profile = buildEsQualifications(ds, ds.memberByCapid.get(205) as MemberRow, {}, ASOF)
    expect(profile.map(q => q.achvId).sort((a, b) => a - b)).toEqual([53, 124, 169])
  })

  it('dedups by name with priority Training > Active > Not Approved > Expired', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 206 })]
    input.mbrAchievements = [
      makeAchv({ capid: 206, achvId: 69, status: 'EXPIRED', expiration: daysBefore(100) }),
      makeAchv({ capid: 206, achvId: 69, status: 'TRAINING', completed: daysBefore(30), expiration: null }),
    ]
    const ds = buildDataset(input)
    const quals = buildEsQualifications(ds, ds.memberByCapid.get(206) as MemberRow, {}, ASOF)
    expect(quals).toHaveLength(1)
    expect(quals[0]?.status).toBe('Training')
  })

  it('drops expired quals from dashboards after 180 days but keeps them on profiles until 730', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 207 })]
    input.mbrAchievements = [
      makeAchv({ capid: 207, achvId: 69, status: 'EXPIRED', expiration: daysBefore(200) }),
    ]
    const ds = buildDataset(input)
    const member = ds.memberByCapid.get(207) as MemberRow
    const dashboard = buildEsQualifications(ds, member, { forDashboard: true }, ASOF)
    expect(dashboard.find(q => q.achvId === 69)).toBeUndefined()
    const profile = buildEsQualifications(ds, member, {}, ASOF)
    expect(profile.find(q => q.achvId === 69)?.status).toBe('Expired')
  })

  it('drops expired quals from profiles after 730 days', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 208 })]
    input.mbrAchievements = [
      makeAchv({ capid: 208, achvId: 69, status: 'EXPIRED', expiration: daysBefore(800) }),
    ]
    const ds = buildDataset(input)
    const profile = buildEsQualifications(ds, ds.memberByCapid.get(208) as MemberRow, {}, ASOF)
    expect(profile.find(q => q.achvId === 69)).toBeUndefined()
  })

  it('flags Active quals expiring within 90 days', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 209 })]
    input.mbrAchievements = [
      makeAchv({ capid: 209, achvId: 69, expiration: daysAfter(30) }),
      makeAchv({ capid: 209, achvId: 70, expiration: daysAfter(200) }),
    ]
    const ds = buildDataset(input)
    const quals = buildEsQualifications(ds, ds.memberByCapid.get(209) as MemberRow, {}, ASOF)
    expect(quals.find(q => q.achvId === 69)?.isExpiringSoon).toBe(true)
    expect(quals.find(q => q.achvId === 69)?.daysTilExpiration).toBe(30)
    expect(quals.find(q => q.achvId === 70)?.isExpiringSoon).toBe(false)
  })
})

describe('prerequisite tree', () => {
  it('prunes direct prerequisites that appear transitively through another prerequisite', () => {
    const ds = buildDataset(emptyInput())
    const tree = buildEsPrerequisiteTree(ds, 100)
    expect(tree).not.toBeNull()
    expect(tree?.prerequisites.map(p => p.achvId)).toEqual([102])
    expect(tree?.prerequisites[0]?.prerequisites.map(p => p.achvId)).toEqual([101])
  })

  it('stops cycles with an "Already shown above" node', () => {
    const ds = buildDataset(emptyInput())
    const tree = buildEsPrerequisiteTree(ds, 200)
    const y = tree?.prerequisites[0]
    expect(y?.achvId).toBe(201)
    const backEdge = y?.prerequisites[0]
    expect(backEdge?.achvId).toBe(200)
    expect(backEdge?.note).toBe('Already shown above')
    expect(backEdge?.prerequisites).toEqual([])
  })

  it('returns null for an unknown achievement', () => {
    const ds = buildDataset(emptyInput())
    expect(buildEsPrerequisiteTree(ds, 99999)).toBeNull()
  })
})

describe('eligibility special cases', () => {
  it('GES: a senior with Level 1 (legacy LV1) and ICS 100 task credit is eligible', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 210 })]
    input.seniorLevel = [{ capid: 210, lvl: 'LV1', completed: new Date(2020, 0, 1) }]
    input.plMemberTaskCredit = [
      {
        memberTaskCreditId: 1,
        taskId: 131,
        capid: 210,
        statusId: 8,
        completed: new Date(2020, 0, 1),
        expiration: null,
      },
    ]
    const ds = buildDataset(input)
    const result = checkEsQualificationEligibility(ds, 53, ds.memberByCapid.get(210) as MemberRow, ASOF)
    expect(result.eligible).toBe(true)
  })

  it('GES: a senior with a PL "Level 1" path credit also satisfies Level 1', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 211 })]
    input.plMemberPathCredit = [
      {
        memberPathCreditId: 1,
        pathId: 1,
        capid: 211,
        statusId: 8,
        completed: new Date(2024, 0, 1),
        expiration: null,
        extraCreditEarned: null,
      },
    ]
    input.plMemberTaskCredit = [
      {
        memberTaskCreditId: 1,
        taskId: 131,
        capid: 211,
        statusId: 8,
        completed: new Date(2024, 0, 1),
        expiration: null,
      },
    ]
    const ds = buildDataset(input)
    const result = checkEsQualificationEligibility(ds, 53, ds.memberByCapid.get(211) as MemberRow, ASOF)
    expect(result.eligible).toBe(true)
  })

  it('GES: a senior without Level 1 is ineligible with a "Level 1" reason', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 212 })]
    const ds = buildDataset(input)
    const result = checkEsQualificationEligibility(ds, 53, ds.memberByCapid.get(212) as MemberRow, ASOF)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Level 1')
  })

  it('GES: a cadet needs an active Achievement 1 (Curry)', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 213, type: 'CADET', dob: yearsBefore(15) })]
    input.plMemberTaskCredit = [
      {
        memberTaskCreditId: 1,
        taskId: 131,
        capid: 213,
        statusId: 8,
        completed: new Date(2025, 0, 1),
        expiration: null,
      },
    ]
    const ds = buildDataset(input)
    const result = checkEsQualificationEligibility(ds, 53, ds.memberByCapid.get(213) as MemberRow, ASOF)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Achievement 1 (Curry)')
  })

  it('age gate: a 17-year-old cadet cannot qualify for GTL (18+)', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 214, type: 'CADET', dob: yearsBefore(17) })]
    const ds = buildDataset(input)
    const result = checkEsQualificationEligibility(ds, 69, ds.memberByCapid.get(214) as MemberRow, ASOF)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.startsWith('Age eligibility: 18'))).toBe(true)
  })

  it('UASMP (257) requires both TaskID 1502 and 1544', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 215 }), makeMember({ capid: 216 })]
    input.plMemberTaskCredit = [
      { memberTaskCreditId: 1, taskId: 1502, capid: 215, statusId: 8, completed: new Date(2025, 0, 1), expiration: null },
      { memberTaskCreditId: 2, taskId: 1502, capid: 216, statusId: 8, completed: new Date(2025, 0, 1), expiration: null },
      { memberTaskCreditId: 3, taskId: 1544, capid: 216, statusId: 8, completed: new Date(2025, 0, 1), expiration: null },
    ]
    const ds = buildDataset(input)

    const missing5u = checkEsQualificationEligibility(ds, 257, ds.memberByCapid.get(215) as MemberRow, ASOF)
    expect(missing5u.eligible).toBe(false)
    expect(missing5u.reasons).toContain('Current and valid Form 5U')

    const both = checkEsQualificationEligibility(ds, 257, ds.memberByCapid.get(216) as MemberRow, ASOF)
    expect(both.eligible).toBe(true)
  })

  it('PSC (64): AOBD plus GTM3 cross-training satisfies the OR; AOBD alone does not', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 217 }), makeMember({ capid: 218 })]
    input.mbrAchievements = [
      makeAchv({ capid: 217, achvId: 67 }),
      makeAchv({ capid: 217, achvId: 70 }),
      makeAchv({ capid: 218, achvId: 67 }),
    ]
    const ds = buildDataset(input)

    const crossTrained = checkEsQualificationEligibility(ds, 64, ds.memberByCapid.get(217) as MemberRow, ASOF)
    expect(crossTrained.eligible).toBe(true)

    const aobdOnly = checkEsQualificationEligibility(ds, 64, ds.memberByCapid.get(218) as MemberRow, ASOF)
    expect(aobdOnly.eligible).toBe(false)
    expect(aobdOnly.reasons).toContain('Cross-training requirement')
  })

  it('tree eligibility: missing an active prerequisite reports its name', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 219 })]
    const ds = buildDataset(input)
    // Node A (100) requires C (102) which requires B (101); member holds nothing.
    const result = checkEsQualificationEligibility(ds, 100, ds.memberByCapid.get(219) as MemberRow, ASOF)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Node C')
  })
})

describe('getEsAchievementTasks', () => {
  it('groups tasks by step with member completion state', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 220 })]
    input.achvStepTasks = [
      { achvStepTaskId: 1, achvId: 69, stepId: 1, taskId: 131 },
      { achvStepTaskId: 2, achvId: 69, stepId: 3, taskId: 1502 },
    ]
    input.mbrTasks = [
      { capid: 220, taskId: 131, status: 'ACTIVE', completed: new Date(2024, 0, 1), expiration: null, orgid: 1000 },
    ]
    const ds = buildDataset(input)
    const steps = getEsAchievementTasks(ds, 69, 220)
    expect(steps).toHaveLength(2)
    expect(steps[0]?.stepId).toBe(1)
    expect(steps[0]?.stepName).toBe('Prerequisites')
    expect(steps[0]?.tasks[0]?.completed).toBe(true)
    expect(steps[1]?.stepName).toBe('Familiarization and Preparatory Training')
    expect(steps[1]?.tasks[0]?.completed).toBe(false)
  })
})
