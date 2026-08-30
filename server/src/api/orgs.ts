/**
 * Org-scoped read endpoints: the anchor-subtree tree, the Unit Overview
 * payload with its v1 view modes, the ES analysis and org chart jsonb, and the
 * optional Google adoption sideload view.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import type {
  AdoptionResponse,
  AdoptionUnitRow,
  AdoptionUserRow,
  EsAnalysisResponse,
  OrgChartResponse,
  OrgsResponse,
  OverviewResponse,
  ServedEsAnalysis,
  UnitComparisonRow,
} from '../shared/contracts.js'
import type { Jsonified } from '../domain/computedTypes.js'
import type { UnitEsAnalysis } from '../domain/esUnit.js'
import {
  loadClosure,
  loadComputedOrg,
  loadComputedOrgSelfRows,
  loadMemberCounts,
  loadOrgInfo,
  loadOrgSettings,
  orgSummaryOf,
} from './scope.js'
import {
  meetingLineOf,
  strengthDeltaOf,
  strengthSeriesOf,
  type OrgMeetingSourceRow,
} from './findings.js'
import {
  adoptionUnitKey,
  anchorOrgidOf,
  buildOrgTree,
  comparisonRowOf,
  isCommandHqType,
  isoDate,
  normalizeUnit,
  parseBoolParam,
  parseIntParam,
  resolveScopeOrgids,
  unitLabel,
  viewModeFor,
  UNASSIGNED_ORGID,
  type ClosurePair,
} from './util.js'

export interface OrgScopeContext {
  orgid: number
  descendants: boolean
  closure: ClosurePair[]
  anchorOrgid: number
  /** Member-scope orgids (includes -1 where the closure carries it). */
  scopeOrgids: number[]
}

/**
 * Shared scope resolution for every /api/orgs/:orgid/* endpoint. Replies with
 * the appropriate error (and returns null) for a bad orgid, an empty dataset,
 * or an orgid outside the anchor subtree.
 */
