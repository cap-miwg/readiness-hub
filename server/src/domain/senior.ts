/**
 * Senior member Education & Training domain logic, ported from v1:
 * - levels, tracks, duties, awards: ServicesDataService.html
 * - promotion eligibility: Index.html getPromotionDetails (:666-729), against
 *   the corrected PROMOTION_RULES (constants/promotionRules.ts).
 * Pure functions over the in-memory Dataset; time enters only through asOf.
 */
import type {
  Dataset,
  MemberRow,
  OrganizationRow,
  PlMemberTaskCreditRow,
  PlPathRow,
} from './dataset.js'
import {
  DUTY_TO_TRACK_MAP,
  LEVELS,
  LEVEL2_TRACK_CHOICES,
  LEVEL_DISPLAY_MAP,
  PROMOTION_RULES,
  normalizeRank,
  type LevelId,
} from './constants/index.js'

// v1 Index.html:672 approximates a month as 30.44 days for all TIG and duty-duration arithmetic.
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

function monthsBetween(from: Date, to: Date): number {
  return Math.floor(Math.abs(to.getTime() - from.getTime()) / MS_PER_MONTH)
}

/**
 * Level id -> PL_Paths PathID, by PathName substring match with fallback
 * (v1 ServicesDataService.html:3-15). L2P2 falls back to the first path whose
 * name merely contains "Level 2" when no "Level 2 Part 2" path exists.
 */
export function deriveLevelPathMap(paths: readonly PlPathRow[]): Map<LevelId, number> {
  const findId = (namePart: string): number | undefined =>
    paths.find(p => p.pathName.includes(namePart))?.pathId
  const map = new Map<LevelId, number>()
  for (const def of LEVELS) {
    const matchId = findId(def.pathMatch)
    if (matchId !== undefined) {
      map.set(def.id, matchId)
      continue
    }
    if (def.fallbackMatch !== undefined) {
      const fallbackId = findId(def.fallbackMatch)
      if (fallbackId !== undefined) map.set(def.id, fallbackId)
    }
  }
  return map
}

/**
 * Which Level 2 track the member chose: the most recently completed
 * track-choice task (StatusID 8), ties broken by higher credit id
 * (v1 ServicesDataService.html:17-33).
 */
export function determineLevel2Track(taskCredits: readonly PlMemberTaskCreditRow[]): string | null {
  const choices = taskCredits
    .filter(c => LEVEL2_TRACK_CHOICES.has(c.taskId) && c.statusId === 8)
    .map(c => ({
      track: LEVEL2_TRACK_CHOICES.get(c.taskId) ?? '',
      completed: c.completed,
      id: c.memberTaskCreditId,
    }))
  if (choices.length === 0) return null
  choices.sort((a, b) => {
    const aTime = a.completed !== null ? a.completed.getTime() : 0
    const bTime = b.completed !== null ? b.completed.getTime() : 0
    if (aTime !== bTime) return bTime - aTime
    return b.id - a.id
  })
  return choices[0]?.track ?? null
}

export type LevelStatus = 'not-started' | 'in-progress' | 'ready' | 'pending' | 'completed'
export type LevelApproval = 'approved' | 'pending' | 'disapproved' | 'ready' | null

export interface LevelProgress {
  percent: number
  status: LevelStatus
  approvalStatus: LevelApproval
  date: Date | null
  pathId: number | null
  totalReq: number
  totalComp: number
  legacy: boolean
}

export type LevelsProgress = Record<LevelId, LevelProgress>

/**
 * Per-level completion: required-task counting per PL group (StatusID 8 task
 * credits against PL_TaskGroupAssignments, capped at each group's
 * NumberOfRequiredTasks), path credit status (8 approved / 26 pending /
 * 27 disapproved), and legacy SeniorLevel awards
 * (v1 ServicesDataService.html:35-122).
 */
