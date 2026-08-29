import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  type DatasetInput,
  type MemberRow,
  type PlMemberTaskCreditRow,
} from '../src/domain/dataset.js'
import {
  applyDutyTrackWarnings,
  calculateLevelsProgress,
  deriveLevelPathMap,
  determineLevel2Track,
  processSenior,
  processSeniors,
} from '../src/domain/senior.js'

const ASOF = new Date(2026, 7, 29)
const MS_PER_DAY = 86_400_000

const daysBefore = (days: number): Date => new Date(ASOF.getTime() - days * MS_PER_DAY)

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
    plPaths: [
      { pathId: 1, pathName: 'Level 1 - CAP Onboarding' },
      { pathId: 2, pathName: 'Level 2 Part 1 - Committed Airman' },
      { pathId: 3, pathName: 'Level 2 Part 2 - Committed Airman' },
      { pathId: 4, pathName: 'Level 3 - Enterprise Leader' },
      { pathId: 5, pathName: 'Level 4 - Field Grade Leader' },
      { pathId: 6, pathName: 'Level 5 - Executive Leader' },
    ],
    plGroups: [
      { groupId: 40, pathId: 4, groupName: 'Level 3 Core', numberOfRequiredTasks: 2, awardsExtraCredit: false },
      { groupId: 41, pathId: 4, groupName: 'Level 3 Extra Credit', numberOfRequiredTasks: 0, awardsExtraCredit: true },
      { groupId: 20, pathId: 2, groupName: 'Level 2 Part 1 Core', numberOfRequiredTasks: 1, awardsExtraCredit: false },
    ],
    plTasks: [
      { taskId: 401, taskName: 'L3 Task A', description: null },
      { taskId: 402, taskName: 'L3 Task B', description: null },
      { taskId: 403, taskName: 'L3 Extra', description: null },
      { taskId: 201, taskName: 'L2P1 Task', description: null },
    ],
    plTaskGroupAssignments: [
      { taskGroupAssignmentId: 1, taskId: 401, groupId: 40 },
      { taskGroupAssignmentId: 2, taskId: 402, groupId: 40 },
      { taskGroupAssignmentId: 3, taskId: 403, groupId: 41 },
      { taskGroupAssignmentId: 4, taskId: 201, groupId: 20 },
    ],
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

function makeTaskCredit(
  over: Partial<PlMemberTaskCreditRow> & { memberTaskCreditId: number; taskId: number; capid: number },
): PlMemberTaskCreditRow {
  return { statusId: 8, completed: new Date(2024, 0, 1), expiration: null, ...over }
}

describe('deriveLevelPathMap', () => {
  it('maps each level id to its path by name substring', () => {
    const ds = buildDataset(emptyInput())
    const map = deriveLevelPathMap(ds.plPaths)
    expect(map.get('L1')).toBe(1)
    expect(map.get('L2P1')).toBe(2)
    expect(map.get('L2P2')).toBe(3)
    expect(map.get('L3')).toBe(4)
    expect(map.get('L5')).toBe(6)
  })

  it('L2P2 falls back to the first "Level 2" path when Part 2 is absent', () => {
    const input = emptyInput()
    input.plPaths = [
      { pathId: 9, pathName: 'Level 2 - Old Combined' },
      { pathId: 1, pathName: 'Level 1' },
    ]
    const ds = buildDataset(input)
    const map = deriveLevelPathMap(ds.plPaths)
    expect(map.get('L2P2')).toBe(9)
    // v1's fallback also catches "Level 2 Part 1" via pathMatch first, so L2P1 is unmapped here.
    expect(map.get('L2P1')).toBeUndefined()
  })
})

