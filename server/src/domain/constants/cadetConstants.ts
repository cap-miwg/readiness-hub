/**
 * Typed views over the mechanically extracted v1-constants.json for the Cadet
 * Programs domain (v1 source: ConfigConstants.html:435-911). All CadetAchvIDs,
 * TaskIDs, PathIDs, and phase ids are INTEGER here; v1 kept them as strings.
 *
 * CADET_RANK_INSIGNIA (ConfigConstants.html:511-533) is intentionally not
 * ported: v1 hardcoded 21 Google Drive thumbnail file IDs for rank images;
 * v2 renders the rank text from CADET_ACHIEVEMENT_TO_RANK instead.
 */

import v1 from './v1-constants.json' with { type: 'json' }

/**
 * Every requirement key the cadet promotion model uses, in the order of
 * CADET_REQUIREMENT_LABELS (ConfigConstants.html:539-572).
 */
export const REQUIREMENT_KEYS = [
  'timeInGrade',
  'physicalFitness',
  'activeParticipation',
  'cadetOath',
  'characterDevelopment',
  'leadershipTest',
  'aerospaceTest',
  'drillTest',
  'sdaService',
  'sdaPresentation',
  'sdaWriting',
  'leadershipExpectations',
  'uniformWear',
  'leadershipFeedback',
  'cadetWingmanCourse',
  'wrightBrothersLeadershipExam',
  'mitchellLeadershipExam',
  'mitchellAerospaceExam',
  'encampment',
  'earhartLeadershipExam',
  'achievement8Speech',
  'achievement8Essay',
  'eakerSpeech',
  'eakerEssay',
  'cls',
  'spaatzLeadershipExam',
  'spaatzJOFExam',
  'spaatzEssay',
  'spaatzCFA',
] as const

export type RequirementKey = (typeof REQUIREMENT_KEYS)[number]

const REQUIREMENT_KEY_SET: ReadonlySet<string> = new Set(REQUIREMENT_KEYS)

function asRequirementKey(value: string, name: string): RequirementKey {
  if (!REQUIREMENT_KEY_SET.has(value)) {
    throw new Error(`${name}: unknown cadet requirement key '${value}' in v1-constants.json`)
  }
  return value as RequirementKey
}

function toInt(value: string | number, name: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n)) {
    throw new Error(`${name}: non-integer id '${String(value)}' in v1-constants.json`)
  }
  return n
}

function intKeyMap<V, R>(
  record: Record<string, V>,
  name: string,
  mapValue: (v: V) => R,
): ReadonlyMap<number, R> {
  const m = new Map<number, R>()
  for (const [k, v] of Object.entries(record)) m.set(toInt(k, name), mapValue(v))
  return m
}

/** Consistency guard: the typed key union must match the extracted labels. */
{
  const labelKeys = Object.keys(v1.CADET_REQUIREMENT_LABELS)
  if (labelKeys.length !== REQUIREMENT_KEYS.length) {
    throw new Error('CADET_REQUIREMENT_LABELS key count drifted from REQUIREMENT_KEYS')
  }
  for (const k of labelKeys) asRequirementKey(k, 'CADET_REQUIREMENT_LABELS')
}

/**
 * Spaatz (CadetAchvID 21) is the last cadet achievement. v1 hardcodes the
 * bound inline (ServicesCadetDataService.html:772, :881).
 */
export const CADET_MAX_ACHIEVEMENT_ID = 21

/** HFZ fitness credit window in days (ServicesCadetDataService.html:124). */
export const HFZ_CREDIT_WINDOW_DAYS = 180

/** 56 days (8 weeks), ConfigConstants.html:535. */
export const CADET_TIME_IN_GRADE_DAYS: number = v1.CADET_TIME_IN_GRADE_DAYS

/** 80 percent minimum passing score, ConfigConstants.html:536. */
export const CADET_MIN_TEST_SCORE: number = v1.CADET_MIN_TEST_SCORE

/** Requirement keys checked per CadetAchvID (ConfigConstants.html:580-675). */
export const CADET_ACHIEVEMENT_REQUIREMENTS: ReadonlyMap<number, readonly RequirementKey[]> =
  intKeyMap(v1.CADET_ACHIEVEMENT_REQUIREMENTS, 'CADET_ACHIEVEMENT_REQUIREMENTS', keys =>
    keys.map(k => asRequirementKey(k, 'CADET_ACHIEVEMENT_REQUIREMENTS')),
  )

/** Fallback requirement set for unmapped ids (ConfigConstants.html:575-577). */
export const CADET_DEFAULT_REQUIREMENTS: readonly RequirementKey[] =
  v1.CADET_DEFAULT_REQUIREMENTS.map(k => asRequirementKey(k, 'CADET_DEFAULT_REQUIREMENTS'))

/** UI label per requirement key; physicalFitness splits early (achv 1-3) vs standard. */
export const CADET_REQUIREMENT_LABELS = v1.CADET_REQUIREMENT_LABELS

