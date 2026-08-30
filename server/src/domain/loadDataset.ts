/**
 * Reads the CAPWATCH mirror tables into DatasetInput rows for the compute
 * step. Called with the staging suffix during ingest (so compute sees the
 * dataset that is about to become live) or '' for the live tables.
 *
 * Suffix resolution: a table absent from the current zip has no staged copy;
 * its previous live rows survive the swap, so the staged table is read when it
 * exists and the live table otherwise. That makes the loaded input exactly the
 * post-swap dataset.
 *
 * Scoping (docs/ARCHITECTURE.md, Org tree anchoring): the app_settings
 * member-type include list filters members here; excluded units are NOT
 * dropped (v1 excluded them from the unit picker, not from existence), they
 * are surfaced as excludedOrgids for the API's tree/picker.
 */

import type pg from 'pg'
import type {
  AchvStepAchvRow,
  AchvStepTaskRow,
  CadetAchvAprRow,
  CadetAchvFullReportRow,
  CadetAchvRow,
  CadetActivityRow,
  CadetAwardRow,
  CadetHfzRow,
  CadetPhaseRow,
  CadetRankRow,
  CdtAchvEnumRow,
  DatasetInput,
  DutyPositionRow,
  EsAchievementRow,
  EsTaskRow,
  MbrAchievementRow,
  MbrCommitteeRow,
  MbrContactRow,
  MbrTaskRow,
  MemberRow,
  OFlightRow,
  OrgStatisticRow,
  OrganizationRow,
  PlGroupRow,
  PlMemberPathCreditRow,
  PlMemberTaskCreditRow,
  PlPathRow,
  PlTaskGroupAssignmentRow,
  PlTaskRow,
  PlVolUInstructorRow,
  SeniorAwardRow,
  SeniorLevelRow,
  SpecTrackRow,
  TrainingRow,
} from './dataset.js'

export const DEFAULT_MEMBER_TYPES = ['CADET', 'SENIOR', 'LIFE', 'FIFTY YEAR'] as const
export const DEFAULT_EXCLUDED_UNITS = ['000', '999'] as const

export interface DatasetSettings {
  /** app_settings 'org.member_types': member types kept in the dataset, uppercased. */
  memberTypes: string[]
  /** app_settings 'org.excluded_units': unit numbers hidden from the tree/picker. */
  excludedUnits: string[]
}

export interface LoadedDataset {
  input: DatasetInput
  settings: DatasetSettings
  /**
   * Orgids whose unit number is in excludedUnits. Their members stay in
   * computed_member and their computed_org rows exist; the API excludes these
   * orgs from /api/orgs and the picker (v1 parity: picker-only exclusion).
   */
  excludedOrgids: Set<number>
  /**
   * Home orgids of EVERY member row, before the member-type include list is
   * applied. The compute step derives the org tree anchor from these so it
   * matches ingest/run.ts deriveOrgTree, which anchors on all parsed member
   * home orgids; a narrowed include list must not move the anchor.
   */
  allMemberHomeOrgids: number[]
}

type Row = Record<string, unknown>

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const sn = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const nn = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const dt = (v: unknown): Date | null => (v instanceof Date ? v : null)
const bl = (v: unknown): boolean => v === true
const bln = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const res = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [table])
  return res.rows[0]?.present === true
}

/** Staged rows when the suffixed table exists, else live rows, else empty. */
async function readTable(client: pg.PoolClient, table: string, suffix: string): Promise<Row[]> {
  if (suffix !== '') {
    const staged = `${table}${suffix}`
    if (await tableExists(client, staged)) {
      return (await client.query(`SELECT * FROM ${quoteIdent(staged)}`)).rows as Row[]
    }
  }
  if (!(await tableExists(client, table))) return []
  return (await client.query(`SELECT * FROM ${quoteIdent(table)}`)).rows as Row[]
}

function mapRows<T>(rows: Row[], map: (r: Row) => T | null): T[] {
  const out: T[] = []
  for (const r of rows) {
    const mapped = map(r)
    if (mapped !== null) out.push(mapped)
  }
  return out
}

