/**
 * ReportData assembly: indexed reads over computed_member (plus jsonb path
 * extractions from detail) and targeted mirror-table slices for the reports
 * where v1 read raw CAPWATCH files (Training.txt, OFlight.txt,
 * ORGStatistics.txt, MbrCommittee.txt, ...). Only the slices a report's needs
 * declare are fetched, so every report stays a handful of index-hit queries.
 */

import { pool } from '../db/pool.js'
import { UNASSIGNED_ORGID } from '../ingest/orgTree.js'
import {
  loadParticipationUnitAggs,
  loadQuietCounts,
  loadQuietMembers,
} from '../api/participation.js'
import type { Role } from '../shared/contracts.js'
import { AEROSPACE_DIMENSIONS_MODULES, LEVELS, type LevelId } from '../domain/constants/index.js'
import { deriveLevelPathMap } from '../domain/senior.js'
import type { PlGroupRow, PlPathRow, PlTaskRow } from '../domain/dataset.js'
import { isModeratedTaskForLevel } from './helpers.js'
import {
  emptyReportData,
  type JsonEsQualification,
  type JsonLevelsProgress,
  type JsonOrgStatsMetrics,
  type JsonRequirementStatus,
  type JsonSeniorDuty,
  type JsonSeniorTrack,
  type OrgInfo,
  type PlConfigSlice,
  type ReportData,
  type ReportDataNeed,
  type ReportMember,
} from './types.js'

export interface ReportScopeInput {
  orgid: number
  descendants: boolean
  /** Member home-orgid scope (respects the descendants toggle). */
  scopeOrgids: number[]
  /** Full descendant set regardless of the toggle; CAC always scans it (v1 Index.html:4006). */
  cacScopeOrgids: number[]
  role: Role
  asOf: Date
}

const MEMBER_BASE_COLUMNS = [
  'capid',
  'orgid',
  'name_last',
  'name_first',
  'full_name',
  'rank',
  'member_type',
  'joined',
  'expiration',
  'rank_date',
  'dob_year',
  'age_asof_compute',
  'is_senior_scope',
  'is_cadet_scope',
  'current_level',
  'promotable_on',
  'tig_eligible_on',
  'next_achv_id',
  'next_achv_public_number',
  'tig_complete_on',
  'hfz_valid_until',
  'last_promotion_on',
  'phase',
  'honor_credit',
  'es_expiring_count',
].join(', ')

interface DbMemberRow {
  capid: number
  orgid: number
  name_last: string | null
  name_first: string | null
  full_name: string | null
  rank: string | null
  member_type: string | null
  joined: Date | null
  expiration: Date | null
  rank_date: Date | null
  dob_year: number | null
  age_asof_compute: number | null
  is_senior_scope: boolean | null
  is_cadet_scope: boolean | null
  current_level: string | null
  promotable_on: Date | null
  tig_eligible_on: Date | null
  next_achv_id: number | null
  next_achv_public_number: number | null
  tig_complete_on: Date | null
  hfz_valid_until: Date | null
  last_promotion_on: Date | null
  phase: string | null
  honor_credit: boolean | null
  es_expiring_count: number | null
  level_progress?: unknown
  senior_duties?: unknown
  senior_tracks?: unknown
  senior_current_level?: unknown
  level2_track?: unknown
  cadet_requirements?: unknown
  current_achievement_name?: unknown
  next_achievement_name?: unknown
  es_all?: unknown
}

interface MemberSelectFlags {
  levelProgress: boolean
  seniorDetail: boolean
  cadetDetail: boolean
  esAll: boolean
}