export function calculateLevelsProgress(
  dataset: Dataset,
  capid: number,
  levelPathMap: ReadonlyMap<LevelId, number>,
): { progress: LevelsProgress; currentLevel: number } {
  const taskCredits = dataset.taskCreditsByCapid.get(capid) ?? []
  const pathCredits = dataset.pathCreditsByCapid.get(capid) ?? []
  const legacyLevels = dataset.seniorLevelsByCapid.get(capid) ?? []

  const progress = {} as LevelsProgress
  for (const def of LEVELS) {
    const pathId = levelPathMap.get(def.id) ?? null
    let totalReq = 0
    let totalComp = 0
    if (pathId !== null) {
      for (const group of dataset.plGroupsByPathId.get(pathId) ?? []) {
        const req = group.numberOfRequiredTasks
        // Zero-requirement groups are extra credit, not counted (v1 ServicesDataService.html:49).
        if (req === 0) continue
        totalReq += req
        const groupTaskIds = dataset.plTaskIdsByGroupId.get(group.groupId)
        const comp =
          groupTaskIds === undefined
            ? 0
            : taskCredits.filter(c => c.statusId === 8 && groupTaskIds.has(c.taskId)).length
        totalComp += Math.min(comp, req)
      }
    }

    let percent = totalReq > 0 ? Math.round((totalComp / totalReq) * 100) : 0
    const legacyEntry =
      def.legacyKey !== undefined ? legacyLevels.find(sl => sl.lvl === def.legacyKey) : undefined
    const creditsForPath = pathId !== null ? pathCredits.filter(pc => pc.pathId === pathId) : []
    const approvedCredit = creditsForPath.find(pc => pc.statusId === 8)
    const pendingCredit = creditsForPath.find(pc => pc.statusId === 26)
    const disapprovedCredit = creditsForPath.find(pc => pc.statusId === 27)

    let status: LevelStatus = 'not-started'
    let approvalStatus: LevelApproval = null
    let date: Date | null = null

    if (legacyEntry !== undefined || approvedCredit !== undefined) {
      status = 'completed'
      approvalStatus = 'approved'
      date = legacyEntry !== undefined ? legacyEntry.completed : (approvedCredit?.completed ?? null)
      percent = 100
    } else if (percent >= 100) {
      if (pendingCredit !== undefined || disapprovedCredit !== undefined) {
        status = 'pending'
        approvalStatus = pendingCredit !== undefined ? 'pending' : 'disapproved'
        date = (pendingCredit ?? disapprovedCredit)?.completed ?? null
      } else {
        status = 'ready'
        approvalStatus = 'ready'
      }
    } else if (percent > 0) {
      status = 'in-progress'
    }

    progress[def.id] = {
      percent,
      status,
      approvalStatus,
      date,
      pathId,
      totalReq,
      totalComp,
      legacy: legacyEntry !== undefined,
    }
  }

  // A legacy LV2 award satisfies both halves of the split Level 2 (v1 ServicesDataService.html:98-106).
  const legacyLevel2 = legacyLevels.find(sl => sl.lvl === 'LV2')
  if (legacyLevel2 !== undefined) {
    for (const id of ['L2P1', 'L2P2'] as const) {
      const p = progress[id]
      if (p.status !== 'completed') {
        progress[id] = {
          ...p,
          status: 'completed',
          approvalStatus: 'approved',
          percent: 100,
          date: legacyLevel2.completed,
          legacy: true,
        }
      }
    }
  }

  // Current level is the highest complete base level; level 2 requires both
  // parts (v1 ServicesDataService.html:108-119).
  const baseComplete: Record<number, boolean> = {
    1: progress.L1.status === 'completed',
    2: progress.L2P1.status === 'completed' && progress.L2P2.status === 'completed',
    3: progress.L3.status === 'completed',
    4: progress.L4.status === 'completed',
    5: progress.L5.status === 'completed',
  }
  let currentLevel = 0
  for (let lvl = 5; lvl >= 1; lvl--) {
    if (baseComplete[lvl] === true) {
      currentLevel = lvl
      break
    }
  }

  return { progress, currentLevel }
}