function mapMember(r: Row): MemberRow | null {
  const capid = nn(r.capid)
  const orgid = nn(r.orgid)
  if (capid === null || orgid === null) return null
  return {
    capid,
    nameLast: s(r.name_last),
    nameFirst: s(r.name_first),
    nameMiddle: sn(r.name_middle),
    nameSuffix: sn(r.name_suffix),
    dob: dt(r.dob),
    orgid,
    wing: s(r.wing),
    unit: s(r.unit),
    rank: s(r.rank),
    joined: dt(r.joined),
    expiration: dt(r.expiration),
    orgJoined: dt(r.org_joined),
    dateMod: dt(r.date_mod),
    type: s(r.type),
    rankDate: dt(r.rank_date),
    region: s(r.region),
    mbrStatus: s(r.mbr_status),
  }
}

function mapOrganization(r: Row): OrganizationRow | null {
  const orgid = nn(r.orgid)
  if (orgid === null) return null
  return {
    orgid,
    region: s(r.region),
    wing: s(r.wing),
    unit: s(r.unit),
    nextLevel: nn(r.next_level),
    name: s(r.name),
    type: s(r.type),
    dateChartered: dt(r.date_chartered),
    status: s(r.status),
    scope: s(r.scope),
  }
}

function mapContact(r: Row): MbrContactRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    capid,
    type: s(r.type),
    priority: s(r.priority),
    contact: s(r.contact),
    doNotContact: bl(r.do_not_contact),
  }
}

function mapDuty(r: Row): DutyPositionRow | null {
  const capid = nn(r.capid)
  const orgid = nn(r.orgid)
  if (capid === null || orgid === null) return null
  return {
    capid,
    duty: s(r.duty),
    functArea: sn(r.funct_area),
    lvl: sn(r.lvl),
    asst: bl(r.asst),
    dateMod: dt(r.date_mod),
    orgid,
  }
}

function mapMbrAchievement(r: Row): MbrAchievementRow | null {
  const capid = nn(r.capid)
  const achvId = nn(r.achv_id)
  if (capid === null || achvId === null) return null
  return {
    capid,
    achvId,
    status: s(r.status),
    originallyAccomplished: dt(r.originally_accomplished),
    completed: dt(r.completed),
    expiration: dt(r.expiration),
    authDate: dt(r.auth_date),
    dateMod: dt(r.date_mod),
    orgid: nn(r.orgid),
  }
}

function mapMbrTask(r: Row): MbrTaskRow | null {
  const capid = nn(r.capid)
  const taskId = nn(r.task_id)
  if (capid === null || taskId === null) return null
  return {
    capid,
    taskId,
    status: sn(r.status),
    completed: dt(r.completed),
    expiration: dt(r.expiration),
    orgid: nn(r.orgid),
  }
}

function mapCadetAchv(r: Row): CadetAchvRow | null {
  const capid = nn(r.capid)
  const cadetAchvId = nn(r.cadet_achv_id)
  if (capid === null || cadetAchvId === null) return null
  return {
    capid,
    cadetAchvId,
    phyFitTest: dt(r.phy_fit_test),
    leadLabDateP: dt(r.lead_lab_date_p),
    leadLabScore: sn(r.lead_lab_score),
    aeDateP: dt(r.ae_date_p),
    aeScore: sn(r.ae_score),
    aeMod: sn(r.ae_mod),
    aeTest: sn(r.ae_test),
    moralLDateP: dt(r.moral_l_date_p),
    activePart: sn(r.active_part),
    otherReq: sn(r.other_req),
    sdaReport: sn(r.sda_report),
    dateMod: dt(r.date_mod),
    drillDate: dt(r.drill_date),
    drillScore: sn(r.drill_score),
    leadCurr: sn(r.lead_curr),
    cadetOath: sn(r.cadet_oath),
    aeBookValue: sn(r.ae_book_value),
    mileRun: sn(r.mile_run),
    shuttleRun: sn(r.shuttle_run),
    sitAndReach: sn(r.sit_and_reach),
    pushUps: sn(r.push_ups),
    curlUps: sn(r.curl_ups),
    hfzId: nn(r.hfzid),
    staffServiceDate: dt(r.staff_service_date),
    technicalWritingAssignment: sn(r.technical_writing_assignment),
    technicalWritingAssignmentDate: dt(r.technical_writing_assignment_date),
    oralPresentationDate: dt(r.oral_presentation_date),
    speechDate: dt(r.speech_date),
    leadershipEssayDate: dt(r.leadership_essay_date),
  }
}

function mapCadetAchvApr(r: Row): CadetAchvAprRow | null {
  const capid = nn(r.capid)
  const cadetAchvId = nn(r.cadet_achv_id)
  if (capid === null || cadetAchvId === null) return null
  return {
    capid,
    cadetAchvId,
    status: s(r.status),
    awardNo: sn(r.award_no),
    dateMod: dt(r.date_mod),
    dateCreated: dt(r.date_created),
  }
}

