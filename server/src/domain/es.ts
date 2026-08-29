/**
 * Emergency Services qualification domain logic, ported from v1
 * ServicesESDataService.html: qualification building, Skills Evaluator
 * derivation, per-achievement task steps, the prerequisite tree, and
 * eligibility checks. Pure functions over the Dataset; time enters only
 * through asOf.
 */
import type { Dataset, MbrAchievementRow, MemberRow } from './dataset.js'
import {
  COMMUNICATIONS_DUTY_POSITIONS,
  ES_ACHIEVEMENT_IDS,
  ES_AGE_REQUIREMENTS,
  ES_DASHBOARD_SPECIAL,
  ES_EXCLUDED_ACHIEVEMENT_IDS,
  ES_EXCLUDED_FUNCTIONAL_AREAS,
  ES_NON_EXPIRING_EXCLUSIONS,
  ES_NO_SKILLS_EVALUATOR_IDS,
  ES_PREREQUISITE_SPECIAL_CASES,
  ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS,
} from './constants/index.js'

const MS_PER_DAY = 86_400_000

export type EsQualStatus = 'Active' | 'Training' | 'Expired' | 'Not Approved' | 'Missing'

export interface EsQualification {
  achvId: number
  name: string
  functionalArea: string | null
  status: EsQualStatus
  statusRaw: string | null
  completed: Date | null
  expiration: Date | null
  daysTilExpiration: number | null
  isExpiringSoon: boolean
  isSkillsEvaluator: boolean
  originallyAccomplished: Date | null
  authDate: Date | null
}

function hasActiveAchievement(dataset: Dataset, capid: number, achvId: number): boolean {
  return (dataset.esAchievementsByCapid.get(capid) ?? []).some(
    a => a.achvId === achvId && a.status.toUpperCase() === 'ACTIVE',
  )
}

/**
 * Skills Evaluator: an Active qualification held for 1+ year, plus an active
 * SET (124), in an allowed functional area, not on the no-evaluator list.
 * ICUT (217) additionally requires a communications duty title. Cadets are
 * never Skills Evaluators. (v1 ServicesESDataService.html:18-80.)
 */
export function checkSkillsEvaluator(
  dataset: Dataset,
  member: MemberRow,
  achv: MbrAchievementRow,
  functionalArea: string | null,
  asOf: Date,
): boolean {
  if (member.type.toUpperCase() === 'CADET') return false
  if (functionalArea === null || !ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS.has(functionalArea)) {
    return false
  }
  if (ES_NO_SKILLS_EVALUATOR_IDS.has(achv.achvId)) return false
  if (achv.status.toUpperCase() !== 'ACTIVE') return false
  if (achv.completed === null) return false

  const oneYearAgo = new Date(asOf)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  if (achv.completed > oneYearAgo) return false

  if (!hasActiveAchievement(dataset, member.capid, ES_ACHIEVEMENT_IDS.SET)) return false

  if (achv.achvId === ES_ACHIEVEMENT_IDS.ICUT) {
    const duties = dataset.dutiesByCapid.get(member.capid) ?? []
    const hasCommDuty = duties.some(d => COMMUNICATIONS_DUTY_POSITIONS.has(d.duty.toUpperCase().trim()))
    if (!hasCommDuty) return false
  }
  return true
}

export interface EsQualOptions {
  forDashboard?: boolean
  forCadet?: boolean
}

/**
 * A member's displayable ES qualifications
 * (v1 ServicesESDataService.html:83-308): excluded ids/areas dropped; expired
 * quals age off dashboards after 180 days and profiles after 730; Active quals
 * within 90 days of expiration flag isExpiringSoon; senior dashboards hide SET
 * always, Counterdrug when expired, GES/OPSEC when Active, and synthesize
 * Missing rows for absent GES/OPSEC; duplicates by name resolve
 * Training > Active > Not Approved > Expired, ties to the most recent
 * Completed.
 */