export interface SeniorDutyBase {
  name: string
  isAsst: boolean
  date: Date | null
  orgString: string
  displayName: string
}

export interface SeniorDuty extends SeniorDutyBase {
  hasTrack: boolean
  warningMsg: string
}

export interface SeniorTrackBase {
  name: string
  level: string
  date: Date | null
}

export interface SeniorTrack extends SeniorTrackBase {
  hasDuty: boolean
  warningMsg: string
}

export interface SeniorAwardInfo {
  award: string
  awardNo: string | null
  completed: Date | null
}

export function buildDuties(dataset: Dataset, capid: number): SeniorDutyBase[] {
  return (dataset.dutiesByCapid.get(capid) ?? []).map(d => {
    const org = dataset.orgByOrgid.get(d.orgid)
    // Duty org strings are unpadded in v1 (ServicesDataService.html:266), unlike buildUnitName.
    const orgString = org !== undefined ? `${org.region}-${org.wing}-${org.unit}` : 'Unknown'
    return {
      name: d.duty,
      isAsst: d.asst,
      date: d.dateMod,
      orgString,
      displayName: `${d.duty}${d.asst ? ' (A)' : ''}`,
    }
  })
}

export function buildTracks(dataset: Dataset, capid: number): SeniorTrackBase[] {
  return (dataset.specTracksByCapid.get(capid) ?? []).map(t => ({
    name: t.track,
    level: t.trackLevel,
    date: t.dateMod,
  }))
}

export function buildSeniorAwards(dataset: Dataset, capid: number): SeniorAwardInfo[] {
  return (dataset.seniorAwardsByCapid.get(capid) ?? [])
    .filter(a => a.completed !== null)
    .map(a => ({ award: a.award, awardNo: a.awardNo, completed: a.completed }))
}

/**
 * Duty/track discrepancy warnings via DUTY_TO_TRACK_MAP
 * (v1 ServicesDataService.html:276-308): a duty whose mapped track the member
 * is not enrolled in, and a NONE-level track with no mapped duty held.
 */
export function applyDutyTrackWarnings(
  duties: readonly SeniorDutyBase[],
  tracks: readonly SeniorTrackBase[],
): { dutiesWithStatus: SeniorDuty[]; tracksWithStatus: SeniorTrack[] } {
  const dutiesWithStatus = duties.map(duty => {
    const cleanDuty = duty.name.toUpperCase().trim()
    const requiredTrack = DUTY_TO_TRACK_MAP[cleanDuty]
    let hasTrack = true
    let warningMsg = ''
    if (requiredTrack !== undefined) {
      const hasEnrolled = tracks.some(t => {
        const trackName = t.name.toUpperCase().trim()
        return trackName.includes(requiredTrack) || requiredTrack.includes(trackName)
      })
      if (!hasEnrolled) {
        hasTrack = false
        warningMsg = `Missing Track: ${requiredTrack}`
      }
    }
    return { ...duty, hasTrack, warningMsg }
  })

  const tracksWithStatus = tracks.map(track => {
    const isNone = track.level === 'NONE'
    let hasDuty = true
    let warningMsg = ''
    if (isNone) {
      const trackNameUpper = track.name.toUpperCase().trim()
      const relevantDutyExists = duties.some(
        d => DUTY_TO_TRACK_MAP[d.name.toUpperCase().trim()] === trackNameUpper,
      )
      if (!relevantDutyExists) {
        hasDuty = false
        warningMsg = 'Enrolled (NONE) but no Duty Position assigned.'
      }
    }
    return { ...track, hasDuty, warningMsg }
  })

  return { dutiesWithStatus, tracksWithStatus }
}

const padUnit = (val: string): string => val.replace(/^0+/, '').padStart(3, '0')

export function buildUnitName(org: OrganizationRow | undefined): string {
  if (org === undefined) return 'Unknown'
  return `${org.region}-${org.wing}-${padUnit(org.unit !== '' ? org.unit : '000')}`
}

