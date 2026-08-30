/**
 * The in-memory dataset the domain layer computes over: typed rows (canonical
 * types per docs/ARCHITECTURE.md: integer IDs, booleans, Date-or-null with the
 * 01/01/1900 sentinel already normalized to null at parse) plus index maps so
 * no domain function ever scans a full table per member (the v1 performance
 * root cause).
 *
 * Contract file: domain modules consume this; the compute step constructs it
 * from the mirror tables via buildDataset(). Do not add server imports here.
 */

export interface MemberRow {
  capid: number
  nameLast: string
  nameFirst: string
  nameMiddle: string | null
  nameSuffix: string | null
  dob: Date | null
  orgid: number
  wing: string
  unit: string
  rank: string
  joined: Date | null
  expiration: Date | null
  orgJoined: Date | null
  dateMod: Date | null
  type: string // CADET | SENIOR | LIFE | FIFTY YEAR | PATRON | AEM | CADET SPONSOR ...
  rankDate: Date | null
  region: string
  mbrStatus: string // ACTIVE is what v1 accepts
}

export interface OrganizationRow {
  orgid: number
  region: string
  wing: string
  unit: string
  nextLevel: number | null
  name: string
  type: string
  dateChartered: Date | null
  status: string
  scope: string // UNIT | GROUP | WING ...
}

export interface MbrContactRow {
  capid: number
  type: string // EMAIL | CADET PARENT EMAIL | ...
  priority: string // PRIMARY | ...
  contact: string
  doNotContact: boolean
}

export interface DutyPositionRow {
  capid: number
  duty: string
  functArea: string | null
  lvl: string | null
  asst: boolean
  dateMod: Date | null
  orgid: number // held-at org, may differ from home unit
}

export interface MbrAchievementRow {
  capid: number
  achvId: number
  status: string // ACTIVE | TRAINING | EXPIRED | NOT APPROVED ...
  originallyAccomplished: Date | null
  completed: Date | null
  expiration: Date | null
  authDate: Date | null
  dateMod: Date | null
  orgid: number | null
}

export interface MbrTaskRow {
  capid: number
  taskId: number
  status: string | null
  completed: Date | null
  expiration: Date | null
  orgid: number | null
}

export interface CadetAchvRow {
  capid: number
  cadetAchvId: number
  phyFitTest: Date | null
  leadLabDateP: Date | null
  leadLabScore: string | null
  aeDateP: Date | null
  aeScore: string | null
  aeMod: string | null
  aeTest: string | null
  moralLDateP: Date | null
  activePart: string | null
  otherReq: string | null
  sdaReport: string | null
  dateMod: Date | null
  drillDate: Date | null
  drillScore: string | null
  leadCurr: string | null
  cadetOath: string | null
  aeBookValue: string | null
  mileRun: string | null
  shuttleRun: string | null
  sitAndReach: string | null
  pushUps: string | null
  curlUps: string | null
  hfzId: number | null
  staffServiceDate: Date | null
  technicalWritingAssignment: string | null
  technicalWritingAssignmentDate: Date | null
  oralPresentationDate: Date | null
  speechDate: Date | null
  leadershipEssayDate: Date | null
}

export interface CadetAchvAprRow {
  capid: number
  cadetAchvId: number
  status: string // APR | PENDING | ...
  awardNo: string | null
  dateMod: Date | null
  dateCreated: Date | null
}

export interface CadetAchvFullReportRow {
  capid: number
  achvName: string
  aprDate: Date | null
}

export interface CadetActivityRow {
  capid: number
  type: string
  location: string | null
  completed: Date | null
}

export interface CadetHfzRow {
  hfzId: number
  capid: number
  dateTaken: Date | null
  orgid: number | null
  isPassed: boolean
  pacerRun: string | null
  pacerRunPassed: boolean | null
  mileRun: string | null
  mileRunPassed: boolean | null
  curlUp: string | null
  curlUpPassed: boolean | null
  pushUp: string | null
  pushUpPassed: boolean | null
  sitAndReach: string | null
  sitAndReachPassed: boolean | null
}