// --- Per-achievement PL_MemberTaskCredit task maps (CadetAchvID -> TaskID) ---

/** ConfigConstants.html:678-700. */
export const CADET_LEADERSHIP_EXPECTATIONS_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_LEADERSHIP_EXPECTATIONS_TASKS, 'CADET_LEADERSHIP_EXPECTATIONS_TASKS', v =>
    toInt(v, 'CADET_LEADERSHIP_EXPECTATIONS_TASKS'),
  )

/** ConfigConstants.html:703-724. No uniform task for achievement 1. */
export const CADET_UNIFORM_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_UNIFORM_TASKS, 'CADET_UNIFORM_TASKS', v => toInt(v, 'CADET_UNIFORM_TASKS'))

/** ConfigConstants.html:727-737. Drill performance tests exist only pre-Mitchell. */
export const CADET_DRILL_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_DRILL_TASKS, 'CADET_DRILL_TASKS', v => toInt(v, 'CADET_DRILL_TASKS'))

/** ConfigConstants.html:740-756. */
export const CADET_CHARACTER_FORUM_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_CHARACTER_FORUM_TASKS, 'CADET_CHARACTER_FORUM_TASKS', v =>
    toInt(v, 'CADET_CHARACTER_FORUM_TASKS'),
  )

/** ConfigConstants.html:760-782. PL "Achievement X" numbering skips milestones. */
export const CADET_OATH_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_OATH_TASKS, 'CADET_OATH_TASKS', v => toInt(v, 'CADET_OATH_TASKS'))

/** ConfigConstants.html:786-808. */
export const CADET_ACTIVE_PARTICIPATION_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_ACTIVE_PARTICIPATION_TASKS, 'CADET_ACTIVE_PARTICIPATION_TASKS', v =>
    toInt(v, 'CADET_ACTIVE_PARTICIPATION_TASKS'),
  )

/** ConfigConstants.html:811-820. Staff Duty Analysis service (post-Mitchell). */
export const CADET_SDA_SERVICE_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_SDA_SERVICE_TASKS, 'CADET_SDA_SERVICE_TASKS', v =>
    toInt(v, 'CADET_SDA_SERVICE_TASKS'),
  )

/** ConfigConstants.html:823-832. */
export const CADET_SDA_PRESENTATION_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_SDA_PRESENTATION_TASKS, 'CADET_SDA_PRESENTATION_TASKS', v =>
    toInt(v, 'CADET_SDA_PRESENTATION_TASKS'),
  )

/** ConfigConstants.html:835. Any one writing assignment satisfies the requirement. */
export const CADET_SDA_WRITING_TASKS: readonly number[] =
  v1.CADET_SDA_WRITING_TASKS.map(v => toInt(v, 'CADET_SDA_WRITING_TASKS'))

/** Phase (1-4) -> leadership feedback TaskID, once per phase (ConfigConstants.html:838-843). */
export const CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS, 'CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS', v =>
    toInt(v, 'CADET_PHASE_LEADERSHIP_FEEDBACK_TASKS'),
  )

/** CadetAchvID -> PL_Paths PathID for honor credit (ConfigConstants.html:846-863). */
export const CADET_ACHIEVEMENT_PATH_IDS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_ACHIEVEMENT_PATH_IDS, 'CADET_ACHIEVEMENT_PATH_IDS', v =>
    toInt(v, 'CADET_ACHIEVEMENT_PATH_IDS'),
  )

/**
 * CadetAchvID -> Cadet Interactive leadership module TaskIDs; CadetAchvID 15+
 * lists Learn to Lead chapter tasks instead (ConfigConstants.html:867-886).
 */
export const ACHIEVEMENT_LEADERSHIP_MODULE_TASKS: ReadonlyMap<number, readonly number[]> =
  intKeyMap(v1.ACHIEVEMENT_LEADERSHIP_MODULE_TASKS, 'ACHIEVEMENT_LEADERSHIP_MODULE_TASKS', arr =>
    arr.map(v => toInt(v, 'ACHIEVEMENT_LEADERSHIP_MODULE_TASKS')),
  )

export interface AerospaceDimensionsModule {
  moduleNum: number
  taskId: number
  achievementId: number
  title: string
}

/** ConfigConstants.html:889-897. */
export const AEROSPACE_DIMENSIONS_MODULES: readonly AerospaceDimensionsModule[] =
  v1.AEROSPACE_DIMENSIONS_MODULES.map(m => ({
    moduleNum: m.moduleNum,
    taskId: toInt(m.taskId, 'AEROSPACE_DIMENSIONS_MODULES'),
    achievementId: toInt(m.achievementId, 'AEROSPACE_DIMENSIONS_MODULES'),
    title: m.title,
  }))