describe('determineLevel2Track', () => {
  it('picks the most recently completed track choice', () => {
    const track = determineLevel2Track([
      makeTaskCredit({ memberTaskCreditId: 1, taskId: 190, capid: 1, completed: new Date(2020, 0, 1) }),
      makeTaskCredit({ memberTaskCreditId: 2, taskId: 269, capid: 1, completed: new Date(2022, 0, 1) }),
    ])
    expect(track).toBe('NEW')
  })

  it('breaks completed-date ties by higher credit id', () => {
    const sameDay = new Date(2022, 0, 1)
    const track = determineLevel2Track([
      makeTaskCredit({ memberTaskCreditId: 5, taskId: 268, capid: 1, completed: sameDay }),
      makeTaskCredit({ memberTaskCreditId: 9, taskId: 270, capid: 1, completed: sameDay }),
    ])
    expect(track).toBe('PROFESSIONAL')
  })

  it('ignores incomplete choices and returns null with none', () => {
    expect(
      determineLevel2Track([
        makeTaskCredit({ memberTaskCreditId: 1, taskId: 190, capid: 1, statusId: 26 }),
      ]),
    ).toBeNull()
    expect(determineLevel2Track([])).toBeNull()
  })
})

describe('calculateLevelsProgress', () => {
  it('legacy LV2 award completes both L2P1 and L2P2 (v1 ServicesDataService.html:99)', () => {
    const input = emptyInput()
    const completed = new Date(2010, 5, 1)
    input.members = [makeMember({ capid: 101 })]
    input.seniorLevel = [
      { capid: 101, lvl: 'LV1', completed: new Date(2009, 5, 1) },
      { capid: 101, lvl: 'LV2', completed },
    ]
    const ds = buildDataset(input)
    const { progress, currentLevel } = calculateLevelsProgress(ds, 101, deriveLevelPathMap(ds.plPaths))

    expect(progress.L1.status).toBe('completed')
    expect(progress.L2P1.status).toBe('completed')
    expect(progress.L2P1.percent).toBe(100)
    expect(progress.L2P1.legacy).toBe(true)
    expect(progress.L2P1.date).toEqual(completed)
    expect(progress.L2P2.status).toBe('completed')
    expect(progress.L2P2.legacy).toBe(true)
    expect(currentLevel).toBe(2)
  })

  it('counts required tasks per group and reports ready at 100% with no path credit', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 102 })]
    input.plMemberTaskCredit = [
      makeTaskCredit({ memberTaskCreditId: 1, taskId: 401, capid: 102 }),
      makeTaskCredit({ memberTaskCreditId: 2, taskId: 402, capid: 102 }),
      // Extra-credit group task must not inflate the totals.
      makeTaskCredit({ memberTaskCreditId: 3, taskId: 403, capid: 102 }),
    ]
    const ds = buildDataset(input)
    const { progress, currentLevel } = calculateLevelsProgress(ds, 102, deriveLevelPathMap(ds.plPaths))

    expect(progress.L3.totalReq).toBe(2)
    expect(progress.L3.totalComp).toBe(2)
    expect(progress.L3.percent).toBe(100)
    expect(progress.L3.status).toBe('ready')
    expect(progress.L3.approvalStatus).toBe('ready')
    // Ready is not completed: no current level credit yet.
    expect(currentLevel).toBe(0)
  })

  it('an approved path credit (StatusID 8) completes the level', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 103 })]
    input.plMemberPathCredit = [
      {
        memberPathCreditId: 1,
        pathId: 4,
        capid: 103,
        statusId: 8,
        completed: new Date(2024, 2, 2),
        expiration: null,
        extraCreditEarned: null,
      },
    ]
    const ds = buildDataset(input)
    const { progress, currentLevel } = calculateLevelsProgress(ds, 103, deriveLevelPathMap(ds.plPaths))
    expect(progress.L3.status).toBe('completed')
    expect(progress.L3.percent).toBe(100)
    expect(currentLevel).toBe(3)
  })

  it('a pending path credit (StatusID 26) at 100% shows pending', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 104 })]
    input.plMemberTaskCredit = [
      makeTaskCredit({ memberTaskCreditId: 1, taskId: 401, capid: 104 }),
      makeTaskCredit({ memberTaskCreditId: 2, taskId: 402, capid: 104 }),
    ]
    input.plMemberPathCredit = [
      {
        memberPathCreditId: 2,
        pathId: 4,
        capid: 104,
        statusId: 26,
        completed: new Date(2025, 0, 5),
        expiration: null,
        extraCreditEarned: null,
      },
    ]
    const ds = buildDataset(input)
    const { progress } = calculateLevelsProgress(ds, 104, deriveLevelPathMap(ds.plPaths))
    expect(progress.L3.status).toBe('pending')
    expect(progress.L3.approvalStatus).toBe('pending')
  })
})

