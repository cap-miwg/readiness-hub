/**
 * Plain-data input for the report generators. Generators are pure functions
 * over ReportData; reports/data.ts assembles it from computed_member (plus
 * targeted mirror slices for the tables v1 read raw), and tests construct it
 * in memory. No pg or fastify imports here.
 */

import type { Role } from '../shared/contracts.js'
import type { Jsonified } from '../domain/computedTypes.js'
import type { LevelsProgress, SeniorDuty, SeniorTrack } from '../domain/senior.js'
import type { RequirementStatus } from '../domain/cadet.js'
import type { EsQualification } from '../domain/es.js'
import type { UnitOrgStatsMetrics } from '../domain/orgStats.js'
import type { PlGroupRow, PlPathRow, PlTaskRow } from '../domain/dataset.js'
import type { LevelId } from '../domain/constants/index.js'

export type JsonLevelsProgress = Jsonified<LevelsProgress>
export type JsonSeniorDuty = Jsonified<SeniorDuty>
export type JsonSeniorTrack = Jsonified<SeniorTrack>
export type JsonRequirementStatus = Jsonified<RequirementStatus>
export type JsonEsQualification = Jsonified<EsQualification>
export type JsonOrgStatsMetrics = Jsonified<UnitOrgStatsMetrics>

/**
 * One scoped computed_member row. Typed date columns arrive as pg Dates;
 * optional fields are populated only when the report's needs include them
 * (JSONB payload dates are ISO strings per Jsonified).
 */
export interface ReportMember {
  capid: number
  orgid: number
  nameLast: string
  nameFirst: string
  fullName: string
  rank: string
  memberType: string
  joined: Date | null
  expiration: Date | null
  rankDate: Date | null
  dobYear: number | null
  ageAsofCompute: number | null
  isSeniorScope: boolean
  isCadetScope: boolean
  currentLevel: string | null
  promotableOn: Date | null
  tigEligibleOn: Date | null
  nextAchvId: number | null
  nextAchvPublicNumber: number | null
  tigCompleteOn: Date | null
  hfzValidUntil: Date | null
  lastPromotionOn: Date | null
  phase: string | null
  honorCredit: boolean | null
  esExpiringCount: number
  /** need memberLevelProgress: computed_member.level_progress. */
  levelProgress?: JsonLevelsProgress | null
  /** need memberSeniorDetail: detail->senior extractions. */
  seniorDuties?: JsonSeniorDuty[] | null
  seniorTracks?: JsonSeniorTrack[] | null
  seniorCurrentLevelNum?: number | null
  level2Track?: string | null
  /** need memberCadetDetail: detail->cadet extractions. */
  cadetRequirements?: JsonRequirementStatus[] | null
  currentAchievementName?: string | null
  nextAchievementName?: string | null
  /** need memberEsAll: detail->esAll (profile view; includes GES). */
  esAll?: JsonEsQualification[] | null
  /** need memberDob, admin sessions only (docs/ARCHITECTURE.md, PII posture). */
  dob?: Date | null
}

export interface OrgInfo {
  orgid: number
  region: string
  wing: string
  unit: string
  nextLevel: number | null
  name: string
  type: string
  scope: string
}

export interface TrainingSlice {
  capid: number
  typeCrs: string
  completed: Date | null
}

export interface DutySlice {
  capid: number
  duty: string
  asst: boolean
  heldAtOrgid: number
  source: 'senior' | 'cadet'
}

export interface OFlightSlice {
  capid: number
  syllabus: string | null
  fltDate: Date | null
}

export interface ActivitySlice {
  capid: number
  type: string
  location: string | null
  completed: Date | null
}

/** CadetAchvAprs CadetAchvID=1 APR rows; approvedOn = DateCreated else DateMod. */
export interface Achv1AprSlice {
  capid: number
  approvedOn: Date | null
}

export interface CadetRankSlice {
  capid: number
  rank: string
  rankDate: Date | null
}

export interface CommitteeSlice {
  capid: number
  committee: string
  chair: string | null
  orgid: number | null
}

export interface CacDutySlice {
  capid: number
  duty: string
  orgid: number
}