export function buildEsQualifications(
  dataset: Dataset,
  member: MemberRow,
  options: EsQualOptions,
  asOf: Date,
): EsQualification[] {
  const forDashboard = options.forDashboard ?? false
  const forCadet = options.forCadet ?? false
  const memberAchievements = dataset.esAchievementsByCapid.get(member.capid) ?? []

  const qualifications: EsQualification[] = []
  for (const achv of memberAchievements) {
    const achvDef = dataset.esAchievementById.get(achv.achvId)
    if (achvDef === undefined) continue
    const functionalArea = achvDef.functionalArea

    if (
      ES_EXCLUDED_ACHIEVEMENT_IDS.has(achv.achvId) ||
      (functionalArea !== null && ES_EXCLUDED_FUNCTIONAL_AREAS.has(functionalArea))
    ) {
      continue
    }

    const statusUpper = achv.status.toUpperCase()
    let status: EsQualStatus
    if (statusUpper === 'ACTIVE') status = 'Active'
    else if (statusUpper === 'TRAINING') status = 'Training'
    else if (statusUpper === 'EXPIRED') status = 'Expired'
    else status = 'Not Approved'

    let daysTilExpiration: number | null = null
    let isExpiringSoon = false

    // Expiration handling and dashboard filtering apply to senior views and
    // full profiles, not the cadet dashboard (v1 ServicesESDataService.html:135).
    if (!forCadet || !forDashboard) {
      if (achv.expiration !== null) {
        daysTilExpiration = Math.floor((achv.expiration.getTime() - asOf.getTime()) / MS_PER_DAY)
        if (status === 'Active' && daysTilExpiration <= 90 && daysTilExpiration >= 0) {
          isExpiringSoon = true
        }
        if (status === 'Expired') {
          const daysSinceExpiration = Math.abs(daysTilExpiration)
          if (forDashboard && daysSinceExpiration > 180) continue
          if (!forDashboard && daysSinceExpiration > 730) continue
        }
      }
      if (
        achv.expiration === null &&
        achv.achvId !== ES_DASHBOARD_SPECIAL.GES &&
        ES_NON_EXPIRING_EXCLUSIONS.has(achv.achvId)
      ) {
        continue
      }
      if (forDashboard && !forCadet) {
        if (achv.achvId === ES_DASHBOARD_SPECIAL.SE_TRAINING) continue
        if (achv.achvId === ES_DASHBOARD_SPECIAL.CD_COUNTERDRUG && status === 'Expired') continue
        if (
          (achv.achvId === ES_DASHBOARD_SPECIAL.GES || achv.achvId === ES_DASHBOARD_SPECIAL.OPSEC) &&
          status === 'Active'
        ) {
          continue
        }
      }
    }

    const isSkillsEvaluator = forCadet
      ? false
      : checkSkillsEvaluator(dataset, member, achv, functionalArea, asOf)

    qualifications.push({
      achvId: achv.achvId,
      name: achvDef.achv,
      functionalArea,
      status,
      statusRaw: achv.status,
      completed: achv.completed,
      expiration: achv.expiration,
      daysTilExpiration,
      isExpiringSoon,
      isSkillsEvaluator,
      originallyAccomplished: achv.originallyAccomplished,
      authDate: achv.authDate,
    })
  }

  let unique: EsQualification[]
  if (!forCadet || !forDashboard) {
    const priority: Record<EsQualStatus, number> = {
      Training: 1,
      Active: 2,
      'Not Approved': 3,
      Expired: 4,
      Missing: 999,
    }
    const byName = new Map<string, EsQualification>()
    for (const qual of qualifications) {
      const existing = byName.get(qual.name)
      if (existing === undefined) {
        byName.set(qual.name, qual)
        continue
      }
      const existingPriority = priority[existing.status]
      const currentPriority = priority[qual.status]
      if (currentPriority < existingPriority) {
        byName.set(qual.name, qual)
      } else if (currentPriority === existingPriority) {
        const existingTime = existing.completed?.getTime() ?? 0
        const currentTime = qual.completed?.getTime() ?? 0
        if (currentTime > existingTime) byName.set(qual.name, qual)
      }
    }
    unique = [...byName.values()]
  } else {
    unique = qualifications
  }

  if (forDashboard && !forCadet) {
    for (const specialId of [ES_DASHBOARD_SPECIAL.GES, ES_DASHBOARD_SPECIAL.OPSEC]) {
      if (memberAchievements.some(a => a.achvId === specialId)) continue
      const def = dataset.esAchievementById.get(specialId)
      if (def === undefined) continue
      unique.push({
        achvId: specialId,
        name: def.achv,
        functionalArea: def.functionalArea,
        status: 'Missing',
        statusRaw: null,
        completed: null,
        expiration: null,
        daysTilExpiration: null,
        isExpiringSoon: false,
        isSkillsEvaluator: false,
        originallyAccomplished: null,
        authDate: null,
      })
    }
  }

  const statusOrder: Record<EsQualStatus, number> = {
    Active: 1,
    Training: 2,
    Expired: 3,
    Missing: 4,
    'Not Approved': 5,
  }
  unique.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.name.localeCompare(b.name)
  })
  return unique
}