export interface CadetRankRow {
  capid: number
  rank: string
  rankDate: Date | null
  dateMod: Date | null
}

export interface CadetPhaseRow {
  capid: number
  type: string
  completed: Date | null
}

export interface CadetAwardRow {
  capid: number
  award: string
  awardNo: string | null
  completed: Date | null
}

export interface SeniorLevelRow {
  capid: number
  lvl: string // LV1..LV5
  completed: Date | null
}

export interface SeniorAwardRow {
  capid: number
  award: string
  awardNo: string | null
  completed: Date | null
}

export interface SpecTrackRow {
  capid: number
  track: string
  trackLevel: string // NONE | TECHNICIAN | SENIOR | MASTER
  howComplete: string | null
  completed: Date | null
  dateMod: Date | null
}

export interface TrainingRow {
  capid: number
  typeCrs: string
  howComplete: string | null
  crsId: string | null
  completed: Date | null
}

export interface OFlightRow {
  capid: number
  wing: string | null
  unit: string | null
  syllabus: string | null
  type: string | null
  fltDate: Date | null
}

export interface MbrCommitteeRow {
  capid: number
  committee: string
  chair: string | null
  orgid: number | null
  dateAssigned: Date | null
}

export interface OrgStatisticRow {
  orgid: number
  region: string
  wing: string
  unit: string
  mbrType: string
  cntType: string
  quantity: number
  cntDate: Date | null
}

export interface PlPathRow {
  pathId: number
  pathName: string
}

export interface PlGroupRow {
  groupId: number
  pathId: number
  groupName: string
  numberOfRequiredTasks: number
  awardsExtraCredit: boolean
}

export interface PlTaskRow {
  taskId: number
  taskName: string
  description: string | null
}

export interface PlTaskGroupAssignmentRow {
  taskGroupAssignmentId: number
  taskId: number
  groupId: number
}

export interface PlMemberPathCreditRow {
  memberPathCreditId: number
  pathId: number
  capid: number
  statusId: number // 8 complete, 26 pending, 27 disapproved
  completed: Date | null
  expiration: Date | null
  extraCreditEarned: string | null
}

export interface PlMemberTaskCreditRow {
  memberTaskCreditId: number
  taskId: number
  capid: number
  statusId: number
  completed: Date | null
  expiration: Date | null
}

export interface PlVolUInstructorRow {
  fullName: string
  capid: number
  region: string | null
  wing: string | null
  unit: string | null
  instructorType: string | null
  category: string | null
  pathName: string | null
}

export interface EsAchievementRow {
  achvId: number
  achv: string
  functionalArea: string | null
}

export interface EsTaskRow {
  taskId: number
  taskName: string
  functionalArea: string | null
}

export interface AchvStepTaskRow {
  achvStepTaskId: number
  achvId: number
  stepId: number
  taskId: number
}

export interface AchvStepAchvRow {
  achvStepTaskId: number
  achvId: number
  stepId: number
  origAchvId: number
}

export interface CdtAchvEnumRow {
  cadetAchvId: number
  achvName: string
  curAwdNo: string | null
  rank: string | null
}

/** Everything the domain layer reads, pre-indexed. */
export interface Dataset {
  members: MemberRow[]
  organizations: OrganizationRow[]

  /** Index maps. by* maps are keyed by CAPID unless stated otherwise. */
  memberByCapid: Map<number, MemberRow>
  orgByOrgid: Map<number, OrganizationRow>
  /** Direct children by parent ORGID (from NextLevel), anchor subtree only. */
  orgChildren: Map<number, OrganizationRow[]>
  membersByOrgid: Map<number, MemberRow[]>