describe('duty/track discrepancy warnings', () => {
  it('flags a duty whose mapped track is not enrolled', () => {
    const { dutiesWithStatus } = applyDutyTrackWarnings(
      [{ name: 'Safety Officer', isAsst: false, date: null, orgString: 'GLR-MI-090', displayName: 'Safety Officer' }],
      [],
    )
    expect(dutiesWithStatus[0]?.hasTrack).toBe(false)
    expect(dutiesWithStatus[0]?.warningMsg).toBe('Missing Track: SAFETY')
  })

  it('flags a NONE-level track with no mapped duty held', () => {
    const { tracksWithStatus } = applyDutyTrackWarnings(
      [],
      [{ name: 'SAFETY', level: 'NONE', date: null }],
    )
    expect(tracksWithStatus[0]?.hasDuty).toBe(false)
    expect(tracksWithStatus[0]?.warningMsg).toBe('Enrolled (NONE) but no Duty Position assigned.')
  })

  it('does not warn when the duty has a matching enrolled track', () => {
    const { dutiesWithStatus, tracksWithStatus } = applyDutyTrackWarnings(
      [{ name: 'SAFETY OFFICER', isAsst: false, date: null, orgString: 'X', displayName: 'SAFETY OFFICER' }],
      [{ name: 'SAFETY', level: 'NONE', date: null }],
    )
    expect(dutiesWithStatus[0]?.hasTrack).toBe(true)
    expect(tracksWithStatus[0]?.hasDuty).toBe(true)
  })
})

