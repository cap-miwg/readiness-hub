/**
 * Member-scoped endpoints: the Senior and Cadet dashboards and the member
 * profile drill-down. Time-dependent flags re-derive at request time from the
 * stored dates (docs/ARCHITECTURE.md, Compute): promotable via isPromotableNow,
 * the cadet six-state machine via deriveCadetState, age via ageAsOf.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import { ageAsOf, deriveCadetState, isPromotableNow } from '../domain/timeSensitive.js'
import type {
  CadetStateFacts,
  ComputedEsSummary,
  ComputedMemberDetail,
  ComputedPromotion,
  Jsonified,
} from '../domain/computedTypes.js'
import type { LevelsProgress } from '../domain/senior.js'
import type { PromotionState } from '../domain/cadet.js'
import type {
  CadetDutyItem,
  CadetRow,
  CadetsResponse,
  MemberProfileResponse,
  SeniorDutyItem,
  SeniorRow,
  SeniorTrackItem,
  SeniorsResponse,
} from '../shared/contracts.js'
import { resolveOrgScope } from './orgs.js'
import {
  applyCadetFilters,
  applySeniorFilters,
  buildCadetTiles,
  buildLevelChips,
  daysSince,
  isoDate,
  parentEmailOf,
  parseCadetFilters,
  parseIntParam,
  parseSeniorFilters,
  primaryEmailOf,
  restrictedBlock,
  type ContactRecord,
} from './util.js'

const EMPTY_ES: ComputedEsSummary['counts'] = {
  active: 0,
  training: 0,
  expired: 0,
  missing: 0,
  notApproved: 0,
}

function esCountsOf(esSummary: unknown): ComputedEsSummary['counts'] {
  const summary = esSummary as ComputedEsSummary | null
  return summary?.counts ?? EMPTY_ES
}

// --- Seniors ---

interface DbSeniorRow {
  capid: number
  orgid: number
  name_last: string
  name_first: string
  full_name: string
  rank: string
  member_type: string
  joined: Date | null
  expiration: Date | null
  rank_date: Date | null
  current_level: string | null
  level_progress: unknown
  promotion: unknown
  promotable_on: Date | null
  tig_eligible_on: Date | null
  es_summary: unknown
  es_expiring_count: number | null
}

interface DbDutyRow {
  capid: number
  duty: string
  asst: boolean
  held_at_orgid: number
  funct_area: string | null
  lvl: string | null
  source: string
}

interface DbTrackRow {
  capid: number
  track: string
  track_level: string
}

function seniorRowOf(
  r: DbSeniorRow,
  duties: SeniorDutyItem[],
  tracks: SeniorTrackItem[],
  asOf: Date,
): SeniorRow {
  const promotion = r.promotion as ComputedPromotion | null
  return {
    capid: r.capid,
    orgid: r.orgid,
    fullName: r.full_name,
    nameLast: r.name_last,
    nameFirst: r.name_first,
    rank: r.rank,
    memberType: r.member_type,
    joined: isoDate(r.joined),
    expiration: isoDate(r.expiration),
    rankDate: isoDate(r.rank_date),
    currentLevel: r.current_level,
    levelProgress: (r.level_progress as Jsonified<LevelsProgress> | null) ?? null,
    duties,
    tracks,
    promotion: promotion !== null && promotion.kind === 'senior' ? promotion.details : null,
    promotable: isPromotableNow(r.promotable_on, asOf),
    promotableOn: isoDate(r.promotable_on),
    tigEligibleOn: isoDate(r.tig_eligible_on),
    esCounts: esCountsOf(r.es_summary),
    esExpiringCount: r.es_expiring_count ?? 0,
  }
}

async function loadSeniorJunctions(
  scopeOrgids: readonly number[],
): Promise<{ duties: Map<number, SeniorDutyItem[]>; tracks: Map<number, SeniorTrackItem[]> }> {
  const [dutyRes, trackRes] = await Promise.all([
    pool.query<DbDutyRow>(
      `SELECT d.capid, d.duty, d.asst, d.held_at_orgid, d.funct_area, d.lvl, d.source
       FROM computed_member_duty d
       JOIN computed_member m ON m.capid = d.capid
       WHERE m.is_senior_scope AND m.orgid = ANY($1::int[])`,
      [scopeOrgids],
    ),
    pool.query<DbTrackRow>(
      `SELECT t.capid, t.track, t.track_level
       FROM computed_member_track t
       JOIN computed_member m ON m.capid = t.capid
       WHERE m.is_senior_scope AND m.orgid = ANY($1::int[])`,
      [scopeOrgids],
    ),
  ])
  const duties = new Map<number, SeniorDutyItem[]>()
  for (const d of dutyRes.rows) {
    const item: SeniorDutyItem = {
      duty: d.duty,
      asst: d.asst,
      heldAtOrgid: d.held_at_orgid,
      functArea: d.funct_area,
      lvl: d.lvl,
      source: d.source === 'cadet' ? 'cadet' : 'senior',
    }
    const list = duties.get(d.capid)
    if (list) list.push(item)
    else duties.set(d.capid, [item])
  }
  const tracks = new Map<number, SeniorTrackItem[]>()
  for (const t of trackRes.rows) {
    const item: SeniorTrackItem = { track: t.track, trackLevel: t.track_level }
    const list = tracks.get(t.capid)
    if (list) list.push(item)
    else tracks.set(t.capid, [item])
  }
  return { duties, tracks }
}

async function handleSeniors(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const asOf = new Date()

  const res = await pool.query<DbSeniorRow>(
    `SELECT capid, orgid, name_last, name_first, full_name, rank, member_type,
            joined, expiration, rank_date, current_level, level_progress,
            promotion, promotable_on, tig_eligible_on, es_summary, es_expiring_count
     FROM computed_member
     WHERE is_senior_scope AND orgid = ANY($1::int[])
     ORDER BY name_last, name_first, capid`,
    [ctx.scopeOrgids],
  )
  const junctions = await loadSeniorJunctions(ctx.scopeOrgids)

  const all = res.rows.map(r =>
    seniorRowOf(r, junctions.duties.get(r.capid) ?? [], junctions.tracks.get(r.capid) ?? [], asOf),
  )
  const filters = parseSeniorFilters(req.query as Record<string, unknown>)
  const rows = applySeniorFilters(all, filters)

  const body: SeniorsResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    total: all.length,
    promotableCount: rows.filter(r => r.promotable).length,
    levelChips: buildLevelChips(rows),
    rows,
  }
  reply.send(body)
}

// --- Cadets ---

interface DbCadetRow {
  capid: number
  orgid: number
  name_last: string
  name_first: string
  full_name: string
  rank: string
  member_type: string
  joined: Date | null
  expiration: Date | null
  phase: string | null
  next_achv_id: number | null
  next_achv_public_number: number | null
  cadet_state_facts: unknown
  tig_complete_on: Date | null
  hfz_valid_until: Date | null
  last_promotion_on: Date | null
  honor_credit: boolean | null
  promotion: unknown
  es_summary: unknown
  honor_count: number | null
}

function cadetStateOf(
  facts: CadetStateFacts | null,
  promotion: ComputedPromotion | null,
  asOf: Date,
): PromotionState {
  if (facts !== null) return deriveCadetState(facts, asOf)
  return promotion !== null && promotion.kind === 'cadet'
    ? promotion.readiness.state
    : 'NOT_STARTED'
}

function cadetRowOf(r: DbCadetRow, duties: CadetDutyItem[], asOf: Date): CadetRow {
  const facts = (r.cadet_state_facts as CadetStateFacts | null) ?? null
  const promotion = (r.promotion as ComputedPromotion | null) ?? null
  return {
    capid: r.capid,
    orgid: r.orgid,
    fullName: r.full_name,
    nameLast: r.name_last,
    nameFirst: r.name_first,
    rank: r.rank,
    memberType: r.member_type,
    joined: isoDate(r.joined),
    expiration: isoDate(r.expiration),
    phase: r.phase,
    state: cadetStateOf(facts, promotion, asOf),
    stateMessage:
      promotion !== null && promotion.kind === 'cadet' ? promotion.readiness.message : null,
    nextAchvId: r.next_achv_id,
    nextAchvPublicNumber: r.next_achv_public_number,
    tigCompleteOn: isoDate(r.tig_complete_on),
    hfzValidUntil: isoDate(r.hfz_valid_until),
    lastPromotionOn: isoDate(r.last_promotion_on),
    daysSincePromotion: daysSince(r.last_promotion_on, asOf),
    honorCredit: r.honor_credit === true,
    honorCreditCount: r.honor_count ?? 0,
    duties,
    esCounts: esCountsOf(r.es_summary),
  }
}

async function handleCadets(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const asOf = new Date()

  const res = await pool.query<DbCadetRow>(
    `SELECT capid, orgid, name_last, name_first, full_name, rank, member_type,
            joined, expiration, phase, next_achv_id, next_achv_public_number,
            cadet_state_facts, tig_complete_on, hfz_valid_until, last_promotion_on,
            honor_credit, promotion, es_summary,
            COALESCE(jsonb_array_length(detail->'cadet'->'honorCreditAchievements'), 0) AS honor_count
     FROM computed_member
     WHERE is_cadet_scope AND orgid = ANY($1::int[])
     ORDER BY name_last, name_first, capid`,
    [ctx.scopeOrgids],
  )
  const dutyRes = await pool.query<DbDutyRow>(
    `SELECT d.capid, d.duty, d.asst, d.held_at_orgid, d.funct_area, d.lvl, d.source
     FROM computed_member_duty d
     JOIN computed_member m ON m.capid = d.capid
     WHERE d.source = 'cadet' AND m.is_cadet_scope AND m.orgid = ANY($1::int[])`,
    [ctx.scopeOrgids],
  )
  const duties = new Map<number, CadetDutyItem[]>()
  for (const d of dutyRes.rows) {
    const item: CadetDutyItem = { duty: d.duty, asst: d.asst, heldAtOrgid: d.held_at_orgid }
    const list = duties.get(d.capid)
    if (list) list.push(item)
    else duties.set(d.capid, [item])
  }

  const all = res.rows.map(r => cadetRowOf(r, duties.get(r.capid) ?? [], asOf))
  const filters = parseCadetFilters(req.query as Record<string, unknown>)
  const rows = applyCadetFilters(all, filters)

  const body: CadetsResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    total: all.length,
    tiles: buildCadetTiles(rows),
    rows,
  }
  reply.send(body)
}

// --- Member profile ---

interface DbMemberRow {
  capid: number
  orgid: number
  name_last: string
  name_first: string
  full_name: string
  rank: string
  member_type: string
  joined: Date | null
  expiration: Date | null
  rank_date: Date | null
  dob_year: number | null
  is_senior_scope: boolean
  is_cadet_scope: boolean
  current_level: string | null
  phase: string | null
  promotion: unknown
  promotable_on: Date | null
  cadet_state_facts: unknown
  es_summary: unknown
  es_expiring_count: number | null
  detail: unknown
}

interface DbContactRow {
  type: string | null
  priority: string | null
  contact: string | null
  do_not_contact: boolean | null
}

async function handleMemberProfile(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = req.rhSession
  if (session === undefined) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }
  const capid = parseIntParam((req.params as Record<string, unknown>)['capid'])
  if (capid === null) {
    reply.code(400).send({ error: 'capid must be an integer' })
    return
  }
  const asOf = new Date()

  const res = await pool.query<DbMemberRow>(
    `SELECT capid, orgid, name_last, name_first, full_name, rank, member_type,
            joined, expiration, rank_date, dob_year, is_senior_scope, is_cadet_scope,
            current_level, phase, promotion, promotable_on, cadet_state_facts,
            es_summary, es_expiring_count, detail
     FROM computed_member WHERE capid = $1`,
    [capid],
  )
  const row = res.rows[0]
  if (row === undefined) {
    reply.code(404).send({ error: `no member ${capid}` })
    return
  }

  const contactRes = await pool.query<DbContactRow>(
    'SELECT type, priority, contact, do_not_contact FROM mbr_contact WHERE capid = $1',
    [capid],
  )
  const contacts: ContactRecord[] = contactRes.rows.map(c => ({
    type: c.type ?? '',
    priority: c.priority ?? '',
    contact: c.contact ?? '',
    doNotContact: c.do_not_contact === true,
  }))
  const { email, doNotContact } = primaryEmailOf(contacts)

  const facts = (row.cadet_state_facts as CadetStateFacts | null) ?? null
  const promotion = (row.promotion as ComputedPromotion | null) ?? null

  const body: MemberProfileResponse = {
    capid: row.capid,
    orgid: row.orgid,
    fullName: row.full_name,
    nameLast: row.name_last,
    nameFirst: row.name_first,
    rank: row.rank,
    memberType: row.member_type,
    joined: isoDate(row.joined),
    expiration: isoDate(row.expiration),
    rankDate: isoDate(row.rank_date),
    age: ageAsOf(row.dob_year, asOf),
    isSeniorScope: row.is_senior_scope,
    isCadetScope: row.is_cadet_scope,
    currentLevel: row.current_level,
    phase: row.phase,
    promotion,
    promotable: isPromotableNow(row.promotable_on, asOf),
    cadetState: row.is_cadet_scope ? cadetStateOf(facts, promotion, asOf) : null,
    esSummary: (row.es_summary as ComputedEsSummary | null) ?? {
      counts: EMPTY_ES,
      qualifications: [],
    },
    esExpiringCount: row.es_expiring_count ?? 0,
    detail: row.detail as ComputedMemberDetail,
    email,
    doNotContact,
  }

  if (session.role === 'admin') {
    // Exact DOB is never mirrored into computed_member; it lives only in the
    // members table and is served here behind the admin gate
    // (docs/ARCHITECTURE.md, PII posture).
    const dobRes = await pool.query<{ dob: Date | null }>(
      'SELECT dob FROM members WHERE capid = $1 LIMIT 1',
      [capid],
    )
    const restricted = restrictedBlock(
      session.role,
      isoDate(dobRes.rows[0]?.dob ?? null),
      parentEmailOf(contacts, email),
    )
    if (restricted !== undefined) body.restricted = restricted
  }

  reply.send(body)
}

export function registerMemberRoutes(app: FastifyInstance): void {
  app.get('/api/orgs/:orgid/seniors', { preHandler: requireAuth }, handleSeniors)
  app.get('/api/orgs/:orgid/cadets', { preHandler: requireAuth }, handleCadets)
  app.get('/api/members/:capid', { preHandler: requireAuth }, handleMemberProfile)
}