/**
 * CadetAchvID -> aerospace module TaskIDs, derived from the modules list plus
 * the Journey of Flight overrides for CadetAchvIDs 11, 17, 18, 19
 * (ConfigConstants.html:900-911). The extraction evaluated the overrides, so
 * the JSON already contains all 11 entries.
 */
export const ACHIEVEMENT_AEROSPACE_MODULE_TASKS: ReadonlyMap<number, readonly number[]> =
  intKeyMap(v1.ACHIEVEMENT_AEROSPACE_MODULE_TASKS, 'ACHIEVEMENT_AEROSPACE_MODULE_TASKS', arr =>
    arr.map(v => toInt(v, 'ACHIEVEMENT_AEROSPACE_MODULE_TASKS')),
  )

// --- Achievement identity, naming, phases ---

/** CadetAchvID -> grade earned (ConfigConstants.html:436-442). 8 and 9 are both C/CMSgt. */
export const CADET_ACHIEVEMENT_TO_RANK: ReadonlyMap<number, string> =
  intKeyMap(v1.CADET_ACHIEVEMENT_TO_RANK, 'CADET_ACHIEVEMENT_TO_RANK', v => v)

export interface CadetPhase {
  name: string
  achievements: readonly number[]
  milestoneAchv: number
  milestoneName: string
  requiresEncampment: boolean
  requiresCLS: boolean
}

/** ConfigConstants.html:444-450. */
export const CADET_PHASES: ReadonlyMap<number, CadetPhase> = intKeyMap(
  v1.CADET_PHASES as Record<
    string,
    {
      name: string
      achievements: number[]
      milestoneAchv: number
      milestoneName: string
      requiresEncampment?: boolean
      requiresCLS?: boolean
    }
  >,
  'CADET_PHASES',
  p => ({
    name: p.name,
    achievements: p.achievements,
    milestoneAchv: p.milestoneAchv,
    milestoneName: p.milestoneName,
    requiresEncampment: p.requiresEncampment ?? false,
    requiresCLS: p.requiresCLS ?? false,
  }),
)

/** Wright Brothers 4, Mitchell 10, Earhart 14, Eaker 20, Spaatz 21 (ConfigConstants.html:452). */
export const CADET_MILESTONE_ACHIEVEMENTS: readonly number[] = v1.CADET_MILESTONE_ACHIEVEMENTS

/** Pioneer last names for non-milestone achievements (ConfigConstants.html:455-466). */
export const CADET_ACHIEVEMENT_PIONEERS: ReadonlyMap<number, string> =
  intKeyMap(v1.CADET_ACHIEVEMENT_PIONEERS, 'CADET_ACHIEVEMENT_PIONEERS', v => v)

/** CadetAchvID -> eServices display name (ConfigConstants.html:469-491). */
export const CADET_ACHIEVEMENT_NAMES: ReadonlyMap<number, string> =
  intKeyMap(v1.CADET_ACHIEVEMENT_NAMES, 'CADET_ACHIEVEMENT_NAMES', v => v)

/**
 * CadetAchvID -> public "Achievement N" number. The five milestones occupy
 * ids but are not numbered, so CadetAchvID 5 is public Achievement 4 and
 * CadetAchvID 19 is public Achievement 16 (ConfigConstants.html:494-499).
 */
export const CADET_PUBLIC_ACHIEVEMENT_NUMBERS: ReadonlyMap<number, number> =
  intKeyMap(v1.CADET_PUBLIC_ACHIEVEMENT_NUMBERS, 'CADET_PUBLIC_ACHIEVEMENT_NUMBERS', v =>
    toInt(v, 'CADET_PUBLIC_ACHIEVEMENT_NUMBERS'),
  )

/**
 * Milestone comprehensive-exam TaskIDs. v1 hardcodes these as inline string
 * literals with no config map (ServicesCadetDataService.html:585-683), so
 * they are ported by hand here. The checking rule each carries in v1:
 * - cadetWingmanCourse: task 329 (:586, achievement 1)
 * - wrightBrothersLeadershipExam: task 347 (:591, CadetAchvID 4)
 * - achievement8Speech 374 / achievement8Essay 373 (:596-597, CadetAchvID 9)
 * - mitchellLeadershipExam 378 / mitchellAerospaceExam 379 (:609-610); the
 *   encampment credit is task 381 OR any CadetActivities row of Type ENCAMP
 *   with a real Completed date (:611-612)
 * - earhartLeadershipExam: task 414 (:639, CadetAchvID 14)
 * - eakerSpeech 441 / eakerEssay 442 (:644-645); cls is task 444 OR a
 *   CadetActivities row of Type RCLS / COS / COS* with a real Completed date
 *   (:646, checkCLS at :207-218)
 * - spaatzLeadershipExam 445 / spaatzJOFExam 446 / spaatzEssay 447 /
 *   spaatzCFA 448 (:662-665, CadetAchvID 21)
 */
export const MILESTONE_EXAM_TASKS = {
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
} as const satisfies Partial<Record<RequirementKey, number>>