export interface PromotionDetails {
  currentRank: string
  nextRank: string
  rankDate: Date | null
  tigMonthsCurrent: number
  tigMonthsRequired: number
  eligibleDate: Date | null
  isTigMet: boolean
  levelRequired: string
  levelCurrent: string
  isLevelMet: boolean
  dutyReq: string | null
  isDutyMet: boolean
  dutyStatusString: string
  currentDutyMonths: number
  membershipMonthsRequired: number | null
  membershipMonthsCurrent: number
  isMembershipMet: boolean
  isEligible: boolean
}

/**
 * NCO duty requirements match by duty-title substring (v1 Index.html:678-684).
 * The MSGT label changed to CAPR 35-5 fig 9 wording ("Squadron/Flight NCO");
 * its matcher keeps v1's duty-title semantics.
 */
function dutyTitleMatches(dutyReq: string, dutyNameUpper: string): boolean {
  switch (dutyReq) {
    case 'Unit NCO':
      return dutyNameUpper.includes('NCO') || dutyNameUpper.includes('SERGEANT')
    case 'NCO Advisor':
    case 'Squadron/Flight NCO':
      return dutyNameUpper.includes('NCO ADVISOR')
    case 'Command NCO':
      return dutyNameUpper.includes('COMMAND NCO') || dutyNameUpper.includes('SENIOR ENLISTED LEADER')
    default:
      return false
  }
}

export function getPromotionDetails(
  member: MemberRow,
  duties: readonly SeniorDutyBase[],
  levelsProgress: LevelsProgress,
  currentLevel: number,
  asOf: Date,
): PromotionDetails | null {
  const normRank = normalizeRank(member.rank)
  const rules = PROMOTION_RULES[normRank]
  if (rules === undefined) return null

  const rankDate = member.rankDate
  // Missing RankDate counts as zero TIG (v1 produced NaN and never showed TIG met).
  const tigMonthsCurrent = rankDate !== null ? monthsBetween(rankDate, asOf) : 0
  let eligibleDate: Date | null = null
  if (rankDate !== null) {
    eligibleDate = new Date(rankDate)
    eligibleDate.setMonth(eligibleDate.getMonth() + rules.tigMonths)
  }

  let isDutyMet = true
  let dutyStatusString = ''
  let currentDutyMonths = 0
  const dutyReq = rules.dutyReq
  if (dutyReq !== undefined) {
    isDutyMet = false
    const matching = duties.filter(d => dutyTitleMatches(dutyReq, d.name.toUpperCase()))
    if (matching.length > 0) {
      let maxMonths = 0
      for (const d of matching) {
        if (d.date === null) continue
        const months = monthsBetween(d.date, asOf)
        if (months > maxMonths) maxMonths = months
      }
      currentDutyMonths = maxMonths
      const requiredDutyMonths = rules.dutyMonths ?? 0
      isDutyMet = maxMonths >= requiredDutyMonths
      dutyStatusString = isDutyMet
        ? `Completed (${maxMonths} months)`
        : `In Progress (${maxMonths} / ${requiredDutyMonths} months)`
    } else {
      dutyStatusString = `Missing Assignment: ${dutyReq}`
    }
  }

  let levelRequired = rules.level !== 0 ? `Level ${rules.level}` : ''
  let levelCurrent = currentLevel !== 0 ? `Level ${currentLevel}` : 'Not Started'
  let isLevelMet = rules.level !== 0 ? currentLevel >= rules.level : true

  const requiredParts = rules.requiredParts
  if (requiredParts !== undefined && requiredParts.length > 0) {
    levelRequired = requiredParts
      .map(p => LEVEL_DISPLAY_MAP.get(p as LevelId)?.name ?? p)
      .join(' + ')
    isLevelMet = requiredParts.every(p => levelsProgress[p as LevelId]?.status === 'completed')
    levelCurrent = requiredParts
      .map(p => {
        const st = levelsProgress[p as LevelId]
        const short = LEVEL_DISPLAY_MAP.get(p as LevelId)?.label ?? p
        if (st?.status === 'completed') return `${short}: Done`
        if (st?.status === 'ready') return `${short}: Ready to submit`
        if (st?.status === 'pending') return `${short}: Pending`
        return `${short}: Incomplete`
      })
      .join(' | ')
  }

  // CAPR 35-5 fig 2: SM -> 2d Lt additionally requires 6 months as a member,
  // counted from Member.Joined (correction over v1; MIGRATION-V1.md).
  const membershipMonthsRequired = rules.minMembershipMonths ?? null
  const membershipMonthsCurrent = member.joined !== null ? monthsBetween(member.joined, asOf) : 0
  const isMembershipMet =
    membershipMonthsRequired === null || membershipMonthsCurrent >= membershipMonthsRequired

  const isTigMet = tigMonthsCurrent >= rules.tigMonths
  const isEligible =
    isTigMet && isLevelMet && (dutyReq === undefined || isDutyMet) && isMembershipMet

  return {
    currentRank: member.rank,
    nextRank: rules.next,
    rankDate,
    tigMonthsCurrent,
    tigMonthsRequired: rules.tigMonths,
    eligibleDate,
    isTigMet,
    levelRequired,
    levelCurrent,
    isLevelMet,
    dutyReq: dutyReq ?? null,
    isDutyMet,
    dutyStatusString,
    currentDutyMonths,
    membershipMonthsRequired,
    membershipMonthsCurrent,
    isMembershipMet,
    isEligible,
  }
}