export interface EsPrereqNode {
  achvId: number
  name: string
  functionalArea: string | null
  prerequisites: EsPrereqNode[]
  /** Set when the node repeats an ancestor (cycle guard). */
  note?: string
}

function collectTransitivePrereqIds(node: EsPrereqNode): Set<number> {
  const ids = new Set<number>()
  for (const prereq of node.prerequisites) {
    ids.add(prereq.achvId)
    for (const id of collectTransitivePrereqIds(prereq)) ids.add(id)
  }
  return ids
}

/**
 * Prerequisite tree from AchvStepAchv, recursive with cycle detection, and
 * with direct prerequisites pruned when they already appear transitively
 * through another prerequisite (v1 ServicesESDataService.html:311-387).
 */
export function buildEsPrerequisiteTree(
  dataset: Dataset,
  achvId: number,
  ancestry: readonly number[] = [],
): EsPrereqNode | null {
  const achvDef = dataset.esAchievementById.get(achvId)
  if (achvDef === undefined) return null

  if (ancestry.includes(achvId)) {
    return {
      achvId,
      name: achvDef.achv,
      functionalArea: achvDef.functionalArea,
      prerequisites: [],
      note: 'Already shown above',
    }
  }

  const newAncestry = [...ancestry, achvId]
  const links = dataset.achvStepAchvByAchvId.get(achvId) ?? []
  const prereqs = links
    .map(link => buildEsPrerequisiteTree(dataset, link.origAchvId, newAncestry))
    .filter((n): n is EsPrereqNode => n !== null)

  const filteredPrereqs = prereqs.filter(prereq => {
    for (const other of prereqs) {
      if (other.achvId === prereq.achvId) continue
      if (collectTransitivePrereqIds(other).has(prereq.achvId)) return false
    }
    return true
  })

  return {
    achvId,
    name: achvDef.achv,
    functionalArea: achvDef.functionalArea,
    prerequisites: filteredPrereqs,
  }
}

/**
 * Senior "Level 1" for GES purposes: a legacy SeniorLevel LV1 with a real
 * Completed date, or an approved PL path credit on a path whose name contains
 * "Level 1" (v1 ServicesESDataService.html:560-583).
 */
function hasSeniorLevel1(dataset: Dataset, capid: number): boolean {
  const legacy = (dataset.seniorLevelsByCapid.get(capid) ?? []).some(
    sl => sl.lvl === 'LV1' && sl.completed !== null,
  )
  if (legacy) return true
  const level1Path = dataset.plPaths.find(p => p.pathName.includes('Level 1'))
  if (level1Path === undefined) return false
  return (dataset.pathCreditsByCapid.get(capid) ?? []).some(
    pc => pc.pathId === level1Path.pathId && pc.statusId === 8,
  )
}

/** A task counts when completed in PL credit (StatusID 8) or Active in ES MbrTasks. */
function hasCompletedTask(dataset: Dataset, capid: number, taskId: number): boolean {
  const plDone = (dataset.taskCreditsByCapid.get(capid) ?? []).some(
    tc => tc.taskId === taskId && tc.statusId === 8,
  )
  if (plDone) return true
  return (dataset.esTasksByCapid.get(capid) ?? []).some(
    t => t.taskId === taskId && (t.status ?? '').toUpperCase() === 'ACTIVE',
  )
}

export interface EsSpecialPrereqCheck {
  eligible: boolean
  missing: string[]
  satisfiedPrereqs: string[]
}

/**
 * Age gates plus the four special prerequisite cases
 * (v1 ServicesESDataService.html:500-672). Age values carry v1's table
 * (unverified against CAPR 60-3, see MIGRATION-V1.md); age is computed at asOf
 * from DOB using 365.25-day years, v1 parity.
 */
