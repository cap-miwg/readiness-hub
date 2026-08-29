import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  type CadetAchvAprRow,
  type CadetAchvFullReportRow,
  type CadetAchvRow,
  type CadetActivityRow,
  type CadetHfzRow,
  type CadetRankRow,
  type Dataset,
  type DatasetInput,
  type MemberRow,
  type OrganizationRow,
  type PlMemberPathCreditRow,
  type PlMemberTaskCreditRow,
} from '../src/domain/dataset.js'
import {
  checkHfzStatus,
  checkHonorCredit,
  getAchievementRequirements,
  processCadet,
  processCadets,
} from '../src/domain/cadet.js'
import {
  ACHIEVEMENT_AEROSPACE_MODULE_TASKS,
  ACHIEVEMENT_LEADERSHIP_MODULE_TASKS,
  CADET_ACHIEVEMENT_PATH_IDS,
  CADET_ACHIEVEMENT_PIONEERS,
  CADET_ACHIEVEMENT_REQUIREMENTS,
  CADET_ACHIEVEMENT_TO_RANK,
  CADET_ACTIVE_PARTICIPATION_TASKS,
  CADET_CHARACTER_FORUM_TASKS,
  CADET_DRILL_TASKS,
  CADET_LEADERSHIP_EXPECTATIONS_TASKS,
  CADET_MILESTONE_ACHIEVEMENTS,
  CADET_MIN_TEST_SCORE,
  CADET_OATH_TASKS,
  CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS,
  CADET_PHASES,
  CADET_PUBLIC_ACHIEVEMENT_NUMBERS,
  CADET_SDA_PRESENTATION_TASKS,
  CADET_SDA_SERVICE_TASKS,
  CADET_SDA_WRITING_TASKS,
  CADET_TIME_IN_GRADE_DAYS,
  CADET_UNIFORM_TASKS,
  MILESTONE_EXAM_TASKS,
} from '../src/domain/constants/cadetConstants.js'

