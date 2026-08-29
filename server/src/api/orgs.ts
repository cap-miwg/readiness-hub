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
  UnitComparisonRow,
} from '../shared/contracts.js'
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
  const [info, settings] = await Promise.all([loadOrgInfo(realScopeOrgids), loadOrgSettings()])
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
    es: computed.es,
    orgStats: computed.orgStats,
    comparison,
  }
  reply.send(body)
}

async function handleEs(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const scope = ctx.descendants ? 'subtree' : 'self'
  const computed = await loadComputedOrg(ctx.orgid, scope)
  if (computed === null) {
    reply.code(404).send({ error: `no computed data for org ${ctx.orgid}` })
    return
  }
  const body: EsAnalysisResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    scope,
    es: computed.es,
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