export interface ProcessedSenior {
  capid: number
  nameFirst: string
  nameLast: string
  rank: string
  orgid: number
  memberUnitName: string
  duties: SeniorDuty[]
  tracks: SeniorTrack[]
  seniorAwards: SeniorAwardInfo[]
  levelsProgress: LevelsProgress
  level2Track: string | null
  currentLevel: number
  rankDate: Date | null
  promotion: PromotionDetails | null
}

export function processSenior(
  dataset: Dataset,
  member: MemberRow,
  asOf: Date,
  levelPathMap?: ReadonlyMap<LevelId, number>,
): ProcessedSenior {
  const pathMap = levelPathMap ?? deriveLevelPathMap(dataset.plPaths)
  const dutyBases = buildDuties(dataset, member.capid)
  const trackBases = buildTracks(dataset, member.capid)
  const { dutiesWithStatus, tracksWithStatus } = applyDutyTrackWarnings(dutyBases, trackBases)
  const { progress, currentLevel } = calculateLevelsProgress(dataset, member.capid, pathMap)
  const level2Track = determineLevel2Track(dataset.taskCreditsByCapid.get(member.capid) ?? [])
  const seniorAwards = buildSeniorAwards(dataset, member.capid)
  const promotion = getPromotionDetails(member, dutiesWithStatus, progress, currentLevel, asOf)
  return {
    capid: member.capid,
    nameFirst: member.nameFirst,
    nameLast: member.nameLast,
    rank: member.rank,
    orgid: member.orgid,
    memberUnitName: buildUnitName(dataset.orgByOrgid.get(member.orgid)),
    duties: dutiesWithStatus,
    tracks: tracksWithStatus,
    seniorAwards,
    levelsProgress: progress,
    level2Track,
    currentLevel,
    rankDate: member.rankDate,
    promotion,
  }
}

/**
 * Senior surfaces show SENIOR and LIFE member types with ACTIVE status
 * (v1 ServicesDataService.html:314-321).
 */
export function processSeniors(dataset: Dataset, orgids: ReadonlySet<number>, asOf: Date): ProcessedSenior[] {
  const pathMap = deriveLevelPathMap(dataset.plPaths)
  return dataset.members
    .filter(m => {
      const type = m.type.toUpperCase()
      return (
        (type === 'SENIOR' || type === 'LIFE') &&
        m.mbrStatus.toUpperCase() === 'ACTIVE' &&
        orgids.has(m.orgid)
      )
    })
    .map(m => processSenior(dataset, m, asOf, pathMap))
}