export async function resolveOrgScope(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<OrgScopeContext | null> {
  const params = req.params as Record<string, unknown>
  const query = req.query as Record<string, unknown>
  const orgid = parseIntParam(params['orgid'])
  if (orgid === null) {
    reply.code(400).send({ error: 'orgid must be an integer' })
    return null
  }
  const descendants = parseBoolParam(query['descendants'])
  const closure = await loadClosure()
  const anchorOrgid = anchorOrgidOf(closure)
  if (anchorOrgid === null) {
    reply.code(404).send({ error: 'no dataset ingested yet' })
    return null
  }
  const scopeOrgids = resolveScopeOrgids(closure, orgid, descendants)
  if (scopeOrgids === null) {
    reply.code(404).send({ error: `org ${orgid} is not in the anchor subtree` })
    return null
  }
  return { orgid, descendants, closure, anchorOrgid, scopeOrgids }
}

/**
 * D9 name gate over the computed es jsonb. Member names appear in the served
 * analysis ONLY at a single operational unit's self scope (that view IS the
 * drill-down); when `keepNames` is false (descendants=true, or the org is a
 * command HQ type) every name field is stripped before serialization: SPOF
 * entries lose `member`, the SPOF recommendation sentence loses the embedded
 * name, and the other name-carrying lists (evaluators.available,
 * teams.*.qualifiedMembers, qualifications.expiringWithin90Days / missingGES,
 * pipeline entries) serve '' so the counts and positions survive unchanged.
 */
export function sanitizeEsForScope(
  es: Jsonified<UnitEsAnalysis>,
  keepNames: boolean,
): ServedEsAnalysis {
  if (keepNames) return es
  const blankNames = <T extends { name: string }>(list: readonly T[]): T[] =>
    list.map(entry => ({ ...entry, name: '' }))
  const memberNames = es.risks.singlePointsOfFailure
    .map(spof => spof.member)
    .filter(name => name !== '')
  const scrub = (text: string): string =>
    memberNames.reduce(
      (out, name) => out.split(`${name} is single point of failure`).join('single point of failure'),
      text,
    )
  return {
    ...es,
    teams: {
      fieldOps: {
        ...es.teams.fieldOps,
        qualifiedMembers: blankNames(es.teams.fieldOps.qualifiedMembers),
      },
      aircrew: {
        ...es.teams.aircrew,
        qualifiedMembers: blankNames(es.teams.aircrew.qualifiedMembers),
      },
      suas: { ...es.teams.suas, qualifiedMembers: blankNames(es.teams.suas.qualifiedMembers) },
      missionBase: {
        ...es.teams.missionBase,
        qualifiedMembers: blankNames(es.teams.missionBase.qualifiedMembers),
      },
      command: {
        ...es.teams.command,
        qualifiedMembers: blankNames(es.teams.command.qualifiedMembers),
      },
    },
    qualifications: {
      ...es.qualifications,
      expiringWithin90Days: blankNames(es.qualifications.expiringWithin90Days),
      missingGES: blankNames(es.qualifications.missingGES),
    },
    evaluators: {
      ...es.evaluators,
      available: blankNames(es.evaluators.available),
    },
    pipeline: {
      nearQualification: blankNames(es.pipeline.nearQualification),
      activeTraining: blankNames(es.pipeline.activeTraining),
    },
    risks: {
      ...es.risks,
      singlePointsOfFailure: es.risks.singlePointsOfFailure.map(
        ({ member: _member, ...rest }) => rest,
      ),
      recommendations: es.risks.recommendations.map(rec => ({
        ...rec,
        recommendation: scrub(rec.recommendation),
      })),
    },
  }
}

/** The name gate: names survive only at self scope on a non-HQ (operational) org. */
export function keepEsNamesFor(orgType: string, descendants: boolean): boolean {
  return !descendants && !isCommandHqType(orgType)
}

async function handleOrgs(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const closure = await loadClosure()
  const anchorOrgid = anchorOrgidOf(closure)
  if (anchorOrgid === null) {
    reply.code(404).send({ error: 'no dataset ingested yet' })
    return
  }
  const parents = new Map<number, number>()
  const subtree: number[] = []
  for (const row of closure) {
    if (row.depth === 1) parents.set(row.descendant, row.ancestor)
    if (row.depth === 0 && row.descendant !== UNASSIGNED_ORGID) subtree.push(row.descendant)
  }
  const [orgs, counts, settings] = await Promise.all([
    loadOrgInfo(subtree),
    loadMemberCounts(),
    loadOrgSettings(),
  ])
  const tree = buildOrgTree({
    anchorOrgid,
    parents,
    orgs,
    counts,
    excludedUnits: settings.excludedUnits,
  })
  const body: OrgsResponse = { anchorOrgid, tree }
  reply.send(body)
}

interface DbOrgMeetingRow {
  meet_day: string | null
  meet_time: string | null
  descr: string | null
  activity_date: Date | null
}

/** OrgMeetings rows for the requested org itself (masthead line, never aggregated). */
async function loadMeetingRows(orgid: number): Promise<OrgMeetingSourceRow[]> {
  const res = await pool.query<DbOrgMeetingRow>(
    'SELECT meet_day, meet_time, descr, activity_date FROM org_meetings WHERE orgid = $1',
    [orgid],
  )
  return res.rows.map(r => ({
    meetDay: r.meet_day,
    meetTime: r.meet_time,
    descr: r.descr,
    activityDate: isoDate(r.activity_date),
  }))
}

async function handleOverview(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const scope = ctx.descendants ? 'subtree' : 'self'
  const computed = await loadComputedOrg(ctx.orgid, scope)
  if (computed === null) {
    reply.code(404).send({ error: `no computed data for org ${ctx.orgid}` })
    return
  }

  const realScopeOrgids = ctx.scopeOrgids.filter(id => id !== UNASSIGNED_ORGID)
  const [info, settings, meetingRows] = await Promise.all([
    loadOrgInfo(realScopeOrgids),
    loadOrgSettings(),
    loadMeetingRows(ctx.orgid),
  ])
  const excluded = new Set(settings.excludedUnits.map(normalizeUnit))
  const includedOrgids = realScopeOrgids.filter(id => {
    if (id === ctx.orgid) return true
    const unit = info.get(id)?.unit ?? ''
    return !excluded.has(normalizeUnit(unit))
  })

  const org = orgSummaryOf(ctx.orgid, info.get(ctx.orgid))
  const viewMode = viewModeFor(org.type, ctx.descendants)

  let comparison: UnitComparisonRow[] | null = null
  if (viewMode === 'aggregate') {
    // Mode C compares subordinate operational units only: HQ types and
    // excluded units are dropped (v1 AppUnitOverview.html:1852-1866).
    const operational = includedOrgids.filter(id => {
      if (id === ctx.orgid) return false
      return !isCommandHqType(info.get(id)?.type ?? '')
    })
    const selfRows = await loadComputedOrgSelfRows(operational)
    comparison = selfRows
      .map(row => {
        const rowInfo = info.get(row.orgid)
        return comparisonRowOf({
          orgid: row.orgid,
          name: rowInfo?.name ?? `Org ${row.orgid}`,
          unitLabel: rowInfo
            ? unitLabel(rowInfo.region, rowInfo.wing, rowInfo.unit)
            : String(row.orgid),
          memberCount: row.memberCount,
          seniorCount: row.seniorCount,
          cadetCount: row.cadetCount,
          es: row.es,
          orgStats: row.orgStats,
        })
      })
      .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel))
  }

  const body: OverviewResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    scope,
    org,
    viewMode,
    totals: {
      members: computed.memberCount,
      seniors: computed.seniorCount,
      cadets: computed.cadetCount,
      unitsInScope: ctx.descendants ? includedOrgids.length : 1,
    },
    es: sanitizeEsForScope(computed.es, keepEsNamesFor(org.type, ctx.descendants)),
    orgStats: computed.orgStats,
    comparison,
    // Redesign figure-strip support (V2-DESIGN-PLAN.md sections 5-6): the
    // masthead meeting line and the 12-month strength delta + sparkline.
    meetingLine: meetingLineOf(meetingRows),
    strengthDelta12mo: strengthDeltaOf(computed.orgStats),
    strengthSeries: strengthSeriesOf(computed.orgStats),
  }
  reply.send(body)
}