function mapCadetAchvFull(r: Row): CadetAchvFullReportRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, achvName: s(r.achv_name), aprDate: dt(r.apr_date) }
}

function mapCadetActivity(r: Row): CadetActivityRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, type: s(r.type), location: sn(r.location), completed: dt(r.completed) }
}

function mapCadetHfz(r: Row): CadetHfzRow | null {
  const capid = nn(r.capid)
  const hfzId = nn(r.hfzid)
  if (capid === null || hfzId === null) return null
  return {
    hfzId,
    capid,
    dateTaken: dt(r.date_taken),
    orgid: nn(r.orgid),
    isPassed: bl(r.is_passed),
    pacerRun: sn(r.pacer_run),
    pacerRunPassed: bln(r.pacer_run_passed),
    mileRun: sn(r.mile_run),
    mileRunPassed: bln(r.mile_run_passed),
    curlUp: sn(r.curl_up),
    curlUpPassed: bln(r.curl_up_passed),
    pushUp: sn(r.push_up),
    pushUpPassed: bln(r.push_up_passed),
    sitAndReach: sn(r.sit_and_reach),
    sitAndReachPassed: bln(r.sit_and_reach_passed),
  }
}

function mapCadetRank(r: Row): CadetRankRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, rank: s(r.rank), rankDate: dt(r.rank_date), dateMod: dt(r.date_mod) }
}

function mapCadetPhase(r: Row): CadetPhaseRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, type: s(r.type), completed: dt(r.completed) }
}

function mapAward(r: Row): CadetAwardRow | SeniorAwardRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, award: s(r.award), awardNo: sn(r.award_no), completed: dt(r.completed) }
}

function mapSeniorLevel(r: Row): SeniorLevelRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return { capid, lvl: s(r.lvl), completed: dt(r.completed) }
}

function mapSpecTrack(r: Row): SpecTrackRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    capid,
    track: s(r.track),
    trackLevel: s(r.track_level),
    howComplete: sn(r.how_complete),
    completed: dt(r.completed),
    dateMod: dt(r.date_mod),
  }
}

function mapTraining(r: Row): TrainingRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    capid,
    typeCrs: s(r.type_crs),
    howComplete: sn(r.how_complete),
    crsId: sn(r.crs_id),
    completed: dt(r.completed),
  }
}

function mapOFlight(r: Row): OFlightRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    capid,
    wing: sn(r.wing),
    unit: sn(r.unit),
    syllabus: sn(r.syllabus),
    type: sn(r.type),
    fltDate: dt(r.flt_date),
  }
}

function mapCommittee(r: Row): MbrCommitteeRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    capid,
    committee: s(r.committee),
    chair: sn(r.chair),
    orgid: nn(r.orgid),
    dateAssigned: dt(r.date_assigned),
  }
}

function mapOrgStatistic(r: Row): OrgStatisticRow | null {
  const orgid = nn(r.orgid)
  if (orgid === null) return null
  return {
    orgid,
    region: s(r.region),
    wing: s(r.wing),
    unit: s(r.unit),
    mbrType: s(r.mbr_type),
    cntType: s(r.cnt_type),
    quantity: nn(r.quantity) ?? 0,
    cntDate: dt(r.cnt_date),
  }
}

function mapPlPath(r: Row): PlPathRow | null {
  const pathId = nn(r.path_id)
  if (pathId === null) return null
  return { pathId, pathName: s(r.path_name) }
}

function mapPlGroup(r: Row): PlGroupRow | null {
  const groupId = nn(r.group_id)
  const pathId = nn(r.path_id)
  if (groupId === null || pathId === null) return null
  return {
    groupId,
    pathId,
    groupName: s(r.group_name),
    numberOfRequiredTasks: nn(r.number_of_required_tasks) ?? 0,
    awardsExtraCredit: bl(r.awards_extra_credit),
  }
}

function mapPlTask(r: Row): PlTaskRow | null {
  const taskId = nn(r.task_id)
  if (taskId === null) return null
  return { taskId, taskName: s(r.task_name), description: sn(r.description) }
}