export function checkSpecialPrerequisites(
  dataset: Dataset,
  achvId: number,
  member: MemberRow,
  asOf: Date,
): EsSpecialPrereqCheck {
  const capid = member.capid
  const isCadet = member.type.toUpperCase() === 'CADET'
  const missing: string[] = []
  const satisfiedPrereqs: string[] = []

  const requiredAge = ES_AGE_REQUIREMENTS.get(achvId)
  if (requiredAge !== undefined) {
    const memberAge =
      member.dob !== null
        ? Math.floor((asOf.getTime() - member.dob.getTime()) / (MS_PER_DAY * 365.25))
        : null
    if (memberAge === null) {
      missing.push('Date of birth required for age verification')
    } else if (memberAge < requiredAge) {
      missing.push(`Age eligibility: ${requiredAge} years (member is ${memberAge} years old)`)
    } else {
      satisfiedPrereqs.push(`Age requirement: ${requiredAge}+ years`)
    }
  }

  const specialCase = ES_PREREQUISITE_SPECIAL_CASES.get(achvId)
  if (specialCase === undefined) {
    return { eligible: missing.length === 0, missing, satisfiedPrereqs }
  }

  for (const prereq of specialCase.specialPrereqs) {
    switch (prereq.type) {
      case 'OR': {
        const hasAny = prereq.options.some(id => hasActiveAchievement(dataset, capid, id))
        if (!hasAny) {
          const optionNames = prereq.options.map(
            id => dataset.esAchievementById.get(id)?.achv ?? String(id),
          )
          missing.push(`One of: ${optionNames.join(' OR ')}`)
        } else {
          satisfiedPrereqs.push('OR requirement')
        }
        break
      }
      case 'CONDITIONAL_MEMBER_TYPE': {
        // GES: senior members need E&T Level 1 (SeniorLevel/PL credit, not
        // MbrAchievements); cadets need an active Achievement 1 (Curry, 95).
        const hasRequired = isCadet
          ? hasActiveAchievement(dataset, capid, prereq.cadetAchvId)
          : hasSeniorLevel1(dataset, capid)
        if (!hasRequired) missing.push(isCadet ? 'Achievement 1 (Curry)' : 'Level 1')
        else satisfiedPrereqs.push(isCadet ? 'Achievement 1' : 'Level 1')
        break
      }
      case 'TASK': {
        let hasTask = hasCompletedTask(dataset, capid, prereq.taskId)
        // ICS 100 (TaskID 131, CAPT 116) is also satisfied by an active IS-100
        // achievement (176) (v1 ServicesESDataService.html:618-626).
        if (!hasTask && prereq.taskId === 131) {
          hasTask = hasActiveAchievement(dataset, capid, 176)
        }
        const taskName = dataset.esTaskById.get(prereq.taskId)?.taskName ?? `Task ${prereq.taskId}`
        if (!hasTask) missing.push(taskName)
        else satisfiedPrereqs.push(taskName)
        break
      }
      case 'OR_WITH_CROSS_TRAINING': {
        // PSC (64): (AOBD 67 + one of its cross-training quals) OR (GBD 68 + MS 55),
        // per the v1 special-case table.
        const hasAny = prereq.options.some(
          option =>
            hasActiveAchievement(dataset, capid, option.achvId) &&
            option.crossTraining.some(ct => hasActiveAchievement(dataset, capid, ct)),
        )
        if (!hasAny) missing.push('Cross-training requirement')
        else satisfiedPrereqs.push('Cross-training')
        break
      }
    }
  }

  return { eligible: missing.length === 0, missing, satisfiedPrereqs }
}

export interface EsEligibilityResult {
  eligible: boolean
  reasons: string[]
  prereqTree: EsPrereqNode | null
}

/**
 * Full eligibility: special prerequisites first, then the AchvStepAchv tree
 * walk. Achv 95 (cadet Achievement 1) and 96 (senior Level 1) are
 * member-type-conditional inside the tree, and ids owned by a
 * CONDITIONAL_MEMBER_TYPE special case are skipped there
 * (v1 ServicesESDataService.html:675-803).
 */