const DAY_MS = 24 * 60 * 60 * 1000

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function member(capid: number, orgid: number, over: Partial<MemberRow> = {}): MemberRow {
  return {
    capid,
    nameLast: 'Cadet',
    nameFirst: `C${capid}`,
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

function org(orgid: number, unit: string): OrganizationRow {
  return {
    orgid,
    region: 'GLR',
    wing: 'MI',
    unit,
    nextLevel: null,
    name: `Unit ${unit}`,
    type: 'SQUADRON',
    dateChartered: null,
    status: 'ACTIVE',
    scope: 'UNIT',
  }
}

function rank(capid: number, rankName: string, rankDate: Date): CadetRankRow {
  return { capid, rank: rankName, rankDate, dateMod: rankDate }
}

function apr(capid: number, cadetAchvId: number, dateMod: Date | null): CadetAchvAprRow {
  return { capid, cadetAchvId, status: 'APR', awardNo: null, dateMod }
}

function fullReport(capid: number, achvName: string, aprDate: Date): CadetAchvFullReportRow {
  return { capid, achvName, aprDate }
}

let creditSeq = 1
function taskCredit(capid: number, taskId: number, statusId = 8): PlMemberTaskCreditRow {
  return { memberTaskCreditId: creditSeq++, taskId, capid, statusId, completed: null, expiration: null }
}

function pathCredit(capid: number, pathId: number, extraCreditEarned: string | null): PlMemberPathCreditRow {
  return {
    memberPathCreditId: creditSeq++,
    pathId,
    capid,
    statusId: 8,
    completed: null,
    expiration: null,
    extraCreditEarned,
  }
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

function cadetAchv(capid: number, cadetAchvId: number, over: Partial<CadetAchvRow> = {}): CadetAchvRow {
  return {
    capid,
    cadetAchvId,
    phyFitTest: null,
    leadLabDateP: null,
    leadLabScore: null,
    aeDateP: null,
    aeScore: null,
    aeMod: null,
    aeTest: null,
    moralLDateP: null,
    activePart: null,
    otherReq: null,
    sdaReport: null,
    dateMod: null,
    drillDate: null,
    drillScore: null,
    leadCurr: null,
    cadetOath: null,
    aeBookValue: null,
    mileRun: null,
    shuttleRun: null,
    sitAndReach: null,
    pushUps: null,
    curlUps: null,
    hfzId: null,
    staffServiceDate: null,
    technicalWritingAssignment: null,
    technicalWritingAssignmentDate: null,
    oralPresentationDate: null,
    speechDate: null,
    leadershipEssayDate: null,
    ...over,
  }
}

function activity(capid: number, type: string, completed: Date, location: string | null): CadetActivityRow {
  return { capid, type, location, completed }
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
 * Fixture CAPIDs:
 * 100001 (org 2001): working on achievement 2, all cadet-controllable
 *   requirements done, TIG driving the state.
 * 200001 (org 2002): only a failed HFZ attempt within 180 days (plus an old
 *   pass outside the window).
 * 200002 (org 2002): a passing HFZ within 180 days.
 * 300001 (org 2002): achievements 1-9 approved, Mitchell next; the Mitchell
 *   TIG edge (8 and 9 are both C/CMSgt).
 * 400001-400003 (org 2002): honor credit paths.
 * 500001 (org 2002): sentinel approval date, full-report fallback.
 * 100999 senior and 100998 inactive cadet (org 2001): excluded from scope.
 */
function buildFixture(): Dataset {
  const input = emptyInput()
  input.organizations = [org(2001, '205'), org(2002, '260')]
  input.members = [
    member(100001, 2001),
    member(100999, 2001, { type: 'SENIOR', rank: 'CAPT' }),
    member(100998, 2001, { mbrStatus: 'EXPIRED' }),
    member(200001, 2002),
    member(200002, 2002),
    member(300001, 2002),
    member(400001, 2002),
    member(400002, 2002),
    member(400003, 2002),
    member(500001, 2002),
  ]

  // 100001: achievement 1 approved 2026-03-01, everything for achievement 2
  // done except staff checkboxes and TIG
  input.cadetRank.push(rank(100001, 'C/Amn', d('2026-01-01')))
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

  // 200001: failed attempt inside 180 days, pass far outside it
  input.cadetHfz.push(hfz(200001, 21, d('2026-03-01'), false))
  input.cadetHfz.push(hfz(200001, 22, d('2025-06-01'), true))
  // 200002: pass inside 180 days
  input.cadetHfz.push(hfz(200002, 23, d('2026-03-01'), true))

  // 300001: 1-9 approved; 8 approved 2026-01-10 (rank date), 9 approved
  // 2026-03-01; Mitchell exams done and encampment via activity
  input.cadetRank.push(rank(300001, 'C/CMSgt', d('2026-01-10')))
  for (let id = 1; id <= 7; id++) input.cadetAchvAprs.push(apr(300001, id, d('2025-06-01')))
  input.cadetAchvAprs.push(apr(300001, 8, d('2026-01-10')))
  input.cadetAchvAprs.push(apr(300001, 9, d('2026-03-01')))
  input.plMemberTaskCredit.push(
    taskCredit(300001, MILESTONE_EXAM_TASKS.mitchellLeadershipExam),
    taskCredit(300001, MILESTONE_EXAM_TASKS.mitchellAerospaceExam),
  )
  input.cadetActivities.push(activity(300001, 'ENCAMP', d('2025-07-15'), 'Alpena CRTC'))

  // 400001: path credit says earned
  input.plMemberPathCredit.push(
    pathCredit(400001, 32, '{CreditEarned: true, EarnedDate: 2026-02-01}'),
  )
  // 400002: path credit row exists without extra credit, legacy conditions met
  // anyway (fallback must NOT fire)
  input.plMemberPathCredit.push(pathCredit(400002, 32, '{CreditEarned: false}'))
  input.plMemberTaskCredit.push(taskCredit(400002, 331), taskCredit(400002, 334))
  input.cadetAchv.push(
    cadetAchv(400002, 2, {
      leadLabDateP: d('2026-01-05'),
      leadLabScore: '85',
      aeDateP: d('2026-01-06'),
      aeScore: '90',
    }),
  )
  // 400003: no path credit rows at all, legacy conditions met
  input.plMemberTaskCredit.push(taskCredit(400003, 331), taskCredit(400003, 334))
  input.cadetAchv.push(
    cadetAchv(400003, 2, {
      leadLabDateP: d('2026-01-05'),
      leadLabScore: '85',
      aeDateP: d('2026-01-06'),
      aeScore: '90',
    }),
  )

  // 500001: approval row carries the null sentinel (already null in v2);
  // CadetAchvFullReport has the real date
  input.cadetRank.push(rank(500001, 'C/Amn', d('2026-01-01')))
  input.cadetAchvAprs.push(apr(500001, 1, null))
  input.cadetAchvFullReport.push(fullReport(500001, 'ACHIEVEMENT 1', d('2026-03-01')))

  return buildDataset(input)
}

describe('cadet constants', () => {
  it('public achievement numbers are a bijection from the 16 non-milestones onto 1..16', () => {
    const nonMilestones: number[] = []
    for (let id = 1; id <= 21; id++) {
      if (!CADET_MILESTONE_ACHIEVEMENTS.includes(id)) nonMilestones.push(id)
    }
    expect(nonMilestones).toHaveLength(16)
    const publicNumbers = nonMilestones.map(id => CADET_PUBLIC_ACHIEVEMENT_NUMBERS.get(id))
    for (const n of publicNumbers) expect(n).toBeTypeOf('number')
    expect(new Set(publicNumbers).size).toBe(16)
    expect([...(publicNumbers as number[])].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
    for (const milestone of CADET_MILESTONE_ACHIEVEMENTS) {
      expect(CADET_PUBLIC_ACHIEVEMENT_NUMBERS.has(milestone)).toBe(false)
    }
    expect(CADET_PUBLIC_ACHIEVEMENT_NUMBERS.get(5)).toBe(4)
    expect(CADET_PUBLIC_ACHIEVEMENT_NUMBERS.get(19)).toBe(16)
  })

  it('pioneer names key only non-milestone CadetAchvIDs', () => {
    expect(CADET_ACHIEVEMENT_PIONEERS.size).toBe(10)
    for (const id of CADET_ACHIEVEMENT_PIONEERS.keys()) {
      expect(CADET_MILESTONE_ACHIEVEMENTS.includes(id)).toBe(false)
      expect(Number.isInteger(id)).toBe(true)
    }
    expect(CADET_ACHIEVEMENT_PIONEERS.get(1)).toBe('Curry')
    expect(CADET_ACHIEVEMENT_PIONEERS.get(17)).toBe('Boyd')
  })

  it('scalar thresholds and milestone exam TaskIDs match v1', () => {
    expect(CADET_TIME_IN_GRADE_DAYS).toBe(56)
    expect(CADET_MIN_TEST_SCORE).toBe(80)
    expect(MILESTONE_EXAM_TASKS).toEqual({
      cadetWingmanCourse: 329,
      wrightBrothersLeadershipExam: 347,
      achievement8Speech: 374,
      achievement8Essay: 373,
      mitchellLeadershipExam: 378,
      mitchellAerospaceExam: 379,
      encampment: 381,
      earhartLeadershipExam: 414,
      eakerSpeech: 441,
      eakerEssay: 442,
      cls: 444,
      spaatzLeadershipExam: 445,
      spaatzJOFExam: 446,
      spaatzEssay: 447,
      spaatzCFA: 448,
    })
  })

  it('task maps carry the expected nonzero entry counts with integer ids', () => {
    expect(CADET_ACHIEVEMENT_REQUIREMENTS.size).toBe(21)
    expect(CADET_LEADERSHIP_EXPECTATIONS_TASKS.size).toBe(21)
    expect(CADET_OATH_TASKS.size).toBe(21)
    expect(CADET_ACTIVE_PARTICIPATION_TASKS.size).toBe(21)
    expect(CADET_UNIFORM_TASKS.size).toBe(20)
    expect(CADET_DRILL_TASKS.size).toBe(9)
    expect(CADET_CHARACTER_FORUM_TASKS.size).toBe(15)
    expect(CADET_SDA_SERVICE_TASKS.size).toBe(8)
    expect(CADET_SDA_PRESENTATION_TASKS.size).toBe(8)
    expect(CADET_SDA_WRITING_TASKS).toHaveLength(8)
    expect(CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS.size).toBe(4)
    expect(ACHIEVEMENT_LEADERSHIP_MODULE_TASKS.size).toBe(16)
    expect(ACHIEVEMENT_AEROSPACE_MODULE_TASKS.size).toBe(11)
    expect(CADET_ACHIEVEMENT_PATH_IDS.size).toBe(16)
    expect(CADET_ACHIEVEMENT_TO_RANK.size).toBe(21)
    expect(CADET_PHASES.size).toBe(5)
    expect(CADET_OATH_TASKS.get(21)).toBe(513)
    expect(CADET_ACHIEVEMENT_PATH_IDS.get(19)).toBe(49)
    expect(ACHIEVEMENT_LEADERSHIP_MODULE_TASKS.get(1)).toEqual([325, 326])
    expect(ACHIEVEMENT_AEROSPACE_MODULE_TASKS.get(11)).toEqual([394]) // JOF override
    expect(CADET_ACHIEVEMENT_TO_RANK.get(8)).toBe('C/CMSgt')
    expect(CADET_ACHIEVEMENT_TO_RANK.get(9)).toBe('C/CMSgt')
  })
})

describe('time in grade and the six-state machine', () => {
  it('is TIME_PENDING at 30 days TIG and READY at 60 days, asOf-shifted', () => {
    const ds = buildFixture()
    const cadet = ds.memberByCapid.get(100001)
    expect(cadet).toBeDefined()

    const at30 = processCadet(ds, cadet as MemberRow, d('2026-03-31'))
    expect(at30.currentAchievement).toBe(1)
    expect(at30.nextAchievement).toBe(2)
    expect(at30.timeInGrade.days).toBe(30)
    expect(at30.timeInGrade.isEligible).toBe(false)
    expect(at30.promotion.state).toBe('TIME_PENDING')
    expect(at30.promotion.message).toBe('26 days until eligible')
    // 7 of the 10 achievement-2 requirements done (all but TIG and the two
    // staff checkboxes)
    expect(at30.nextRequirements?.completionPercent).toBe(70)
    expect(at30.tigCompleteOn?.getTime()).toBe(d('2026-03-01').getTime() + 56 * DAY_MS)
    expect(at30.tigCompleteOn?.toISOString().slice(0, 10)).toBe('2026-04-26')
    expect(at30.unitName).toBe('GLR-MI-205')
    // HFZ attempt on 2026-03-10 satisfies achievement 2 and stays valid 180 days
    expect(at30.hfz?.status).toBe('ATTEMPTED')
    expect(at30.hfzValidUntil?.getTime()).toBe(d('2026-03-10').getTime() + 180 * DAY_MS)

    const at60 = processCadet(ds, cadet as MemberRow, d('2026-04-30'))
    expect(at60.timeInGrade.days).toBe(60)
    expect(at60.timeInGrade.isEligible).toBe(true)
    expect(at60.promotion.state).toBe('READY')
    expect(at60.nextRequirements?.completionPercent).toBe(80)
  })

  it('scopes processCadets to ACTIVE CADET members of the requested orgids', () => {
    const ds = buildFixture()
    const asOf = d('2026-03-31')
    const inScope = processCadets(ds, [2001], asOf)
    expect(inScope.map(c => c.capid)).toEqual([100001]) // senior and expired cadet excluded
    const both = processCadets(ds, [2001, 2002, 2001], asOf)
    expect(both).toHaveLength(8)
  })
})

describe('HFZ attempt vs pass split', () => {
  const asOf = d('2026-03-31')

  it('achievements 1-3 accept any attempt within 180 days; 4+ require a pass', () => {
    const ds = buildFixture()
    // 200001 has only a failed attempt inside the window
    expect(checkHfzStatus(ds, 200001, 2, asOf).status).toBe('ATTEMPTED')
    const failed = checkHfzStatus(ds, 200001, 5, asOf)
    expect(failed.status).toBe('EXPIRED')
    expect(failed.date?.getTime()).toBe(d('2025-06-01').getTime()) // last passing, outside window
    expect(failed.validUntil).toBeNull()
    // 200002 passed inside the window
    const passed = checkHfzStatus(ds, 200002, 5, asOf)
    expect(passed.status).toBe('PASSED')
    expect(passed.validUntil?.getTime()).toBe(d('2026-03-01').getTime() + 180 * DAY_MS)
  })

  it('feeds the physicalFitness requirement accordingly', () => {
    const ds = buildFixture()
    const attemptOnly2 = getAchievementRequirements(ds, 200001, 2, null, asOf)
    expect(attemptOnly2.requirements.find(r => r.key === 'physicalFitness')?.completed).toBe(true)
    const attemptOnly5 = getAchievementRequirements(ds, 200001, 5, null, asOf)
    expect(attemptOnly5.requirements.find(r => r.key === 'physicalFitness')?.completed).toBe(false)
    const passed5 = getAchievementRequirements(ds, 200002, 5, null, asOf)
    expect(passed5.requirements.find(r => r.key === 'physicalFitness')?.completed).toBe(true)
  })
})

describe('Mitchell TIG edge', () => {
  it('runs TIG from Achievement 9 approval, not the shared C/CMSgt rank date', () => {
    const ds = buildFixture()
    const cadet = ds.memberByCapid.get(300001)
    const result = processCadet(ds, cadet as MemberRow, d('2026-03-31'))
    expect(result.currentAchievement).toBe(9)
    expect(result.nextAchievement).toBe(10)
    expect(result.phase).toBe(2)
    // 30 days from the 2026-03-01 approval of achievement 9; the rank date
    // 2026-01-10 (achievement 8) would give 80
    expect(result.timeInGrade.days).toBe(30)
    expect(result.lastPromotionDate?.getTime()).toBe(d('2026-03-01').getTime())
    expect(result.tigCompleteOn?.toISOString().slice(0, 10)).toBe('2026-04-26')
    // Milestone exam tasks and the encampment activity register on the
    // Mitchell requirement set
    const reqs = result.nextRequirements
    expect(reqs?.requirements.find(r => r.key === 'mitchellLeadershipExam')?.completed).toBe(true)
    expect(reqs?.requirements.find(r => r.key === 'mitchellAerospaceExam')?.completed).toBe(true)
    const encampment = reqs?.requirements.find(r => r.key === 'encampment')
    expect(encampment?.completed).toBe(true)
    expect(encampment?.value).toBe('Completed on 2025-07-15 at Alpena CRTC')
  })
})

describe('honor credit', () => {
  it('earns from the path credit ExtraCreditEarned blob', () => {
    const ds = buildFixture()
    const credit = checkHonorCredit(ds, 400001, 2)
    expect(credit.earned).toBe(true)
    expect(credit.earnedDate).toBe('2026-02-01')
  })

  it('does not fall back to legacy when path credit rows exist without extra credit', () => {
    const ds = buildFixture()
    const credit = checkHonorCredit(ds, 400002, 2)
    expect(credit.earned).toBe(false)
    expect(credit.reason).toBe('Extra credit not earned')
    expect(credit.legacyDetails).toBeNull()
  })

  it('uses the legacy four-condition test only when no path credit rows exist', () => {
    const ds = buildFixture()
    const credit = checkHonorCredit(ds, 400003, 2)
    expect(credit.earned).toBe(true)
    expect(credit.legacyDetails).toEqual({
      leadershipModule: true,
      aerospaceModule: true,
      leadershipTest: true,
      aerospaceTest: true,
    })
  })

  it('never applies to milestones', () => {
    const ds = buildFixture()
    const credit = checkHonorCredit(ds, 400001, 10)
    expect(credit.earned).toBe(false)
    expect(credit.reason).toBe('N/A - Milestone Award')
  })

  it('surfaces earned credits on the processed cadet', () => {
    const input = emptyInput()
    input.organizations = [org(2002, '260')]
    input.members = [member(400001, 2002)]
    input.cadetAchvAprs.push(apr(400001, 1, d('2025-01-01')), apr(400001, 2, d('2025-06-01')))
    input.plMemberPathCredit.push(
      pathCredit(400001, 32, '{CreditEarned: true, EarnedDate: 2026-02-01}'),
    )
    const isolated = buildDataset(input)
    const result = processCadet(isolated, isolated.memberByCapid.get(400001) as MemberRow, d('2026-03-31'))
    expect(result.honorCreditAchievements).toEqual([{ achievementId: 2, earnedDate: '2026-02-01' }])
  })
})

describe('sentinel approval date fallback', () => {
  it('falls back to CadetAchvFullReport AprDate when the APR DateMod is the sentinel', () => {
    const ds = buildFixture()
    const cadet = ds.memberByCapid.get(500001)
    const result = processCadet(ds, cadet as MemberRow, d('2026-03-31'))
    expect(result.currentAchievement).toBe(1)
    // 30 days from the full-report AprDate 2026-03-01, not 89 from the
    // 2026-01-01 rank date
    expect(result.timeInGrade.days).toBe(30)
    expect(result.lastPromotionDate?.getTime()).toBe(d('2026-03-01').getTime())
  })
})