  contactsByCapid: Map<number, MbrContactRow[]>
  dutiesByCapid: Map<number, DutyPositionRow[]>
  cadetDutiesByCapid: Map<number, DutyPositionRow[]>
  esAchievementsByCapid: Map<number, MbrAchievementRow[]>
  esTasksByCapid: Map<number, MbrTaskRow[]>
  cadetAchvByCapid: Map<number, CadetAchvRow[]>
  cadetAchvAprsByCapid: Map<number, CadetAchvAprRow[]>
  cadetAchvFullByCapid: Map<number, CadetAchvFullReportRow[]>
  cadetActivitiesByCapid: Map<number, CadetActivityRow[]>
  cadetHfzByCapid: Map<number, CadetHfzRow[]>
  cadetRanksByCapid: Map<number, CadetRankRow[]>
  cadetPhasesByCapid: Map<number, CadetPhaseRow[]>
  cadetAwardsByCapid: Map<number, CadetAwardRow[]>
  seniorLevelsByCapid: Map<number, SeniorLevelRow[]>
  seniorAwardsByCapid: Map<number, SeniorAwardRow[]>
  specTracksByCapid: Map<number, SpecTrackRow[]>
  trainingByCapid: Map<number, TrainingRow[]>
  oFlightsByCapid: Map<number, OFlightRow[]>
  committeesByCapid: Map<number, MbrCommitteeRow[]>
  pathCreditsByCapid: Map<number, PlMemberPathCreditRow[]>
  taskCreditsByCapid: Map<number, PlMemberTaskCreditRow[]>
  /** PL task credits keyed by TaskID -> capids with StatusID 8 (complete). */
  completedCapidsByTaskId: Map<number, Set<number>>

  orgStatistics: OrgStatisticRow[]
  plPaths: PlPathRow[]
  plGroupsByPathId: Map<number, PlGroupRow[]>
  plTasksById: Map<number, PlTaskRow>
  plTaskIdsByGroupId: Map<number, Set<number>>
  volUInstructors: PlVolUInstructorRow[]
  esAchievementById: Map<number, EsAchievementRow>
  esTaskById: Map<number, EsTaskRow>
  achvStepTasksByAchvId: Map<number, AchvStepTaskRow[]>
  achvStepAchvByAchvId: Map<number, AchvStepAchvRow[]>
  cdtAchvEnumById: Map<number, CdtAchvEnumRow>
}

export interface DatasetInput {
  members: MemberRow[]
  organizations: OrganizationRow[]
  mbrContact: MbrContactRow[]
  dutyPositions: DutyPositionRow[]
  cadetDutyPositions: DutyPositionRow[]
  mbrAchievements: MbrAchievementRow[]
  mbrTasks: MbrTaskRow[]
  cadetAchv: CadetAchvRow[]
  cadetAchvAprs: CadetAchvAprRow[]
  cadetAchvFullReport: CadetAchvFullReportRow[]
  cadetActivities: CadetActivityRow[]
  cadetHfz: CadetHfzRow[]
  cadetRank: CadetRankRow[]
  cadetPhase: CadetPhaseRow[]
  cadetAwards: CadetAwardRow[]
  seniorLevel: SeniorLevelRow[]
  seniorAwards: SeniorAwardRow[]
  specTrack: SpecTrackRow[]
  training: TrainingRow[]
  oFlight: OFlightRow[]
  mbrCommittee: MbrCommitteeRow[]
  orgStatistics: OrgStatisticRow[]
  plPaths: PlPathRow[]
  plGroups: PlGroupRow[]
  plTasks: PlTaskRow[]
  plTaskGroupAssignments: PlTaskGroupAssignmentRow[]
  plMemberPathCredit: PlMemberPathCreditRow[]
  plMemberTaskCredit: PlMemberTaskCreditRow[]
  plVolUInstructors: PlVolUInstructorRow[]
  achievements: EsAchievementRow[]
  tasks: EsTaskRow[]
  achvStepTasks: AchvStepTaskRow[]
  achvStepAchv: AchvStepAchvRow[]
  cdtAchvEnum: CdtAchvEnumRow[]
}