export function checkEsQualificationEligibility(
  dataset: Dataset,
  achvId: number,
  member: MemberRow,
  asOf: Date,
): EsEligibilityResult {
  const specialCheck = checkSpecialPrerequisites(dataset, achvId, member, asOf)
  if (!specialCheck.eligible) {
    return { eligible: false, reasons: specialCheck.missing, prereqTree: null }
  }

  const prereqTree = buildEsPrerequisiteTree(dataset, achvId)

  const specialCase = ES_PREREQUISITE_SPECIAL_CASES.get(achvId)
  const specialCaseAchvIds = new Set<number>()
  if (specialCase !== undefined) {
    for (const prereq of specialCase.specialPrereqs) {
      if (prereq.type === 'CONDITIONAL_MEMBER_TYPE') {
        specialCaseAchvIds.add(prereq.seniorAchvId)
        specialCaseAchvIds.add(prereq.cadetAchvId)
      }
    }
  }

  const isCadet = member.type.toUpperCase() === 'CADET'

  const checkPrereqs = (node: EsPrereqNode | null): { eligible: boolean; missing: string[] } => {
    if (node === null) return { eligible: true, missing: [] }
    if (node.note !== undefined) return { eligible: true, missing: [] }
    if (specialCaseAchvIds.has(node.achvId)) return { eligible: true, missing: [] }

    if (node.achvId === 95 || node.achvId === 96) {
      if (!isCadet) {
        if (!hasSeniorLevel1(dataset, member.capid) && node.achvId !== achvId) {
          return { eligible: false, missing: ['Level 1'] }
        }
      } else {
        if (!hasActiveAchievement(dataset, member.capid, 95) && node.achvId !== achvId) {
          return { eligible: false, missing: ['Achievement 1 (Curry)'] }
        }
      }
    } else if (!hasActiveAchievement(dataset, member.capid, node.achvId) && node.achvId !== achvId) {
      return { eligible: false, missing: [node.name] }
    }

    const missing: string[] = []
    for (const prereq of node.prerequisites) {
      const result = checkPrereqs(prereq)
      if (!result.eligible) missing.push(...result.missing)
    }
    return { eligible: missing.length === 0, missing }
  }

  const result = checkPrereqs(prereqTree)
  return { eligible: result.eligible, reasons: result.missing, prereqTree }
}

export interface EsAchievementStepTask {
  taskId: number
  taskName: string
  functionalArea: string | null
  completed: boolean
  completedDate: Date | null
  expiration: Date | null
  status: string | null
}

export interface EsAchievementStep {
  stepId: number
  stepName: string
  tasks: EsAchievementStepTask[]
}

/** Standard ES qualification step names (v1 ServicesESDataService.html:394-405). */
const ES_STEP_NAMES: ReadonlyMap<number, string> = new Map([
  [1, 'Prerequisites'],
  [2, 'Commander Approval for Prerequisites'],
  [3, 'Familiarization and Preparatory Training'],
  [4, 'Commander Approval for F&P Training'],
  [5, 'Advanced Training'],
  [6, 'Additional Requirements'],
  [7, 'Exercise Participation'],
  [8, 'Continuing Education'],
  [9, 'Final Approval'],
  [10, 'Recertification'],
])

function esStepName(stepId: number, tasks: readonly EsAchievementStepTask[]): string {
  const standard = ES_STEP_NAMES.get(stepId)
  if (standard !== undefined) return standard
  const firstTaskName = tasks[0]?.taskName ?? ''
  if (firstTaskName.includes('Commander Approval')) return 'Commander Approval'
  if (firstTaskName.includes('Exercise Participation')) return 'Exercise Participation'
  if (firstTaskName.includes('Continuing Education')) return 'Continuing Education'
  if (firstTaskName.includes('Age Eligibility') || firstTaskName.includes('Age eligibility')) {
    return 'Prerequisites & Age Eligibility'
  }
  return `Step ${stepId}`
}

/**
 * Tasks required for an achievement grouped by step, with the member's
 * completion state (v1 ServicesESDataService.html:434-497; "completed" means
 * the MbrTasks row is ACTIVE).
 */
export function getEsAchievementTasks(
  dataset: Dataset,
  achvId: number,
  capid: number,
): EsAchievementStep[] {
  const links = dataset.achvStepTasksByAchvId.get(achvId) ?? []
  const memberTasks = dataset.esTasksByCapid.get(capid) ?? []

  const steps = new Map<number, EsAchievementStep>()
  for (const link of links) {
    const taskDef = dataset.esTaskById.get(link.taskId)
    if (taskDef === undefined) continue
    let step = steps.get(link.stepId)
    if (step === undefined) {
      step = { stepId: link.stepId, stepName: '', tasks: [] }
      steps.set(link.stepId, step)
    }
    const memberTask = memberTasks.find(mt => mt.taskId === link.taskId)
    step.tasks.push({
      taskId: link.taskId,
      taskName: taskDef.taskName,
      functionalArea: taskDef.functionalArea,
      completed: memberTask !== undefined && (memberTask.status ?? '').toUpperCase() === 'ACTIVE',
      completedDate: memberTask?.completed ?? null,
      expiration: memberTask?.expiration ?? null,
      status: memberTask?.status ?? null,
    })
  }

  const out = [...steps.values()]
  for (const step of out) step.stepName = esStepName(step.stepId, step.tasks)
  return out.sort((a, b) => a.stepId - b.stepId)
}