async function handleEs(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const scope = ctx.descendants ? 'subtree' : 'self'
  const [computed, info] = await Promise.all([
    loadComputedOrg(ctx.orgid, scope),
    loadOrgInfo([ctx.orgid]),
  ])
  if (computed === null) {
    reply.code(404).send({ error: `no computed data for org ${ctx.orgid}` })
    return
  }
  const orgType = info.get(ctx.orgid)?.type ?? ''
  const body: EsAnalysisResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    scope,
    // Same D9 name gate as the overview: this endpoint serves the identical
    // jsonb, so it must not leak what the overview strips.
    es: sanitizeEsForScope(computed.es, keepEsNamesFor(orgType, ctx.descendants)),
  }
  reply.send(body)
}

async function handleOrgChart(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const scope = ctx.descendants ? 'subtree' : 'self'
  const computed = await loadComputedOrg(ctx.orgid, scope)
  if (computed === null) {
    reply.code(404).send({ error: `no computed data for org ${ctx.orgid}` })
    return
  }
  const body: OrgChartResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    scope,
    orgchart: computed.orgchart,
  }
  reply.send(body)
}

interface DbAdoptionUnitRow {
  unit: string | null
  roster_count: number | null
  total_accounts: number | null
  active_users: number | null
  recent_login: number | null
  gmail_active: number | null
  drive_active: number | null
  adoption_rate: string | null
  collection_date: Date | null
}

interface DbAdoptionUserRow {
  unit: string | null
  email: string | null
  full_name: string | null
  is_active_user: boolean | null
  has_recent_login: boolean | null
  last_login_date: Date | null
  has_gmail_activity: boolean | null
  has_drive_activity: boolean | null
  collection_date: Date | null
}

function adoptionUnitOf(r: DbAdoptionUnitRow): AdoptionUnitRow {
  return {
    unit: r.unit ?? '',
    rosterCount: r.roster_count,
    totalAccounts: r.total_accounts,
    activeUsers: r.active_users,
    recentLogin: r.recent_login,
    gmailActive: r.gmail_active,
    driveActive: r.drive_active,
    adoptionRate: r.adoption_rate,
    collectionDate: isoDate(r.collection_date),
  }
}

function adoptionUserOf(r: DbAdoptionUserRow): AdoptionUserRow {
  return {
    unit: r.unit ?? '',
    email: r.email,
    fullName: r.full_name,
    isActiveUser: r.is_active_user,
    hasRecentLogin: r.has_recent_login,
    lastLoginDate: isoDate(r.last_login_date),
    hasGmailActivity: r.has_gmail_activity,
    hasDriveActivity: r.has_drive_activity,
    collectionDate: isoDate(r.collection_date),
  }
}

async function handleAdoption(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return

  const countRes = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM adoption_units',
  )
  if ((countRes.rows[0]?.n ?? 0) === 0) {
    reply.code(404).send({ error: 'no adoption data has been loaded' })
    return
  }

  const realScopeOrgids = ctx.scopeOrgids.filter(id => id !== UNASSIGNED_ORGID)
  const info = await loadOrgInfo(realScopeOrgids)
  const requested = info.get(ctx.orgid)
  const unitKey = requested ? adoptionUnitKey(requested.wing, requested.unit) : null
  const keys = [...new Set(realScopeOrgids.flatMap(id => {
    const orgInfo = info.get(id)
    return orgInfo ? [adoptionUnitKey(orgInfo.wing, orgInfo.unit)] : []
  }))]
  if (keys.length === 0) {
    reply.code(404).send({ error: 'no adoption data for this org' })
    return
  }

  const unitsRes = await pool.query<DbAdoptionUnitRow>(
    'SELECT * FROM adoption_units WHERE unit = ANY($1::text[]) ORDER BY unit',
    [keys],
  )
  const usersRes = unitKey
    ? await pool.query<DbAdoptionUserRow>(
        'SELECT * FROM adoption_users WHERE unit = $1 ORDER BY full_name',
        [unitKey],
      )
    : { rows: [] as DbAdoptionUserRow[] }

  const body: AdoptionResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    unitKey,
    units: unitsRes.rows.map(adoptionUnitOf),
    users: usersRes.rows.map(adoptionUserOf),
  }
  reply.send(body)
}

export function registerOrgRoutes(app: FastifyInstance): void {
  app.get('/api/orgs', { preHandler: requireAuth }, handleOrgs)
  app.get('/api/orgs/:orgid/overview', { preHandler: requireAuth }, handleOverview)
  app.get('/api/orgs/:orgid/es', { preHandler: requireAuth }, handleEs)
  app.get('/api/orgs/:orgid/orgchart', { preHandler: requireAuth }, handleOrgChart)
  app.get('/api/orgs/:orgid/adoption', { preHandler: requireAuth }, handleAdoption)
}