function memberSelect(flags: MemberSelectFlags): string {
  let select = MEMBER_BASE_COLUMNS
  if (flags.levelProgress) select += ', level_progress'
  if (flags.seniorDetail) {
    select +=
      ", detail->'senior'->'duties' AS senior_duties" +
      ", detail->'senior'->'tracks' AS senior_tracks" +
      ", detail->'senior'->'currentLevel' AS senior_current_level" +
      ", detail->'senior'->'level2Track' AS level2_track"
  }
  if (flags.cadetDetail) {
    select +=
      ", detail->'cadet'->'nextRequirements'->'requirements' AS cadet_requirements" +
      ", detail->'cadet'->'currentAchievementName' AS current_achievement_name" +
      ", detail->'cadet'->'nextAchievementName' AS next_achievement_name"
  }
  if (flags.esAll) select += ", detail->'esAll' AS es_all"
  return select
}

function mapMember(r: DbMemberRow, flags: MemberSelectFlags): ReportMember {
  const m: ReportMember = {
    capid: r.capid,
    orgid: r.orgid,
    nameLast: r.name_last ?? '',
    nameFirst: r.name_first ?? '',
    fullName: r.full_name ?? '',
    rank: r.rank ?? '',
    memberType: r.member_type ?? '',
    joined: r.joined,
    expiration: r.expiration,
    rankDate: r.rank_date,
    dobYear: r.dob_year,
    ageAsofCompute: r.age_asof_compute,
    isSeniorScope: r.is_senior_scope === true,
    isCadetScope: r.is_cadet_scope === true,
    currentLevel: r.current_level,
    promotableOn: r.promotable_on,
    tigEligibleOn: r.tig_eligible_on,
    nextAchvId: r.next_achv_id,
    nextAchvPublicNumber: r.next_achv_public_number,
    tigCompleteOn: r.tig_complete_on,
    hfzValidUntil: r.hfz_valid_until,
    lastPromotionOn: r.last_promotion_on,
    phase: r.phase,
    honorCredit: r.honor_credit,
    esExpiringCount: r.es_expiring_count ?? 0,
  }
  if (flags.levelProgress) {
    m.levelProgress = (r.level_progress as JsonLevelsProgress | null) ?? null
  }
  if (flags.seniorDetail) {
    m.seniorDuties = (r.senior_duties as JsonSeniorDuty[] | null) ?? null
    m.seniorTracks = (r.senior_tracks as JsonSeniorTrack[] | null) ?? null
    m.seniorCurrentLevelNum =
      typeof r.senior_current_level === 'number' ? r.senior_current_level : null
    m.level2Track = typeof r.level2_track === 'string' ? r.level2_track : null
  }
  if (flags.cadetDetail) {
    m.cadetRequirements = (r.cadet_requirements as JsonRequirementStatus[] | null) ?? null
    m.currentAchievementName =
      typeof r.current_achievement_name === 'string' ? r.current_achievement_name : null
    m.nextAchievementName =
      typeof r.next_achievement_name === 'string' ? r.next_achievement_name : null
  }
  if (flags.esAll) {
    m.esAll = (r.es_all as JsonEsQualification[] | null) ?? null
  }
  return m
}

async function loadOrgs(): Promise<Map<number, OrgInfo>> {
  const res = await pool.query<{
    orgid: number
    region: string | null
    wing: string | null
    unit: string | null
    next_level: number | null
    name: string | null
    type: string | null
    scope: string | null
  }>(
    `SELECT DISTINCT ON (orgid) orgid, region, wing, unit, next_level, name, type, scope
     FROM organizations ORDER BY orgid`,
  )
  const out = new Map<number, OrgInfo>()
  for (const r of res.rows) {
    out.set(r.orgid, {
      orgid: r.orgid,
      region: r.region ?? '',
      wing: r.wing ?? '',
      unit: r.unit ?? '',
      nextLevel: r.next_level,
      name: r.name ?? '',
      type: r.type ?? '',
      scope: r.scope ?? '',
    })
  }
  return out
}

const SCOPE_CAPIDS = '(SELECT capid FROM computed_member WHERE orgid = ANY($1::int[]))'