export interface SeniorLevelSlice {
  capid: number
  lvl: string
  completed: Date | null
}

export interface SeniorAwardSlice {
  capid: number
  award: string
  completed: Date | null
}

export interface VoluSlice {
  capid: number
  pathName: string | null
}

/** cadet_achv AE evidence (AEScore/AEDateP), the v1 fallback source. */
export interface CadetAchvAeSlice {
  capid: number
  cadetAchvId: number
  aeScore: string | null
  aeDateP: Date | null
}

/** pl_member_task_credit StatusID 8 rows for the 7 AE module TaskIDs. */
export interface AeTaskCompletionSlice {
  capid: number
  taskId: number
  completed: Date | null
}

export interface OrgStatsSlice {
  /** computed_org.org_stats for the requested scope row (self or subtree). */
  scoped: JsonOrgStatsMetrics | null
  /** Descendant units' self rows, for unit breakdown and QUA retention. */
  perUnit: Map<number, JsonOrgStatsMetrics | null>
}

export interface PlConfigSlice {
  paths: PlPathRow[]
  groupsByPathId: Map<number, PlGroupRow[]>
  tasksById: Map<number, PlTaskRow>
  taskIdsByGroupId: Map<number, Set<number>>
  levelPathMap: Map<LevelId, number>
  /** StatusID 8 pl_member_task_credit capids per moderated TaskID, scope only. */
  completedCapidsByTaskId: Map<number, Set<number>>
}

/** What a report definition asks the loader to fetch. */
export type ReportDataNeed =
  | 'memberLevelProgress'
  | 'memberSeniorDetail'
  | 'memberCadetDetail'
  | 'memberEsAll'
  | 'memberDob'
  | 'training'
  | 'duties'
  | 'oflights'
  | 'cadetActivities'
  | 'achv1Approvals'
  | 'cadetRanks'
  | 'seniorLevels'
  | 'seniorAwards'
  | 'voluInstructors'
  | 'orgStats'
  | 'plConfig'
  | 'aerospace'
  | 'cac'

export interface ReportData {
  asOf: Date
  role: Role
  orgid: number
  descendants: boolean
  /** Home orgids in scope (includes UNASSIGNED -1 when in the closure). */
  scopeOrgids: ReadonlySet<number>
  members: ReportMember[]
  /** Every organizations row, for unit names, types, and ancestor walks. */
  orgs: Map<number, OrgInfo>
  training: TrainingSlice[]
  duties: DutySlice[]
  oflights: OFlightSlice[]
  cadetActivities: ActivitySlice[]
  achv1Approvals: Achv1AprSlice[]
  cadetRanks: CadetRankSlice[]
  committees: CommitteeSlice[]
  cacDuties: CacDutySlice[]
  /** CAC reps whose home org is outside the scoped member set. */
  extraMembers: ReportMember[]
  emails: Map<number, string>
  seniorLevels: SeniorLevelSlice[]
  seniorAwards: SeniorAwardSlice[]
  voluInstructors: VoluSlice[]
  cadetAchvAe: CadetAchvAeSlice[]
  aeTaskCompletions: AeTaskCompletionSlice[]
  orgStats: OrgStatsSlice
  plConfig: PlConfigSlice | null
}

/** Empty scaffold for tests and for defaulting unloaded slices. */
export function emptyReportData(over: Partial<ReportData> = {}): ReportData {
  return {
    asOf: new Date(),
    role: 'viewer',
    orgid: 0,
    descendants: false,
    scopeOrgids: new Set<number>(),
    members: [],
    orgs: new Map(),
    training: [],
    duties: [],
    oflights: [],
    cadetActivities: [],
    achv1Approvals: [],
    cadetRanks: [],
    committees: [],
    cacDuties: [],
    extraMembers: [],
    emails: new Map(),
    seniorLevels: [],
    seniorAwards: [],
    voluInstructors: [],
    cadetAchvAe: [],
    aeTaskCompletions: [],
    orgStats: { scoped: null, perUnit: new Map() },
    plConfig: null,
    ...over,
  }
}