function groupBy<T>(rows: T[], key: (r: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const r of rows) {
    const k = key(r)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

function uniqueBy<T>(rows: T[], key: (r: T) => number): Map<number, T> {
  const m = new Map<number, T>()
  for (const r of rows) m.set(key(r), r)
  return m
}

export function buildDataset(input: DatasetInput): Dataset {
  const completedCapidsByTaskId = new Map<number, Set<number>>()
  for (const c of input.plMemberTaskCredit) {
    if (c.statusId !== 8) continue
    let set = completedCapidsByTaskId.get(c.taskId)
    if (!set) {
      set = new Set()
      completedCapidsByTaskId.set(c.taskId, set)
    }
    set.add(c.capid)
  }

  const plTaskIdsByGroupId = new Map<number, Set<number>>()
  for (const a of input.plTaskGroupAssignments) {
    let set = plTaskIdsByGroupId.get(a.groupId)
    if (!set) {
      set = new Set()
      plTaskIdsByGroupId.set(a.groupId, set)
    }
    set.add(a.taskId)
  }

  return {
    members: input.members,
    organizations: input.organizations,
    memberByCapid: uniqueBy(input.members, m => m.capid),
    orgByOrgid: uniqueBy(input.organizations, o => o.orgid),
    orgChildren: groupBy(
      input.organizations.filter(o => o.nextLevel !== null),
      o => o.nextLevel as number,
    ),
    membersByOrgid: groupBy(input.members, m => m.orgid),
    contactsByCapid: groupBy(input.mbrContact, r => r.capid),
    dutiesByCapid: groupBy(input.dutyPositions, r => r.capid),
    cadetDutiesByCapid: groupBy(input.cadetDutyPositions, r => r.capid),
    esAchievementsByCapid: groupBy(input.mbrAchievements, r => r.capid),
    esTasksByCapid: groupBy(input.mbrTasks, r => r.capid),
    cadetAchvByCapid: groupBy(input.cadetAchv, r => r.capid),
    cadetAchvAprsByCapid: groupBy(input.cadetAchvAprs, r => r.capid),
    cadetAchvFullByCapid: groupBy(input.cadetAchvFullReport, r => r.capid),
    cadetActivitiesByCapid: groupBy(input.cadetActivities, r => r.capid),
    cadetHfzByCapid: groupBy(input.cadetHfz, r => r.capid),
    cadetRanksByCapid: groupBy(input.cadetRank, r => r.capid),
    cadetPhasesByCapid: groupBy(input.cadetPhase, r => r.capid),
    cadetAwardsByCapid: groupBy(input.cadetAwards, r => r.capid),
    seniorLevelsByCapid: groupBy(input.seniorLevel, r => r.capid),
    seniorAwardsByCapid: groupBy(input.seniorAwards, r => r.capid),
    specTracksByCapid: groupBy(input.specTrack, r => r.capid),
    trainingByCapid: groupBy(input.training, r => r.capid),
    oFlightsByCapid: groupBy(input.oFlight, r => r.capid),
    committeesByCapid: groupBy(input.mbrCommittee, r => r.capid),
    pathCreditsByCapid: groupBy(input.plMemberPathCredit, r => r.capid),
    taskCreditsByCapid: groupBy(input.plMemberTaskCredit, r => r.capid),
    completedCapidsByTaskId,
    orgStatistics: input.orgStatistics,
    plPaths: input.plPaths,
    plGroupsByPathId: groupBy(input.plGroups, g => g.pathId),
    plTasksById: uniqueBy(input.plTasks, t => t.taskId),
    plTaskIdsByGroupId,
    volUInstructors: input.plVolUInstructors,
    esAchievementById: uniqueBy(input.achievements, a => a.achvId),
    esTaskById: uniqueBy(input.tasks, t => t.taskId),
    achvStepTasksByAchvId: groupBy(input.achvStepTasks, r => r.achvId),
    achvStepAchvByAchvId: groupBy(input.achvStepAchv, r => r.achvId),
    cdtAchvEnumById: uniqueBy(input.cdtAchvEnum, r => r.cadetAchvId),
  }
}