async function loadPlConfig(scopeOrgids: number[]): Promise<PlConfigSlice> {
  const [pathsRes, groupsRes, tasksRes, assignRes] = await Promise.all([
    pool.query<{ path_id: number; path_name: string | null }>(
      'SELECT path_id, path_name FROM pl_paths',
    ),
    pool.query<{
      group_id: number
      path_id: number
      group_name: string | null
      number_of_required_tasks: number | null
      awards_extra_credit: boolean | null
    }>(
      'SELECT group_id, path_id, group_name, number_of_required_tasks, awards_extra_credit FROM pl_groups',
    ),
    pool.query<{ task_id: number; task_name: string | null; description: string | null }>(
      'SELECT task_id, task_name, description FROM pl_tasks',
    ),
    pool.query<{ task_group_assignment_id: number; task_id: number; group_id: number }>(
      'SELECT task_group_assignment_id, task_id, group_id FROM pl_task_group_assignments',
    ),
  ])

  const paths: PlPathRow[] = pathsRes.rows.map(r => ({
    pathId: r.path_id,
    pathName: r.path_name ?? '',
  }))
  const groupsByPathId = new Map<number, PlGroupRow[]>()
  for (const r of groupsRes.rows) {
    const group: PlGroupRow = {
      groupId: r.group_id,
      pathId: r.path_id,
      groupName: r.group_name ?? '',
      numberOfRequiredTasks: r.number_of_required_tasks ?? 0,
      awardsExtraCredit: r.awards_extra_credit === true,
    }
    const arr = groupsByPathId.get(group.pathId)
    if (arr) arr.push(group)
    else groupsByPathId.set(group.pathId, [group])
  }
  const tasksById = new Map<number, PlTaskRow>()
  for (const r of tasksRes.rows) {
    tasksById.set(r.task_id, {
      taskId: r.task_id,
      taskName: r.task_name ?? '',
      description: r.description,
    })
  }
  const taskIdsByGroupId = new Map<number, Set<number>>()
  for (const r of assignRes.rows) {
    let set = taskIdsByGroupId.get(r.group_id)
    if (set === undefined) {
      set = new Set()
      taskIdsByGroupId.set(r.group_id, set)
    }
    set.add(r.task_id)
  }
  const levelPathMap = deriveLevelPathMap(paths)

  // Only moderated modules matter to the report; keep the credit query small.
  const moderatedTaskIds = new Set<number>()
  for (const def of LEVELS) {
    const pathId = levelPathMap.get(def.id as LevelId)
    if (pathId === undefined) continue
    for (const group of groupsByPathId.get(pathId) ?? []) {
      if (group.numberOfRequiredTasks === 0) continue
      for (const taskId of taskIdsByGroupId.get(group.groupId) ?? []) {
        const task = tasksById.get(taskId)
        if (task !== undefined && isModeratedTaskForLevel(def.id, task.taskName)) {
          moderatedTaskIds.add(taskId)
        }
      }
    }
  }

  const completedCapidsByTaskId = new Map<number, Set<number>>()
  if (moderatedTaskIds.size > 0) {
    // StatusID 8 = complete (v1 ServicesDataService.html task credit status).
    const creditRes = await pool.query<{ task_id: number; capid: number }>(
      `SELECT task_id, capid FROM pl_member_task_credit
       WHERE status_id = 8 AND task_id = ANY($2::int[]) AND capid IN ${SCOPE_CAPIDS}`,
      [scopeOrgids, [...moderatedTaskIds]],
    )
    for (const r of creditRes.rows) {
      let set = completedCapidsByTaskId.get(r.task_id)
      if (set === undefined) {
        set = new Set()
        completedCapidsByTaskId.set(r.task_id, set)
      }
      set.add(r.capid)
    }
  }

  return {
    paths,
    groupsByPathId,
    tasksById,
    taskIdsByGroupId,
    levelPathMap,
    completedCapidsByTaskId,
  }
}