describe('promotion eligibility (corrected CAPR 35-5 rules)', () => {
  function captWithLevel4(capid: number, rankDate: Date): DatasetInput {
    const input = emptyInput()
    input.members = [makeMember({ capid, rank: 'Capt', rankDate })]
    input.seniorLevel = [{ capid, lvl: 'LV4', completed: new Date(2020, 0, 1) }]
    return input
  }

  it('a Capt with 47 months TIG and Level 4 is NOT promotable', () => {
    // 1431 days / 30.44 days-per-month = 47 months (v1 month arithmetic).
    const input = captWithLevel4(102, daysBefore(1431))
    const ds = buildDataset(input)
    const member = ds.memberByCapid.get(102) as MemberRow
    const result = processSenior(ds, member, ASOF)
    expect(result.currentLevel).toBe(4)
    expect(result.promotion?.nextRank).toBe('Maj')
    expect(result.promotion?.tigMonthsRequired).toBe(48)
    expect(result.promotion?.tigMonthsCurrent).toBe(47)
    expect(result.promotion?.isTigMet).toBe(false)
    expect(result.promotion?.isLevelMet).toBe(true)
    expect(result.promotion?.isEligible).toBe(false)
  })

  it('the same Capt at 48 months TIG IS promotable', () => {
    const input = captWithLevel4(103, daysBefore(1462))
    const ds = buildDataset(input)
    const member = ds.memberByCapid.get(103) as MemberRow
    const result = processSenior(ds, member, ASOF)
    expect(result.promotion?.tigMonthsCurrent).toBe(48)
    expect(result.promotion?.isTigMet).toBe(true)
    expect(result.promotion?.isEligible).toBe(true)
  })

  it('SM needs L1 + L2P1 and 6 months as a member (fig 2)', () => {
    const input = emptyInput()
    input.members = [
      makeMember({ capid: 104, rank: 'SM', rankDate: daysBefore(155), joined: daysBefore(155) }),
      makeMember({ capid: 105, rank: 'SM', rankDate: daysBefore(200), joined: daysBefore(200) }),
    ]
    for (const capid of [104, 105]) {
      input.seniorLevel.push({ capid, lvl: 'LV1', completed: new Date(2026, 0, 1) })
      input.plMemberPathCredit.push({
        memberPathCreditId: capid,
        pathId: 2,
        capid,
        statusId: 8,
        completed: new Date(2026, 1, 1),
        expiration: null,
        extraCreditEarned: null,
      })
    }
    const ds = buildDataset(input)

    const fiveMonths = processSenior(ds, ds.memberByCapid.get(104) as MemberRow, ASOF)
    expect(fiveMonths.promotion?.isLevelMet).toBe(true)
    expect(fiveMonths.promotion?.membershipMonthsRequired).toBe(6)
    expect(fiveMonths.promotion?.membershipMonthsCurrent).toBe(5)
    expect(fiveMonths.promotion?.isMembershipMet).toBe(false)
    expect(fiveMonths.promotion?.isEligible).toBe(false)

    const sixMonths = processSenior(ds, ds.memberByCapid.get(105) as MemberRow, ASOF)
    expect(sixMonths.promotion?.membershipMonthsCurrent).toBe(6)
    expect(sixMonths.promotion?.isEligible).toBe(true)
  })

  it('Lt Col has no promotion row (Colonel is a special appointment)', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 106, rank: 'Lt Col', rankDate: daysBefore(4000) })]
    const ds = buildDataset(input)
    const result = processSenior(ds, ds.memberByCapid.get(106) as MemberRow, ASOF)
    expect(result.promotion).toBeNull()
  })

  it('NCO duty-position duration gates the TSgt -> MSgt promotion', () => {
    const input = emptyInput()
    input.members = [makeMember({ capid: 107, rank: 'TSgt', rankDate: daysBefore(800) })]
    input.seniorLevel = [{ capid: 107, lvl: 'LV3', completed: new Date(2020, 0, 1) }]
    input.dutyPositions = [
      { capid: 107, duty: 'NCO Something', functArea: null, lvl: null, asst: false, dateMod: daysBefore(400), orgid: 1000 },
    ]
    const ds = buildDataset(input)
    const result = processSenior(ds, ds.memberByCapid.get(107) as MemberRow, ASOF)
    // 800 days = 26 months TIG (met); duty held 400 days = 13 of 24 months (not met).
    expect(result.promotion?.isTigMet).toBe(true)
    expect(result.promotion?.dutyReq).toBe('Unit NCO')
    expect(result.promotion?.isDutyMet).toBe(false)
    expect(result.promotion?.currentDutyMonths).toBe(13)
    expect(result.promotion?.isEligible).toBe(false)
  })
})

describe('processSeniors', () => {
  it('includes ACTIVE SENIOR and LIFE members in scope, excludes cadets and other orgs', () => {
    const input = emptyInput()
    input.organizations = [
      {
        orgid: 1000,
        region: 'GLR',
        wing: 'MI',
        unit: '090',
        nextLevel: null,
        name: 'Test Sq',
        type: 'UNIT',
        dateChartered: null,
        status: 'ACTIVE',
        scope: 'UNIT',
      },
    ]
    input.members = [
      makeMember({ capid: 1, type: 'SENIOR' }),
      makeMember({ capid: 2, type: 'LIFE' }),
      makeMember({ capid: 3, type: 'CADET' }),
      makeMember({ capid: 4, type: 'SENIOR', mbrStatus: 'EXPIRED' }),
      makeMember({ capid: 5, type: 'SENIOR', orgid: 2000 }),
    ]
    const ds = buildDataset(input)
    const results = processSeniors(ds, new Set([1000]), ASOF)
    expect(results.map(r => r.capid).sort()).toEqual([1, 2])
    expect(results[0]?.memberUnitName).toBe('GLR-MI-090')
  })
})
