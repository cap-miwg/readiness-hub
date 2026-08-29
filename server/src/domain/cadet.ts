/**
 * Cadet Programs domain module, ported from v1 createCadetDataService
 * (ServicesCadetDataService.html) plus UtilsCadetHelpers.html and
 * UtilsDateHelpers.html. Pure functions over the indexed Dataset; every
 * time-dependent computation takes an explicit asOf.
 */

import type { CadetHfzRow, CadetRankRow, Dataset, MemberRow } from './dataset.js'
import {
  ACHIEVEMENT_AEROSPACE_MODULE_TASKS,
  ACHIEVEMENT_LEADERSHIP_MODULE_TASKS,
  CADET_ACHIEVEMENT_NAMES,
  CADET_ACHIEVEMENT_PATH_IDS,
  CADET_ACHIEVEMENT_PIONEERS,
  CADET_ACHIEVEMENT_REQUIREMENTS,
  CADET_ACTIVE_PARTICIPATION_TASKS,
  CADET_CHARACTER_FORUM_TASKS,
  CADET_DEFAULT_REQUIREMENTS,
  CADET_DRILL_TASKS,
  CADET_LEADERSHIP_EXPECTATIONS_TASKS,
  CADET_MAX_ACHIEVEMENT_ID,
  CADET_MILESTONE_ACHIEVEMENTS,
  CADET_MIN_TEST_SCORE,
  CADET_OATH_TASKS,
  CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS,
  CADET_PHASES,
  CADET_PUBLIC_ACHIEVEMENT_NUMBERS,
  CADET_REQUIREMENT_LABELS,
  CADET_SDA_PRESENTATION_TASKS,
  CADET_SDA_SERVICE_TASKS,
  CADET_SDA_WRITING_TASKS,
  CADET_TIME_IN_GRADE_DAYS,
  CADET_UNIFORM_TASKS,
  HFZ_CREDIT_WINDOW_DAYS,
  MILESTONE_EXAM_TASKS,
  type RequirementKey,
} from './constants/cadetConstants.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** UtilsDateHelpers.html:3-9: ceil of the absolute day difference. */
function daysSince(date: Date, asOf: Date): number {
  return Math.ceil(Math.abs(asOf.getTime() - date.getTime()) / DAY_MS)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** v1 parseInt(score) || 0 (ServicesCadetDataService.html:369, :404, :415). */
function scoreOrZero(score: string | null): number {
  return score === null ? 0 : parseInt(score, 10) || 0
}

// --- Helpers over the dataset ---

function makeTaskCheck(dataset: Dataset, capid: number): (taskId: number | undefined) => boolean {
  // PL task credit counts only at StatusID 8, complete
  // (ServicesCadetDataService.html:224-228)
  return taskId =>
    taskId !== undefined && (dataset.completedCapidsByTaskId.get(taskId)?.has(capid) ?? false)
}

export function getCurrentCadetRank(dataset: Dataset, capid: number): CadetRankRow | null {
  const ranks = dataset.cadetRanksByCapid.get(capid)
  if (!ranks || ranks.length === 0) return null
  let best: CadetRankRow | null = null
  for (const r of ranks) {
    if (best === null || (r.rankDate?.getTime() ?? -Infinity) > (best.rankDate?.getTime() ?? -Infinity)) {
      best = r
    }
  }
  return best
}

export function getApprovedAchievements(dataset: Dataset, capid: number): number[] {
  return (dataset.cadetAchvAprsByCapid.get(capid) ?? [])
    .filter(a => a.status === 'APR')
    .map(a => a.cadetAchvId)
    .sort((a, b) => a - b)
}

/**
 * Approval date of one achievement: the APR row's DateMod
 * (ServicesCadetDataService.html:64-69). When that date is the null sentinel,
 * fall back to CadetAchvFullReport.AprDate matched by achievement name, as
 * the v1 cadet profile does (ComponentsCadetComponents.html:374-408). v1
 * prefers the approval row's DateCreated there; v2 does not ingest
 * DateCreated (see ingest/tables.ts), so DateMod is the primary source.
 */
export function resolveApprovalDate(
  dataset: Dataset,
  capid: number,
  achievementId: number,
): Date | null {
  const apr = (dataset.cadetAchvAprsByCapid.get(capid) ?? []).find(
    a => a.cadetAchvId === achievementId && a.status === 'APR',
  )
  if (apr?.dateMod) return apr.dateMod
  const name = CADET_ACHIEVEMENT_NAMES.get(achievementId)?.toLowerCase()
  if (name) {
    const full = (dataset.cadetAchvFullByCapid.get(capid) ?? []).find(
      r => r.achvName.trim().toLowerCase() === name,
    )
    if (full?.aprDate) return full.aprDate
  }
  return null
}

// --- Time in grade ---

export interface TimeInGrade {
  days: number
  weeks: number
  isEligible: boolean
  /** Effective date + CADET_TIME_IN_GRADE_DAYS; null without an effective date. */
  eligibleOn: Date | null
}

/** ServicesCadetDataService.html:71-88. */
export function getTimeInGrade(effectiveDate: Date | null, asOf: Date): TimeInGrade {
  if (!effectiveDate) return { days: 0, weeks: 0, isEligible: false, eligibleOn: null }
  const days = daysSince(effectiveDate, asOf)
  return {
    days,
    weeks: Math.floor(days / 7),
    isEligible: days >= CADET_TIME_IN_GRADE_DAYS,
    eligibleOn: addDays(effectiveDate, CADET_TIME_IN_GRADE_DAYS),
  }
}

// --- HFZ ---

export type HfzState = 'PASSED' | 'ATTEMPTED' | 'EXPIRED' | 'NOT_ATTEMPTED'

export interface HfzStatus {
  status: HfzState
  message: string
  date: Date | null
  /** DateTaken + 180 days for the record that satisfied the window; else null. */
  validUntil: Date | null
}

/**
 * ServicesCadetDataService.html:90-194. Achievements 1-3 need ANY HFZ attempt
 * within 180 days of asOf; achievement 4 (Wright Brothers) and beyond need a
 * PASSING HFZ within 180 days.
 */
export function checkHfzStatus(
  dataset: Dataset,
  capid: number,
  achievementId: number,
  asOf: Date,
): HfzStatus {
  const requiresPassing = achievementId >= 4
  const records = (dataset.cadetHfzByCapid.get(capid) ?? [])
    .filter((h): h is CadetHfzRow & { dateTaken: Date } => h.dateTaken !== null)
    .sort((a, b) => b.dateTaken.getTime() - a.dateTaken.getTime())
  if (records.length === 0) {
    return { status: 'NOT_ATTEMPTED', message: 'No HFZ record found', date: null, validUntil: null }
  }

  const cutoff = asOf.getTime() - HFZ_CREDIT_WINDOW_DAYS * DAY_MS
  const valid = requiresPassing
    ? records.find(h => h.isPassed && h.dateTaken.getTime() >= cutoff)
    : records.find(h => h.dateTaken.getTime() >= cutoff)
  if (valid) {
    return {
      status: valid.isPassed ? 'PASSED' : 'ATTEMPTED',
      message: `HFZ ${valid.isPassed ? 'Passed' : 'Attempted'} on ${fmtDate(valid.dateTaken)}`,
      date: valid.dateTaken,
      validUntil: addDays(valid.dateTaken, HFZ_CREDIT_WINDOW_DAYS),
    }
  }

  const lastPassing = records.find(h => h.isPassed)
  const last = lastPassing ?? records[0]
  if (!last) {
    return { status: 'NOT_ATTEMPTED', message: 'No HFZ record found', date: null, validUntil: null }
  }
  const ago = Math.floor((asOf.getTime() - last.dateTaken.getTime()) / DAY_MS)
  return {
    status: 'EXPIRED',
    message: `${lastPassing ? 'Last passing HFZ' : 'Last HFZ attempt'}: ${fmtDate(last.dateTaken)} (${ago} days ago)`,
    date: last.dateTaken,
    validUntil: null,
  }
}

// --- Activities ---

interface EncampmentCheck {
  completed: boolean
  dates: Date[]
  locations: (string | null)[]
}

/** ServicesCadetDataService.html:196-205. */
function checkEncampment(dataset: Dataset, capid: number): EncampmentCheck {
  const dates: Date[] = []
  const locations: (string | null)[] = []
  for (const a of dataset.cadetActivitiesByCapid.get(capid) ?? []) {
    if (a.type === 'ENCAMP' && a.completed) {
      dates.push(a.completed)
      locations.push(a.location)
    }
  }
  return { completed: dates.length > 0, dates, locations }
}

const CLS_ACTIVITY_TYPES: ReadonlySet<string> = new Set(['RCLS', 'COS', 'COS STAFF'])

/** ServicesCadetDataService.html:207-218: RCLS / COS / COS* activity credit. */
function checkCls(dataset: Dataset, capid: number): boolean {
  return (dataset.cadetActivitiesByCapid.get(capid) ?? []).some(a => {
    const type = a.type.toUpperCase()
    return (CLS_ACTIVITY_TYPES.has(type) || type.startsWith('COS')) && a.completed !== null
  })
}

// --- Phase / naming helpers (UtilsCadetHelpers.html) ---

/** UtilsCadetHelpers.html:2-11. 0 when no achievement or no phase match. */
export function phaseFromAchievement(achievementId: number): number {
  if (!achievementId) return 0
  for (const [phaseId, phase] of CADET_PHASES) {
    if (phase.achievements.includes(achievementId) || phase.milestoneAchv === achievementId) {
      return phaseId
    }
  }
  return 0
}

export function isMilestoneAchievement(achievementId: number): boolean {
  return CADET_MILESTONE_ACHIEVEMENTS.includes(achievementId)
}

/** UtilsCadetHelpers.html:18-29: base name plus pioneer name in parentheses. */
export function achievementDisplayName(achievementId: number): string {
  const base = CADET_ACHIEVEMENT_NAMES.get(achievementId) ?? `Achievement ${achievementId}`
  const pioneer = CADET_ACHIEVEMENT_PIONEERS.get(achievementId)
  return pioneer ? `${base} (${pioneer})` : base
}

/**
 * UtilsCadetHelpers.html:32-35. Milestones are absent from the public map and
 * fall through to their raw CadetAchvID; 0 maps to null.
 */
export function publicAchievementNumber(achievementId: number): number | null {
  return CADET_PUBLIC_ACHIEVEMENT_NUMBERS.get(achievementId) ?? (achievementId || null)
}

// --- Achievement requirement evaluation ---

export interface RequirementStatus {
  key: RequirementKey
  label: string
  completed: boolean
  value: string | null
}

export interface AchievementRequirementsResult {
  achievementId: number
  requirements: RequirementStatus[]
  completed: RequirementStatus[]
  pending: RequirementStatus[]
  completionPercent: number
}

const ACHIEVEMENT_SCOPED_LABELS: Partial<Record<RequirementKey, string>> = {
  activeParticipation: 'Active Participation',
  cadetOath: 'Cadet Oath',
  leadershipExpectations: 'Leadership Expectations',
  uniformWear: 'Uniform',
}

const PHASE_FEEDBACK_LABELS: Record<number, string> = {
  1: 'Phase I Leadership Feedback',
  2: 'Phase II Leadership Feedback',
  3: 'Phase III Leadership Feedback',
  4: 'Phase IV Leadership Feedback',
}

/** ServicesCadetDataService.html:233-263. */
function requirementLabel(key: RequirementKey, achievementId: number): string {
  if (key === 'physicalFitness') {
    return achievementId <= 3
      ? CADET_REQUIREMENT_LABELS.physicalFitness.early
      : CADET_REQUIREMENT_LABELS.physicalFitness.standard
  }
  const scoped = ACHIEVEMENT_SCOPED_LABELS[key]
  if (scoped) {
    const base = CADET_ACHIEVEMENT_NAMES.get(achievementId) ?? `Achievement ${achievementId}`
    return `${base} - ${scoped}`
  }
  if (key === 'leadershipFeedback') {
    return (
      PHASE_FEEDBACK_LABELS[phaseFromAchievement(achievementId)] ??
      CADET_REQUIREMENT_LABELS.leadershipFeedback
    )
  }
  const label = CADET_REQUIREMENT_LABELS[key]
  return typeof label === 'string' ? label : key
}

interface ModuleCompletion {
  completed: boolean
  doneCount: number
  total: number
}

function moduleCompletion(
  moduleTasks: readonly number[] | undefined,
  isTaskCompleted: (taskId: number | undefined) => boolean,
): ModuleCompletion {
  if (!moduleTasks || moduleTasks.length === 0) return { completed: false, doneCount: 0, total: 0 }
  let done = 0
  for (const t of moduleTasks) if (isTaskCompleted(t)) done++
  return { completed: done === moduleTasks.length, doneCount: done, total: moduleTasks.length }
}

function passFail(req: RequirementStatus, done: boolean): void {
  req.completed = done
  req.value = done ? 'Passed' : 'Not passed'
}

/**
 * Per-achievement requirement evaluation, ported from
 * ServicesCadetDataService.html:220-689. Joins CADET_ACHIEVEMENT_REQUIREMENTS
 * to the PL task maps and to CadetAchv column evidence.
 */
export function getAchievementRequirements(
  dataset: Dataset,
  capid: number,
  achievementId: number,
  timeInGrade: TimeInGrade | null,
  asOf: Date,
): AchievementRequirementsResult {
  const achvData = (dataset.cadetAchvByCapid.get(capid) ?? []).find(
    a => a.cadetAchvId === achievementId,
  )
  const isTaskCompleted = makeTaskCheck(dataset, capid)

  const keys = CADET_ACHIEVEMENT_REQUIREMENTS.get(achievementId) ?? CADET_DEFAULT_REQUIREMENTS
  const reqs = new Map<RequirementKey, RequirementStatus>()
  for (const key of keys) {
    reqs.set(key, { key, label: requirementLabel(key, achievementId), completed: false, value: null })
  }
  const req = (key: RequirementKey): RequirementStatus | undefined => reqs.get(key)

  const taskActiveParticipation =
    reqs.has('activeParticipation') &&
    isTaskCompleted(CADET_ACTIVE_PARTICIPATION_TASKS.get(achievementId))
  const taskCadetOath =
    reqs.has('cadetOath') && isTaskCompleted(CADET_OATH_TASKS.get(achievementId))
  const taskDrillTest =
    reqs.has('drillTest') && isTaskCompleted(CADET_DRILL_TASKS.get(achievementId))
  const taskCharacterForum =
    reqs.has('characterDevelopment') &&
    isTaskCompleted(CADET_CHARACTER_FORUM_TASKS.get(achievementId))

  const tigReq = req('timeInGrade')
  if (timeInGrade && tigReq) {
    // TIG waived for achievement 1 (new cadets have none until C/Amn) and for
    // achievement 21 (C/Lt Col to C/Col is immediately eligible):
    // ServicesCadetDataService.html:288-296
    if (achievementId === 1 || achievementId === 21) {
      tigReq.completed = true
      tigReq.value = 'No time in grade requirement'
    } else {
      tigReq.completed = timeInGrade.isEligible
      tigReq.value = timeInGrade.isEligible
        ? `${timeInGrade.days} days (${timeInGrade.weeks} weeks)`
        : `${timeInGrade.days} days (need ${CADET_TIME_IN_GRADE_DAYS - timeInGrade.days} more days)`
    }
  }

  const fitnessReq = req('physicalFitness')
  if (fitnessReq) {
    // HFZ is always evaluated from CadetHFZInformation, independent of any
    // CadetAchv record (ServicesCadetDataService.html:305-311)
    const hfzStatus = checkHfzStatus(dataset, capid, achievementId, asOf)
    fitnessReq.completed = hfzStatus.status === 'PASSED' || hfzStatus.status === 'ATTEMPTED'
    fitnessReq.value = hfzStatus.message
  }

  const leadExpectReq = req('leadershipExpectations')
  if (leadExpectReq) {
    const done = isTaskCompleted(CADET_LEADERSHIP_EXPECTATIONS_TASKS.get(achievementId))
    leadExpectReq.completed = done
    leadExpectReq.value = done ? 'Completed' : 'Not completed'
  }

  const uniformReq = req('uniformWear')
  if (uniformReq) {
    const done = isTaskCompleted(CADET_UNIFORM_TASKS.get(achievementId))
    uniformReq.completed = done
    uniformReq.value = done ? 'Completed' : 'Not completed'
  }

  const feedbackReq = req('leadershipFeedback')
  if (feedbackReq) {
    const done = isTaskCompleted(
      CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS.get(phaseFromAchievement(achievementId)),
    )
    feedbackReq.completed = done
    feedbackReq.value = done ? 'Completed' : 'Not completed'
  }

  const leadershipReq = req('leadershipTest')
  if (leadershipReq) {
    // New system first (Cadet Interactive modules / Learn to Lead chapters in
    // PL_MemberTaskCredit), then the old CadetAchv written test
    // (ServicesCadetDataService.html:339-376, :495-520). CadetAchvID 15+ uses
    // Learn to Lead chapter tasks (:345).
    const mod = moduleCompletion(ACHIEVEMENT_LEADERSHIP_MODULE_TASKS.get(achievementId), isTaskCompleted)
    const viaChapter = achievementId >= 15
    let completed = false
    let value = 'Not started'
    if (mod.completed) {
      completed = true
      value = viaChapter
        ? 'Completed via Learn to Lead Chapter'
        : mod.total === 1
          ? 'Completed via Cadet Interactive Module'
          : `Completed via ${mod.total} Cadet Interactive Modules`
    } else if (mod.doneCount > 0) {
      value = `${mod.doneCount}/${mod.total} modules completed`
    }
    if (!completed && achvData?.leadLabDateP) {
      const score = scoreOrZero(achvData.leadLabScore)
      completed = score >= CADET_MIN_TEST_SCORE
      value = `${score}% on ${fmtDate(achvData.leadLabDateP)} (Learn to Lead)`
    }
    leadershipReq.completed = completed
    leadershipReq.value = value
  }

  const aerospaceReq = req('aerospaceTest')
  if (aerospaceReq) {
    // CadetAchvID 11+ satisfies this with Journey of Flight tests instead of
    // Aerospace Dimensions modules (ServicesCadetDataService.html:386)
    const mod = moduleCompletion(ACHIEVEMENT_AEROSPACE_MODULE_TASKS.get(achievementId), isTaskCompleted)
    const isJof = achievementId >= 11
    let completed = false
    let value = 'Not started'
    if (mod.completed) {
      completed = true
      value = isJof ? 'Completed via Journey of Flight Test' : 'Completed via Cadet Interactive Module'
    } else if (mod.doneCount > 0) {
      // v1 says "tests completed" only in the no-record branch (:534-536)
      value =
        isJof && !achvData
          ? `${mod.doneCount}/${mod.total} tests completed`
          : `${mod.doneCount}/${mod.total} modules completed`
    }
    if (!completed && achvData?.aeDateP) {
      const score = scoreOrZero(achvData.aeScore)
      completed = score >= CADET_MIN_TEST_SCORE
      value = `${score}% on ${fmtDate(achvData.aeDateP)} (Written Test)`
    }
    aerospaceReq.completed = completed
    aerospaceReq.value = value
  }

  const drillReq = req('drillTest')
  if (drillReq) {
    // ServicesCadetDataService.html:413-422: with a DrillDate, any score above
    // zero or the PL task counts; otherwise the PL task alone
    if (achvData?.drillDate) {
      const score = scoreOrZero(achvData.drillScore)
      drillReq.completed = score > 0 || taskDrillTest
      drillReq.value = `Score: ${score} on ${fmtDate(achvData.drillDate)}`
    } else {
      drillReq.completed = taskDrillTest
      drillReq.value = taskDrillTest ? 'Completed' : 'Not started'
    }
  }

  // Staff Duty Analysis, three parts, post-Mitchell: CadetAchv date fields
  // first, then PL_MemberTaskCredit (ServicesCadetDataService.html:424-463,
  // :551-568)
  const sdaServiceReq = req('sdaService')
  if (sdaServiceReq) {
    if (achvData?.staffServiceDate) {
      sdaServiceReq.completed = true
      sdaServiceReq.value = `Completed on ${fmtDate(achvData.staffServiceDate)}`
    } else {
      const done = isTaskCompleted(CADET_SDA_SERVICE_TASKS.get(achievementId))
      if (achvData) {
        if (done) {
          sdaServiceReq.completed = true
          sdaServiceReq.value = 'Completed'
        }
      } else {
        sdaServiceReq.completed = done
        sdaServiceReq.value = done ? 'Completed' : 'Not started'
      }
    }
  }

  const sdaPresentationReq = req('sdaPresentation')
  if (sdaPresentationReq) {
    if (achvData?.oralPresentationDate) {
      sdaPresentationReq.completed = true
      sdaPresentationReq.value = `Completed on ${fmtDate(achvData.oralPresentationDate)}`
    } else {
      const done = isTaskCompleted(CADET_SDA_PRESENTATION_TASKS.get(achievementId))
      if (achvData) {
        if (done) {
          sdaPresentationReq.completed = true
          sdaPresentationReq.value = 'Completed'
        }
      } else {
        sdaPresentationReq.completed = done
        sdaPresentationReq.value = done ? 'Completed' : 'Not started'
      }
    }
  }

  const sdaWritingReq = req('sdaWriting')
  if (sdaWritingReq) {
    if (achvData?.technicalWritingAssignmentDate) {
      sdaWritingReq.completed = true
      sdaWritingReq.value = `Completed on ${fmtDate(achvData.technicalWritingAssignmentDate)}`
    } else {
      // Any one of the eight writing assignment tasks satisfies it
      const done = CADET_SDA_WRITING_TASKS.some(t => isTaskCompleted(t))
      if (achvData) {
        if (done) {
          sdaWritingReq.completed = true
          sdaWritingReq.value = 'Completed'
        }
      } else {
        sdaWritingReq.completed = done
        sdaWritingReq.value = done ? 'Completed' : 'Not started'
      }
    }
  }

  const activeReq = req('activeParticipation')
  if (activeReq) {
    const achvActive = achvData
      ? achvData.activePart === 'True' || achvData.activePart === '1'
      : false
    activeReq.completed = achvActive || taskActiveParticipation
    activeReq.value = activeReq.completed ? 'Yes' : 'No'
  }

  const oathReq = req('cadetOath')
  if (oathReq) {
    const achvOath = achvData ? achvData.cadetOath === 'True' || achvData.cadetOath === '1' : false
    oathReq.completed = achvOath || taskCadetOath
    oathReq.value = oathReq.completed ? 'Recited' : 'Not Recited'
  }

  const charReq = req('characterDevelopment')
  if (charReq) {
    if (achvData?.moralLDateP) {
      charReq.completed = true
      charReq.value = `Completed on ${fmtDate(achvData.moralLDateP)}`
    } else {
      charReq.completed = taskCharacterForum
      charReq.value = taskCharacterForum ? 'Completed' : 'Not completed'
    }
  }

  // Milestone-specific requirements from PL_MemberTaskCredit
  // (ServicesCadetDataService.html:584-683)
  const wingmanReq = req('cadetWingmanCourse')
  if (wingmanReq) {
    const done = isTaskCompleted(MILESTONE_EXAM_TASKS.cadetWingmanCourse)
    wingmanReq.completed = done
    wingmanReq.value = done ? 'Completed' : 'Not completed'
  }

  const wrightReq = req('wrightBrothersLeadershipExam')
  if (wrightReq) passFail(wrightReq, isTaskCompleted(MILESTONE_EXAM_TASKS.wrightBrothersLeadershipExam))

  const speech8Req = req('achievement8Speech')
  if (speech8Req) passFail(speech8Req, isTaskCompleted(MILESTONE_EXAM_TASKS.achievement8Speech))
  const essay8Req = req('achievement8Essay')
  if (essay8Req) passFail(essay8Req, isTaskCompleted(MILESTONE_EXAM_TASKS.achievement8Essay))

  const mitchellLeadReq = req('mitchellLeadershipExam')
  if (mitchellLeadReq) passFail(mitchellLeadReq, isTaskCompleted(MILESTONE_EXAM_TASKS.mitchellLeadershipExam))
  const mitchellAeroReq = req('mitchellAerospaceExam')
  if (mitchellAeroReq) passFail(mitchellAeroReq, isTaskCompleted(MILESTONE_EXAM_TASKS.mitchellAerospaceExam))

  const encampmentReq = req('encampment')
  if (encampmentReq) {
    // Encampment credit is the PL task OR a completed ENCAMP activity
    // (ServicesCadetDataService.html:611-636)
    const enc = checkEncampment(dataset, capid)
    const done = isTaskCompleted(MILESTONE_EXAM_TASKS.encampment) || enc.completed
    let value = 'Not completed'
    if (done && enc.completed) {
      const date = enc.dates[0]
      const location = enc.locations[0]
      value = date
        ? location
          ? `Completed on ${fmtDate(date)} at ${location}`
          : `Completed on ${fmtDate(date)}`
        : 'Completed'
    } else if (done) {
      value = 'Completed'
    }
    encampmentReq.completed = done
    encampmentReq.value = value
  }

  const earhartReq = req('earhartLeadershipExam')
  if (earhartReq) passFail(earhartReq, isTaskCompleted(MILESTONE_EXAM_TASKS.earhartLeadershipExam))

  const eakerSpeechReq = req('eakerSpeech')
  if (eakerSpeechReq) passFail(eakerSpeechReq, isTaskCompleted(MILESTONE_EXAM_TASKS.eakerSpeech))
  const eakerEssayReq = req('eakerEssay')
  if (eakerEssayReq) passFail(eakerEssayReq, isTaskCompleted(MILESTONE_EXAM_TASKS.eakerEssay))

  const clsReq = req('cls')
  if (clsReq) {
    // CLS credit is the PL task OR a completed RCLS / COS activity
    // (ServicesCadetDataService.html:646-659)
    const done = isTaskCompleted(MILESTONE_EXAM_TASKS.cls) || checkCls(dataset, capid)
    clsReq.completed = done
    clsReq.value = done ? 'Completed' : 'Not completed'
  }

  const spaatzLeadReq = req('spaatzLeadershipExam')
  if (spaatzLeadReq) passFail(spaatzLeadReq, isTaskCompleted(MILESTONE_EXAM_TASKS.spaatzLeadershipExam))
  const spaatzJofReq = req('spaatzJOFExam')
  if (spaatzJofReq) passFail(spaatzJofReq, isTaskCompleted(MILESTONE_EXAM_TASKS.spaatzJOFExam))
  const spaatzEssayReq = req('spaatzEssay')
  if (spaatzEssayReq) passFail(spaatzEssayReq, isTaskCompleted(MILESTONE_EXAM_TASKS.spaatzEssay))
  const spaatzCfaReq = req('spaatzCFA')
  if (spaatzCfaReq) passFail(spaatzCfaReq, isTaskCompleted(MILESTONE_EXAM_TASKS.spaatzCFA))

  const all = [...reqs.values()]
  const completedList = all.filter(r => r.completed)
  const pendingList = all.filter(r => !r.completed)
  return {
    achievementId,
    requirements: all,
    completed: completedList,
    pending: pendingList,
    completionPercent: Math.round((completedList.length / all.length) * 100),
  }
}

// --- Honor credit ---

export interface HonorCreditLegacyDetails {
  leadershipModule: boolean
  aerospaceModule: boolean
  leadershipTest: boolean
  aerospaceTest: boolean
}

export interface HonorCreditResult {
  earned: boolean
  /** EarnedDate captured from the ExtraCreditEarned blob, verbatim. */
  earnedDate: string | null
  reason: string | null
  legacyDetails: HonorCreditLegacyDetails | null
}

/** ServicesCadetDataService.html:703-708: regex over the JSON-ish blob. */
function parseExtraCredit(raw: string | null): { earned: boolean; earnedDate: string | null } {
  const text = raw ?? ''
  return {
    earned: /CreditEarned\s*:\s*true/i.test(text),
    earnedDate: /EarnedDate\s*:\s*([0-9-]+)/i.exec(text)?.[1] ?? null,
  }
}

/** v1 honor-credit test-score check has no || 0 (ServicesCadetDataService.html:748-753). */
function scoreOrNaN(score: string | null): number {
  return score === null ? NaN : parseInt(score, 10)
}

/**
 * Honor credit for one achievement (ServicesCadetDataService.html:691-768).
 * Primary source is PL_MemberPathCredit.ExtraCreditEarned on the achievement's
 * path with StatusID 8; the legacy four-condition fallback (both interactive
 * modules plus both written tests at >= 80) applies ONLY when no path credit
 * rows exist for that path.
 */
export function checkHonorCredit(
  dataset: Dataset,
  capid: number,
  achievementId: number,
): HonorCreditResult {
  if (isMilestoneAchievement(achievementId)) {
    return { earned: false, earnedDate: null, reason: 'N/A - Milestone Award', legacyDetails: null }
  }
  const pathId = CADET_ACHIEVEMENT_PATH_IDS.get(achievementId)
  if (pathId === undefined) {
    return { earned: false, earnedDate: null, reason: 'N/A - No Path Mapping', legacyDetails: null }
  }

  const pathCredits = (dataset.pathCreditsByCapid.get(capid) ?? []).filter(
    mp => mp.pathId === pathId && mp.statusId === 8,
  )
  const earnedCredits = pathCredits.map(mp => parseExtraCredit(mp.extraCreditEarned)).filter(ec => ec.earned)
  if (earnedCredits.length > 0) {
    const dated = earnedCredits.find(ec => ec.earnedDate !== null) ?? earnedCredits[0]
    return { earned: true, earnedDate: dated?.earnedDate ?? null, reason: null, legacyDetails: null }
  }
  if (pathCredits.length > 0) {
    return { earned: false, earnedDate: null, reason: 'Extra credit not earned', legacyDetails: null }
  }

  const achvData = (dataset.cadetAchvByCapid.get(capid) ?? []).find(
    a => a.cadetAchvId === achievementId,
  )
  const isTaskCompleted = makeTaskCheck(dataset, capid)
  const leadTasks = ACHIEVEMENT_LEADERSHIP_MODULE_TASKS.get(achievementId)
  const aeroTasks = ACHIEVEMENT_AEROSPACE_MODULE_TASKS.get(achievementId)
  const legacyDetails: HonorCreditLegacyDetails = {
    leadershipModule: !!leadTasks && leadTasks.every(t => isTaskCompleted(t)),
    aerospaceModule: !!aeroTasks && aeroTasks.every(t => isTaskCompleted(t)),
    leadershipTest:
      !!achvData?.leadLabDateP && scoreOrNaN(achvData.leadLabScore) >= CADET_MIN_TEST_SCORE,
    aerospaceTest: !!achvData?.aeDateP && scoreOrNaN(achvData.aeScore) >= CADET_MIN_TEST_SCORE,
  }
  const earned =
    legacyDetails.leadershipModule &&
    legacyDetails.aerospaceModule &&
    legacyDetails.leadershipTest &&
    legacyDetails.aerospaceTest
  return { earned, earnedDate: null, reason: null, legacyDetails }
}

// --- Promotion readiness ---

export type PromotionState =
  | 'SPAATZ_COMPLETE'
  | 'READY'
  | 'TIME_PENDING'
  | 'NEARLY_READY'
  | 'IN_PROGRESS'
  | 'NOT_STARTED'

export interface PromotionReadiness {
  state: PromotionState
  message: string
}

/**
 * Excluded from the readiness gate (ServicesCadetDataService.html:777-783):
 * activeParticipation and cadetOath are staff checkboxes, timeInGrade passes
 * on its own with time.
 */
const NON_CONTROLLABLE_KEYS: ReadonlySet<RequirementKey> = new Set([
  'activeParticipation',
  'cadetOath',
  'timeInGrade',
])

/** Six-state machine ported from ServicesCadetDataService.html:770-810. */
export function calculatePromotionReadiness(
  dataset: Dataset,
  capid: number,
  currentAchievement: number,
  timeInGrade: TimeInGrade,
  asOf: Date,
): PromotionReadiness {
  const next = currentAchievement + 1
  if (next > CADET_MAX_ACHIEVEMENT_ID) {
    return { state: 'SPAATZ_COMPLETE', message: 'Spaatz Award achieved!' }
  }

  const reqData = getAchievementRequirements(dataset, capid, next, timeInGrade, asOf)
  // READY gates on raw TIG eligibility even where the requirement itself is
  // waived (achievements 1 and 21), exactly as v1 does
  // (ServicesCadetDataService.html:775, :786)
  const tigReady = timeInGrade.isEligible
  const controllable = reqData.requirements.filter(r => !NON_CONTROLLABLE_KEYS.has(r.key))
  const controllableDone = controllable.filter(r => r.completed).length
  const reqsReady = controllableDone === controllable.length

  if (tigReady && reqsReady) return { state: 'READY', message: 'Ready for promotion!' }
  if (reqsReady && !tigReady) {
    return {
      state: 'TIME_PENDING',
      message: `${CADET_TIME_IN_GRADE_DAYS - timeInGrade.days} days until eligible`,
    }
  }

  const byKey = new Map(reqData.requirements.map(r => [r.key, r] as const))
  const done = (key: RequirementKey): boolean => byKey.get(key)?.completed === true
  // NEARLY_READY: 2 of the 3 hard requirement groups
  // (ServicesCadetDataService.html:791-805)
  const hardDone = [
    done('leadershipTest') ||
      done('wrightBrothersLeadershipExam') ||
      done('mitchellLeadershipExam') ||
      done('earhartLeadershipExam') ||
      done('spaatzLeadershipExam'),
    done('physicalFitness') || done('spaatzCFA'),
    done('aerospaceTest') || done('mitchellAerospaceExam') || done('spaatzJOFExam'),
  ].filter(Boolean).length
  if (hardDone >= 2) return { state: 'NEARLY_READY', message: 'Nearly ready!' }
  if (controllableDone > 0) return { state: 'IN_PROGRESS', message: 'In progress' }
  return { state: 'NOT_STARTED', message: 'Not started' }
}

// --- Per-cadet processing ---

export interface CadetDutySummary {
  duty: string
  date: Date | null
  orgName: string
}

export interface MilestoneAward {
  award: string
  awardNo: string | null
  completed: Date
}

export interface HonorCreditEarned {
  achievementId: number
  earnedDate: string | null
}

export interface ProcessedCadet {
  capid: number
  nameFirst: string
  nameLast: string
  orgid: number
  unitName: string
  rank: string | null
  rankDate: Date | null
  cadetDuties: CadetDutySummary[]
  approvedAchievements: number[]
  /** Highest approved CadetAchvID; 0 when none approved. */
  currentAchievement: number
  currentAchievementName: string | null
  publicAchievementNumber: number | null
  nextAchievement: number | null
  nextAchievementName: string | null
  phase: number
  timeInGrade: TimeInGrade
  /** Stored date the read layer re-derives TIG state from at any asOf. */
  tigCompleteOn: Date | null
  /** Approval-date based; feeds the 90+/120-day promotion tiles and reports. */
  lastPromotionDate: Date | null
  /** HFZ status against the next achievement's rule; null past Spaatz. */
  hfz: HfzStatus | null
  /** Stored date the read layer re-derives HFZ currency from at any asOf. */
  hfzValidUntil: Date | null
  promotion: PromotionReadiness
  nextRequirements: AchievementRequirementsResult | null
  milestoneAwards: MilestoneAward[]
  honorCreditAchievements: HonorCreditEarned[]
  nextHonorCreditStatus: HonorCreditResult | null
}

/** GLR-MI-205 formatting, unit zero-stripped then left-padded to 3 (ServicesCadetDataService.html:894-903). */
function orgUnitName(dataset: Dataset, orgid: number): string {
  const org = dataset.orgByOrgid.get(orgid)
  if (!org) return 'Unknown'
  const unit = org.unit ? org.unit.replace(/^0+/, '').padStart(3, '0') : '000'
  return `${org.region}-${org.wing}-${unit}`
}

export function processCadet(dataset: Dataset, member: MemberRow, asOf: Date): ProcessedCadet {
  const capid = member.capid
  const currentRank = getCurrentCadetRank(dataset, capid)
  const approved = getApprovedAchievements(dataset, capid)
  const currentAchievement = approved.length > 0 ? Math.max(...approved) : 0
  const next = currentAchievement + 1
  const nextAchievement = next <= CADET_MAX_ACHIEVEMENT_ID ? next : null

  // TIG runs from the current achievement's APPROVAL date, not the rank date:
  // consecutive achievements can share a grade (CadetAchvID 8 and 9 are both
  // C/CMSgt, so Billy Mitchell TIG must run from Achievement 9's approval).
  // Rank date is only the fallback when no approval date resolves.
  // ServicesCadetDataService.html:868-879.
  let effectiveDate = currentRank?.rankDate ?? null
  if (currentAchievement > 0) {
    const aprDate = resolveApprovalDate(dataset, capid, currentAchievement)
    if (aprDate) effectiveDate = aprDate
  }
  const timeInGrade = getTimeInGrade(effectiveDate, asOf)

  const promotion = calculatePromotionReadiness(dataset, capid, currentAchievement, timeInGrade, asOf)
  const nextRequirements =
    nextAchievement !== null
      ? getAchievementRequirements(dataset, capid, nextAchievement, timeInGrade, asOf)
      : null
  const hfz = nextAchievement !== null ? checkHfzStatus(dataset, capid, nextAchievement, asOf) : null

  const milestoneAwards: MilestoneAward[] = []
  for (const a of dataset.cadetAwardsByCapid.get(capid) ?? []) {
    if (a.completed) milestoneAwards.push({ award: a.award, awardNo: a.awardNo, completed: a.completed })
  }

  const honorCreditAchievements: HonorCreditEarned[] = []
  for (const achievementId of approved) {
    const credit = checkHonorCredit(dataset, capid, achievementId)
    if (credit.earned) honorCreditAchievements.push({ achievementId, earnedDate: credit.earnedDate })
  }
  const nextHonorCreditStatus =
    nextAchievement !== null ? checkHonorCredit(dataset, capid, nextAchievement) : null

  const cadetDuties: CadetDutySummary[] = (dataset.cadetDutiesByCapid.get(capid) ?? [])
    .filter(d => d.duty !== '' && !d.duty.toUpperCase().includes('#REF'))
    .map(d => ({ duty: d.duty, date: d.dateMod, orgName: orgUnitName(dataset, d.orgid) }))

  return {
    capid,
    nameFirst: member.nameFirst,
    nameLast: member.nameLast,
    orgid: member.orgid,
    unitName: orgUnitName(dataset, member.orgid),
    rank: currentRank?.rank ?? null,
    rankDate: currentRank?.rankDate ?? null,
    cadetDuties,
    approvedAchievements: approved,
    currentAchievement,
    currentAchievementName: currentAchievement > 0 ? achievementDisplayName(currentAchievement) : null,
    publicAchievementNumber: publicAchievementNumber(currentAchievement),
    nextAchievement,
    nextAchievementName: nextAchievement !== null ? achievementDisplayName(nextAchievement) : null,
    phase: phaseFromAchievement(currentAchievement),
    timeInGrade,
    tigCompleteOn: timeInGrade.eligibleOn,
    lastPromotionDate: effectiveDate,
    hfz,
    hfzValidUntil: hfz?.validUntil ?? null,
    promotion,
    nextRequirements,
    milestoneAwards,
    honorCreditAchievements,
    nextHonorCreditStatus,
  }
}

/**
 * All ACTIVE cadets in the given orgids (ServicesCadetDataService.html:850-939
 * scopes to Type CADET, MbrStatus ACTIVE).
 */
export function processCadets(
  dataset: Dataset,
  orgids: readonly number[],
  asOf: Date,
): ProcessedCadet[] {
  const out: ProcessedCadet[] = []
  const seen = new Set<number>()
  for (const orgid of orgids) {
    if (seen.has(orgid)) continue
    seen.add(orgid)
    for (const m of dataset.membersByOrgid.get(orgid) ?? []) {
      if (m.type.toUpperCase() !== 'CADET') continue
      if (m.mbrStatus.toUpperCase() !== 'ACTIVE') continue
      out.push(processCadet(dataset, m, asOf))
    }
  }
  return out
}