export async function loadReportData(
  needs: readonly ReportDataNeed[],
  scope: ReportScopeInput,
): Promise<ReportData> {
  const need = new Set(needs)
  const flags: MemberSelectFlags = {
    levelProgress: need.has('memberLevelProgress'),
    seniorDetail: need.has('memberSeniorDetail'),
    cadetDetail: need.has('memberCadetDetail'),
    esAll: need.has('memberEsAll'),
  }

  const data = emptyReportData({
    asOf: scope.asOf,
    role: scope.role,
    orgid: scope.orgid,
    descendants: scope.descendants,
    scopeOrgids: new Set(scope.scopeOrgids),
  })

  const membersRes = await pool.query<DbMemberRow>(
    `SELECT ${memberSelect(flags)} FROM computed_member WHERE orgid = ANY($1::int[])`,
    [scope.scopeOrgids],
  )
  data.members = membersRes.rows.map(r => mapMember(r, flags))
  data.orgs = await loadOrgs()

  const scopeParam = [scope.scopeOrgids]

  if (need.has('memberDob') && scope.role === 'admin') {
    // DOB is admin-only in v2.0 (docs/ARCHITECTURE.md, PII posture); the
    // column is never selected for viewer sessions.
    const res = await pool.query<{ capid: number; dob: Date | null }>(
      `SELECT m.capid, m.dob FROM members m WHERE m.capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    const dobByCapid = new Map(res.rows.map(r => [r.capid, r.dob]))
    for (const m of data.members) m.dob = dobByCapid.get(m.capid) ?? null
  }

  if (need.has('training')) {
    const res = await pool.query<{ capid: number; type_crs: string | null; completed: Date | null }>(
      `SELECT capid, type_crs, completed FROM training WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.training = res.rows.map(r => ({
      capid: r.capid,
      typeCrs: r.type_crs ?? '',
      completed: r.completed,
    }))
  }

  if (need.has('duties')) {
    const res = await pool.query<{
      capid: number
      duty: string | null
      asst: boolean | null
      held_at_orgid: number | null
      source: string | null
    }>(
      `SELECT capid, duty, asst, held_at_orgid, source FROM computed_member_duty
       WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.duties = res.rows.map(r => ({
      capid: r.capid,
      duty: r.duty ?? '',
      asst: r.asst === true,
      heldAtOrgid: r.held_at_orgid ?? -1,
      source: r.source === 'cadet' ? 'cadet' : 'senior',
    }))
  }

  if (need.has('oflights')) {
    const res = await pool.query<{ capid: number; syllabus: string | null; flt_date: Date | null }>(
      `SELECT capid, syllabus, flt_date FROM o_flight WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.oflights = res.rows.map(r => ({
      capid: r.capid,
      syllabus: r.syllabus,
      fltDate: r.flt_date,
    }))
  }

  if (need.has('cadetActivities')) {
    const res = await pool.query<{
      capid: number
      type: string | null
      location: string | null
      completed: Date | null
    }>(
      `SELECT capid, type, location, completed FROM cadet_activities WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.cadetActivities = res.rows.map(r => ({
      capid: r.capid,
      type: r.type ?? '',
      location: r.location,
      completed: r.completed,
    }))
  }

  if (need.has('achv1Approvals')) {
    // v1 QCUA onboarding reads CadetAchvAprs CadetAchvID 1 Status APR with
    // DateCreated preferred over DateMod (Index.html:2943-2952).
    const res = await pool.query<{ capid: number; approved_on: Date | null }>(
      `SELECT capid, COALESCE(date_created, date_mod) AS approved_on FROM cadet_achv_aprs
       WHERE cadet_achv_id = 1 AND upper(trim(status)) = 'APR' AND capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.achv1Approvals = res.rows.map(r => ({ capid: r.capid, approvedOn: r.approved_on }))
  }

  if (need.has('cadetRanks')) {
    const res = await pool.query<{ capid: number; rank: string | null; rank_date: Date | null }>(
      `SELECT capid, rank, rank_date FROM cadet_rank WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.cadetRanks = res.rows.map(r => ({
      capid: r.capid,
      rank: r.rank ?? '',
      rankDate: r.rank_date,
    }))
  }

  if (need.has('seniorLevels')) {
    const res = await pool.query<{ capid: number; lvl: string | null; completed: Date | null }>(
      `SELECT capid, lvl, completed FROM senior_level WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.seniorLevels = res.rows.map(r => ({
      capid: r.capid,
      lvl: r.lvl ?? '',
      completed: r.completed,
    }))
  }

  if (need.has('seniorAwards')) {
    const res = await pool.query<{ capid: number; award: string | null; completed: Date | null }>(
      `SELECT capid, award, completed FROM senior_awards WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.seniorAwards = res.rows.map(r => ({
      capid: r.capid,
      award: r.award ?? '',
      completed: r.completed,
    }))
  }

  if (need.has('voluInstructors')) {
    const res = await pool.query<{ capid: number; path_name: string | null }>(
      `SELECT capid, path_name FROM pl_vol_u_instructors WHERE capid IN ${SCOPE_CAPIDS}`,
      scopeParam,
    )
    data.voluInstructors = res.rows.map(r => ({ capid: r.capid, pathName: r.path_name }))
  }

  if (need.has('orgStats')) {
    const scopeKind = scope.descendants ? 'subtree' : 'self'
    const res = await pool.query<{ orgid: number; scope: string; org_stats: unknown }>(
      `SELECT orgid, scope, org_stats FROM computed_org
       WHERE (orgid = $1 AND scope = $2) OR (scope = 'self' AND orgid = ANY($3::int[]))`,
      [scope.orgid, scopeKind, scope.scopeOrgids],
    )
    const perUnit = new Map<number, JsonOrgStatsMetrics | null>()
    let scoped: JsonOrgStatsMetrics | null = null
    for (const r of res.rows) {
      const metrics = (r.org_stats as JsonOrgStatsMetrics | null) ?? null
      if (r.orgid === scope.orgid && r.scope === scopeKind) scoped = metrics
      if (r.scope === 'self') perUnit.set(r.orgid, metrics)
    }
    data.orgStats = { scoped, perUnit }
  }

  if (need.has('plConfig')) {
    data.plConfig = await loadPlConfig(scope.scopeOrgids)
  }

  if (need.has('participation')) {
    // Loaders live in api/participation.ts (shared with the participation
    // endpoint). Named quiet members load only at single-unit scope (D9).
    const realScope = scope.scopeOrgids.filter(id => id !== UNASSIGNED_ORGID)
    const singleUnit = realScope.length === 1
    const [unitAggs, quietCounts, quietNamed] = await Promise.all([
      loadParticipationUnitAggs(realScope, scope.asOf),
      loadQuietCounts(realScope, scope.asOf),
      singleUnit ? loadQuietMembers(realScope, scope.asOf) : Promise.resolve(null),
    ])
    const quietByOrgid = new Map(quietCounts.map(r => [r.orgid, r.quietCount]))
    data.participation = {
      units: unitAggs.map(u => ({
        orgid: u.orgid,
        meetings90: u.meetings90,
        attendeeRows90: u.attendeeRows90,
        presentRows90: u.presentRows90,
        guests90: u.guests90,
        quietCount: quietByOrgid.get(u.orgid) ?? 0,
      })),
      quietMembers: quietNamed,
    }
  }

  if (need.has('aerospace')) {
    const moduleTaskIds = AEROSPACE_DIMENSIONS_MODULES.map(m => m.taskId)
    const moduleAchvIds = AEROSPACE_DIMENSIONS_MODULES.map(m => m.achievementId)
    const [achvRes, taskRes] = await Promise.all([
      pool.query<{
        capid: number
        cadet_achv_id: number
        ae_score: string | null
        ae_date_p: Date | null
      }>(
        `SELECT capid, cadet_achv_id, ae_score, ae_date_p FROM cadet_achv
         WHERE cadet_achv_id = ANY($2::int[]) AND capid IN ${SCOPE_CAPIDS}`,
        [scope.scopeOrgids, moduleAchvIds],
      ),
      pool.query<{ capid: number; task_id: number; completed: Date | null }>(
        `SELECT capid, task_id, completed FROM pl_member_task_credit
         WHERE status_id = 8 AND task_id = ANY($2::int[]) AND capid IN ${SCOPE_CAPIDS}`,
        [scope.scopeOrgids, moduleTaskIds],
      ),
    ])
    data.cadetAchvAe = achvRes.rows.map(r => ({
      capid: r.capid,
      cadetAchvId: r.cadet_achv_id,
      aeScore: r.ae_score,
      aeDateP: r.ae_date_p,
    }))
    data.aeTaskCompletions = taskRes.rows.map(r => ({
      capid: r.capid,
      taskId: r.task_id,
      completed: r.completed,
    }))
  }

  if (need.has('cac')) {
    const cacParam = [scope.cacScopeOrgids]
    const [dutyRes, committeeRes] = await Promise.all([
      pool.query<{ capid: number; duty: string | null; orgid: number | null }>(
        `SELECT capid, duty, orgid FROM cadet_duty_positions
         WHERE orgid = ANY($1::int[]) AND upper(duty) LIKE '%CAC%'`,
        cacParam,
      ),
      pool.query<{
        capid: number
        committee: string | null
        chair: string | null
        orgid: number | null
      }>(
        `SELECT capid, committee, chair, orgid FROM mbr_committee
         WHERE orgid = ANY($1::int[]) AND upper(committee) LIKE '%CADET ADVISORY COUNCIL%'`,
        cacParam,
      ),
    ])
    data.cacDuties = dutyRes.rows
      .filter(r => r.orgid !== null)
      .map(r => ({ capid: r.capid, duty: r.duty ?? '', orgid: r.orgid as number }))
    data.committees = committeeRes.rows.map(r => ({
      capid: r.capid,
      committee: r.committee ?? '',
      chair: r.chair,
      orgid: r.orgid,
    }))

    const scopedCapids = new Set(data.members.map(m => m.capid))
    const cacCapids = new Set<number>()
    for (const d of data.cacDuties) cacCapids.add(d.capid)
    for (const c of data.committees) cacCapids.add(c.capid)
    const missing = [...cacCapids].filter(capid => !scopedCapids.has(capid))
    if (missing.length > 0) {
      const res = await pool.query<DbMemberRow>(
        `SELECT ${MEMBER_BASE_COLUMNS} FROM computed_member WHERE capid = ANY($1::int[])`,
        [missing],
      )
      const noFlags: MemberSelectFlags = {
        levelProgress: false,
        seniorDetail: false,
        cadetDetail: false,
        esAll: false,
      }
      data.extraMembers = res.rows.map(r => mapMember(r, noFlags))
    }

    if (cacCapids.size > 0) {
      // Primary EMAIL contact first, any EMAIL as fallback (v1 Index.html:740-757).
      const res = await pool.query<{ capid: number; priority: string | null; contact: string | null }>(
        `SELECT capid, priority, contact FROM mbr_contact
         WHERE upper(trim(type)) = 'EMAIL' AND capid = ANY($1::int[])`,
        [[...cacCapids]],
      )
      const emails = new Map<number, { primary: string | null; any: string | null }>()
      for (const r of res.rows) {
        if (r.contact === null || r.contact === '') continue
        let entry = emails.get(r.capid)
        if (entry === undefined) {
          entry = { primary: null, any: null }
          emails.set(r.capid, entry)
        }
        if ((r.priority ?? '').toUpperCase().trim() === 'PRIMARY' && entry.primary === null) {
          entry.primary = r.contact
        }
        if (entry.any === null) entry.any = r.contact
      }
      for (const [capid, entry] of emails) {
        const email = entry.primary ?? entry.any
        if (email !== null) data.emails.set(capid, email)
      }
    }
  }

  return data
}