function mapPlTga(r: Row): PlTaskGroupAssignmentRow | null {
  const taskGroupAssignmentId = nn(r.task_group_assignment_id)
  const taskId = nn(r.task_id)
  const groupId = nn(r.group_id)
  if (taskGroupAssignmentId === null || taskId === null || groupId === null) return null
  return { taskGroupAssignmentId, taskId, groupId }
}

function mapPlPathCredit(r: Row): PlMemberPathCreditRow | null {
  const memberPathCreditId = nn(r.member_path_credit_id)
  const pathId = nn(r.path_id)
  const capid = nn(r.capid)
  const statusId = nn(r.status_id)
  if (memberPathCreditId === null || pathId === null || capid === null || statusId === null) {
    return null
  }
  return {
    memberPathCreditId,
    pathId,
    capid,
    statusId,
    completed: dt(r.completed),
    expiration: dt(r.expiration),
    extraCreditEarned: sn(r.extra_credit_earned),
  }
}

function mapPlTaskCredit(r: Row): PlMemberTaskCreditRow | null {
  const memberTaskCreditId = nn(r.member_task_credit_id)
  const taskId = nn(r.task_id)
  const capid = nn(r.capid)
  const statusId = nn(r.status_id)
  if (memberTaskCreditId === null || taskId === null || capid === null || statusId === null) {
    return null
  }
  return {
    memberTaskCreditId,
    taskId,
    capid,
    statusId,
    completed: dt(r.completed),
    expiration: dt(r.expiration),
  }
}

function mapVolU(r: Row): PlVolUInstructorRow | null {
  const capid = nn(r.capid)
  if (capid === null) return null
  return {
    fullName: s(r.full_name),
    capid,
    region: sn(r.region),
    wing: sn(r.wing),
    unit: sn(r.unit),
    instructorType: sn(r.instructor_type),
    category: sn(r.category),
    pathName: sn(r.path_name),
  }
}

function mapEsAchievement(r: Row): EsAchievementRow | null {
  const achvId = nn(r.achv_id)
  if (achvId === null) return null
  return { achvId, achv: s(r.achv), functionalArea: sn(r.functional_area) }
}

function mapEsTask(r: Row): EsTaskRow | null {
  const taskId = nn(r.task_id)
  if (taskId === null) return null
  return { taskId, taskName: s(r.task_name), functionalArea: sn(r.functional_area) }
}

function mapAchvStepTask(r: Row): AchvStepTaskRow | null {
  const achvStepTaskId = nn(r.achv_step_task_id)
  const achvId = nn(r.achv_id)
  const stepId = nn(r.step_id)
  const taskId = nn(r.task_id)
  if (achvStepTaskId === null || achvId === null || stepId === null || taskId === null) return null
  return { achvStepTaskId, achvId, stepId, taskId }
}

function mapAchvStepAchv(r: Row): AchvStepAchvRow | null {
  const achvStepTaskId = nn(r.achv_step_task_id)
  const achvId = nn(r.achv_id)
  const stepId = nn(r.step_id)
  const origAchvId = nn(r.orig_achv_id)
  if (achvStepTaskId === null || achvId === null || stepId === null || origAchvId === null) {
    return null
  }
  return { achvStepTaskId, achvId, stepId, origAchvId }
}

function mapCdtAchvEnum(r: Row): CdtAchvEnumRow | null {
  const cadetAchvId = nn(r.cadet_achv_id)
  if (cadetAchvId === null) return null
  return { cadetAchvId, achvName: s(r.achv_name), curAwdNo: sn(r.cur_awd_no), rank: sn(r.rank) }
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string') out.push(v)
  }
  return out
}

/** app_settings is derived config, never staged; always read live. */
async function readSettings(client: pg.PoolClient): Promise<DatasetSettings> {
  let memberTypes: string[] = [...DEFAULT_MEMBER_TYPES]
  let excludedUnits: string[] = [...DEFAULT_EXCLUDED_UNITS]
  if (await tableExists(client, 'app_settings')) {
    const res = await client.query(
      `SELECT key, value FROM app_settings WHERE key IN ('org.member_types', 'org.excluded_units')`,
    )
    for (const row of res.rows as { key: string; value: unknown }[]) {
      const arr = stringArray(row.value)
      if (arr === null) continue
      if (row.key === 'org.member_types') memberTypes = arr
      if (row.key === 'org.excluded_units') excludedUnits = arr
    }
  }
  return {
    memberTypes: memberTypes.map(t => t.trim().toUpperCase()),
    excludedUnits: excludedUnits.map(u => u.trim()),
  }
}

/** Unit numbers compare zero-stripped then 3-padded, v1 parity (ServicesDataService.html buildUnitName). */
function normalizeUnit(unit: string): string {
  const stripped = unit.trim().replace(/^0+/, '')
  return (stripped !== '' ? stripped : '0').padStart(3, '0')
}

export async function loadDatasetInput(
  client: pg.PoolClient,
  suffix: string,
): Promise<LoadedDataset> {
  const settings = await readSettings(client)
  const includeTypes = new Set(settings.memberTypes)

  const read = (table: string) => readTable(client, table, suffix)

  // Anchor input must be the UNFILTERED member home orgids, mirroring
  // ingest/run.ts deriveOrgTree (every numeric members.orgid, no member-type
  // filter); otherwise a narrowed include list moves compute's LCA away from
  // the closure the ingest stages.
  const memberRows = await read('members')
  const allMemberHomeOrgids: number[] = []
  for (const r of memberRows) {
    const orgid = nn(r.orgid)
    if (orgid !== null) allMemberHomeOrgids.push(orgid)
  }

  const input: DatasetInput = {
    members: mapRows(memberRows, mapMember).filter(m =>
      includeTypes.has(m.type.trim().toUpperCase()),
    ),
    organizations: mapRows(await read('organizations'), mapOrganization),
    mbrContact: mapRows(await read('mbr_contact'), mapContact),
    dutyPositions: mapRows(await read('duty_positions'), mapDuty),
    cadetDutyPositions: mapRows(await read('cadet_duty_positions'), mapDuty),
    mbrAchievements: mapRows(await read('mbr_achievements'), mapMbrAchievement),
    mbrTasks: mapRows(await read('mbr_tasks'), mapMbrTask),
    cadetAchv: mapRows(await read('cadet_achv'), mapCadetAchv),
    cadetAchvAprs: mapRows(await read('cadet_achv_aprs'), mapCadetAchvApr),
    cadetAchvFullReport: mapRows(await read('cadet_achv_full_report'), mapCadetAchvFull),
    cadetActivities: mapRows(await read('cadet_activities'), mapCadetActivity),
    cadetHfz: mapRows(await read('cadet_hfz'), mapCadetHfz),
    cadetRank: mapRows(await read('cadet_rank'), mapCadetRank),
    cadetPhase: mapRows(await read('cadet_phase'), mapCadetPhase),
    cadetAwards: mapRows(await read('cadet_awards'), mapAward),
    seniorLevel: mapRows(await read('senior_level'), mapSeniorLevel),
    seniorAwards: mapRows(await read('senior_awards'), mapAward),
    specTrack: mapRows(await read('spec_track'), mapSpecTrack),
    training: mapRows(await read('training'), mapTraining),
    oFlight: mapRows(await read('o_flight'), mapOFlight),
    mbrCommittee: mapRows(await read('mbr_committee'), mapCommittee),
    orgStatistics: mapRows(await read('org_statistics'), mapOrgStatistic),
    plPaths: mapRows(await read('pl_paths'), mapPlPath),
    plGroups: mapRows(await read('pl_groups'), mapPlGroup),
    plTasks: mapRows(await read('pl_tasks'), mapPlTask),
    plTaskGroupAssignments: mapRows(await read('pl_task_group_assignments'), mapPlTga),
    plMemberPathCredit: mapRows(await read('pl_member_path_credit'), mapPlPathCredit),
    plMemberTaskCredit: mapRows(await read('pl_member_task_credit'), mapPlTaskCredit),
    plVolUInstructors: mapRows(await read('pl_vol_u_instructors'), mapVolU),
    achievements: mapRows(await read('achievements'), mapEsAchievement),
    tasks: mapRows(await read('tasks'), mapEsTask),
    achvStepTasks: mapRows(await read('achv_step_tasks'), mapAchvStepTask),
    achvStepAchv: mapRows(await read('achv_step_achv'), mapAchvStepAchv),
    cdtAchvEnum: mapRows(await read('cdt_achv_enum'), mapCdtAchvEnum),
  }

  const excludedNormalized = new Set(settings.excludedUnits.map(normalizeUnit))
  const excludedOrgids = new Set<number>()
  for (const org of input.organizations) {
    if (excludedNormalized.has(normalizeUnit(org.unit))) excludedOrgids.add(org.orgid)
  }

  return { input, settings, excludedOrgids, allMemberHomeOrgids }
}
