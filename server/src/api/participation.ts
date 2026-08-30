/**
 * Participation endpoints and loaders (the attendance module, D7). Serves the
 * org-scoped 12-month participation series, the 90-day window, and the
 * quiet-members early warning, all as index-backed SQL aggregation over the
 * attendance mirrors (no member-level rows ever cross into Node except the
 * named quiet list at single-unit scope, per D9).
 *
 * Registration: the orchestrator adds registerParticipationRoutes(app) to
 * api/routes.ts (kept out of this module's diff to avoid a routes.ts
 * collision with the core agent).
 *
 * Conventions this module leans on:
 * - Meetings dedupe on (attendance_log_id, start_date) because CAPWATCH
 *   mirrors carry duplicate rows (docs/ARCHITECTURE.md, Ingest).
 * - "Units that log" = orgids with any meeting whose StartDate falls in the
 *   trailing 12 months. recorded=false is a neutral state (NOT RECORDED on
 *   the web), never a red verdict.
 * - Presence counts anywhere: a member present at another unit's meeting is
 *   not quiet, so the quiet scan joins meetings wing-wide, not scope-wide.
 * - computed_member IS the ACTIVE include-list (computed_member rows exist
 *   only for MbrStatus ACTIVE members of included types).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import type {
  MemberParticipation,
  ParticipationMonth,
  ParticipationQuiet,
  ParticipationResponse,
} from '../shared/participationContracts.js'
import { resolveOrgScope } from './orgs.js'
import { isoDate, UNASSIGNED_ORGID } from './util.js'

// --- Window math (pure) ---

export interface ParticipationWindows {
  /** First day of the oldest of the 12 trailing calendar months. */
  monthsStart: Date
  d90: Date
  d60: Date
}

export function participationWindows(asOf: Date): ParticipationWindows {
  return {
    monthsStart: new Date(asOf.getFullYear(), asOf.getMonth() - 11, 1),
    d90: new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - 90),
    d60: new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - 60),
  }
}

/** Trailing month keys ('YYYY-MM'), oldest first, ending at asOf's month. */
export function monthKeysBack(asOf: Date, months: number): string[] {
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/** Present rows / attendee rows as a 0..1 fraction; null when nothing to divide. */
export function rateOf(presentRows: number, attendeeRows: number): number | null {
  if (attendeeRows <= 0) return null
  return Math.round((presentRows / attendeeRows) * 1000) / 1000
}

// --- Aggregate row shapes (SQL results in, pure assembly out) ---

export interface MonthlyAggRow {
  /** 'YYYY-MM'. */
  month: string
  meetings: number
  attendeeRows: number
  presentRows: number
}

export interface MonthlyGuestRow {
  month: string
  guests: number
}

/** Per logging unit: 12-month recorded marker with 90-day aggregates. */
export interface ParticipationUnitAgg {
  orgid: number
  meetings90: number
  attendeeRows90: number
  presentRows90: number
  guests90: number
}

export interface QuietCountRow {
  orgid: number
  quietCount: number
}

export interface QuietMemberRecord {
  capid: number
  fullName: string
  orgid: number
  /** Latest Present=true meeting date in the 12-month window; null if never. */
  lastPresentOn: Date | null
  rows90: number
  present90: number
}

// --- Pure assembly (unit-tested against synthetic rows) ---

export function buildMonthly(
  keys: readonly string[],
  agg: readonly MonthlyAggRow[],
  guests: readonly MonthlyGuestRow[],
): ParticipationMonth[] {
  const aggByMonth = new Map(agg.map(r => [r.month, r]))
  const guestsByMonth = new Map(guests.map(r => [r.month, r.guests]))
  return keys.map(month => {
    const a = aggByMonth.get(month)
    return {
      month,
      meetings: a?.meetings ?? 0,
      avgAttendanceRate: a !== undefined ? rateOf(a.presentRows, a.attendeeRows) : null,
      guests: guestsByMonth.get(month) ?? 0,
    }
  })
}

/**
 * Quiet-member payload with the D9 name gate: named entries appear only when
 * the caller resolved a single-unit scope and loaded them; every other scope
 * gets the count alone (no members key at all).
 */
export function buildQuiet(
  counts: readonly QuietCountRow[],
  named: readonly QuietMemberRecord[] | null,
): ParticipationQuiet {
  if (named !== null) {
    return {
      count: named.length,
      members: named.map(r => ({
        capid: r.capid,
        fullName: r.fullName,
        lastPresentOn: isoDate(r.lastPresentOn),
      })),
    }
  }
  return { count: counts.reduce((sum, r) => sum + r.quietCount, 0) }
}

export interface ParticipationRaw {
  /** One row per logging unit in scope (12-month window). */
  unitAggs: readonly ParticipationUnitAgg[]
  monthlyAgg: readonly MonthlyAggRow[]
  monthlyGuests: readonly MonthlyGuestRow[]
  quietCounts: readonly QuietCountRow[]
  /** Non-null only at single-unit scope (D9). */
  quietNamed: readonly QuietMemberRecord[] | null
}

/** The scope-independent body of a ParticipationResponse from raw aggregates. */
export function buildParticipation(
  asOf: Date,
  raw: ParticipationRaw,
): Omit<ParticipationResponse, 'orgid' | 'descendants'> {
  const meetings90 = raw.unitAggs.reduce((sum, u) => sum + u.meetings90, 0)
  const attendeeRows90 = raw.unitAggs.reduce((sum, u) => sum + u.attendeeRows90, 0)
  const presentRows90 = raw.unitAggs.reduce((sum, u) => sum + u.presentRows90, 0)
  const guests90 = raw.unitAggs.reduce((sum, u) => sum + u.guests90, 0)
  return {
    recorded: raw.unitAggs.length > 0,
    monthly: buildMonthly(monthKeysBack(asOf, 12), raw.monthlyAgg, raw.monthlyGuests),
    last90: {
      meetings: meetings90,
      avgRate: rateOf(presentRows90, attendeeRows90),
      guests: guests90,
    },
    quietMembers: buildQuiet(raw.quietCounts, raw.quietNamed),
  }
}

// --- SQL loaders (shared with reports/data.ts) ---

/** Deduped meetings for a scope since a cutoff; the base of every aggregate. */
const SCOPED_MEETINGS = `
  SELECT DISTINCT attendance_log_id, orgid, start_date
  FROM attendance_meetings
  WHERE orgid = ANY($1::int[]) AND start_date >= $2::date`

/** Deduped meetings anywhere since a cutoff (presence counts across units). */
const ALL_MEETINGS = `
  SELECT DISTINCT attendance_log_id, orgid, start_date
  FROM attendance_meetings
  WHERE start_date >= $2::date`

/**
 * One row per unit in scope that logged any meeting in the trailing 12
 * months (its presence marks recorded=true), carrying 90-day aggregates.
 */
export async function loadParticipationUnitAggs(
  scopeOrgids: readonly number[],
  asOf: Date,
): Promise<ParticipationUnitAgg[]> {
  if (scopeOrgids.length === 0) return []
  const w = participationWindows(asOf)
  const params = [scopeOrgids, isoDate(w.monthsStart), isoDate(w.d90)]
  const [aggRes, guestRes] = await Promise.all([
    pool.query<{
      orgid: number
      meetings90: number
      attendee_rows90: number
      present_rows90: number
    }>(
      `WITH mtg AS (${SCOPED_MEETINGS})
       SELECT m.orgid,
              count(DISTINCT m.attendance_log_id) FILTER (WHERE m.start_date >= $3::date)::int AS meetings90,
              count(a.attendance_log_id) FILTER (WHERE m.start_date >= $3::date)::int AS attendee_rows90,
              count(*) FILTER (WHERE a.present AND m.start_date >= $3::date)::int AS present_rows90
       FROM mtg m
       LEFT JOIN attendance_attendees a ON a.attendance_log_id = m.attendance_log_id
       GROUP BY m.orgid`,
      params,
    ),
    pool.query<{ orgid: number; guests90: number }>(
      `WITH mtg AS (${SCOPED_MEETINGS})
       SELECT m.orgid, count(*) FILTER (WHERE m.start_date >= $3::date)::int AS guests90
       FROM mtg m
       JOIN attendance_guests g ON g.attendance_log_id = m.attendance_log_id
       GROUP BY m.orgid`,
      params,
    ),
  ])
  const guestsByOrgid = new Map(guestRes.rows.map(r => [r.orgid, r.guests90]))
  return aggRes.rows.map(r => ({
    orgid: r.orgid,
    meetings90: r.meetings90,
    attendeeRows90: r.attendee_rows90,
    presentRows90: r.present_rows90,
    guests90: guestsByOrgid.get(r.orgid) ?? 0,
  }))
}

interface MonthlySeries {
  agg: MonthlyAggRow[]
  guests: MonthlyGuestRow[]
}

async function loadMonthlySeries(
  scopeOrgids: readonly number[],
  asOf: Date,
): Promise<MonthlySeries> {
  if (scopeOrgids.length === 0) return { agg: [], guests: [] }
  const w = participationWindows(asOf)
  const params = [scopeOrgids, isoDate(w.monthsStart)]
  const [aggRes, guestRes] = await Promise.all([
    pool.query<{ month: string; meetings: number; attendee_rows: number; present_rows: number }>(
      `WITH mtg AS (${SCOPED_MEETINGS})
       SELECT to_char(m.start_date, 'YYYY-MM') AS month,
              count(DISTINCT m.attendance_log_id)::int AS meetings,
              count(a.attendance_log_id)::int AS attendee_rows,
              count(*) FILTER (WHERE a.present)::int AS present_rows
       FROM mtg m
       LEFT JOIN attendance_attendees a ON a.attendance_log_id = m.attendance_log_id
       GROUP BY 1`,
      params,
    ),
    pool.query<{ month: string; guests: number }>(
      `WITH mtg AS (${SCOPED_MEETINGS})
       SELECT to_char(m.start_date, 'YYYY-MM') AS month, count(*)::int AS guests
       FROM mtg m
       JOIN attendance_guests g ON g.attendance_log_id = m.attendance_log_id
       GROUP BY 1`,
      params,
    ),
  ])
  return {
    agg: aggRes.rows.map(r => ({
      month: r.month,
      meetings: r.meetings,
      attendeeRows: r.attendee_rows,
      presentRows: r.present_rows,
    })),
    guests: guestRes.rows.map(r => ({ month: r.month, guests: r.guests })),
  }
}

/**
 * Quiet-member counts per logging unit in scope: ACTIVE include-list members
 * (computed_member) of units that log, with zero Present=true rows in the
 * trailing 60 days anywhere.
 */
export async function loadQuietCounts(
  scopeOrgids: readonly number[],
  asOf: Date,
): Promise<QuietCountRow[]> {
  if (scopeOrgids.length === 0) return []
  const w = participationWindows(asOf)
  const res = await pool.query<{ orgid: number; quiet_count: number }>(
    `WITH mtg AS (${ALL_MEETINGS}),
     logging_units AS (
       SELECT DISTINCT orgid FROM mtg WHERE orgid = ANY($1::int[])
     ),
     member_pool AS (
       SELECT cm.capid, cm.orgid
       FROM computed_member cm
       JOIN logging_units lu ON lu.orgid = cm.orgid
     ),
     recent_present AS (
       SELECT DISTINCT a.capid
       FROM attendance_attendees a
       JOIN mtg m ON m.attendance_log_id = a.attendance_log_id
       WHERE a.present AND m.start_date >= $3::date
         AND a.capid IN (SELECT capid FROM member_pool)
     )
     SELECT p.orgid, count(*)::int AS quiet_count
     FROM member_pool p
     LEFT JOIN recent_present rp ON rp.capid = p.capid
     WHERE rp.capid IS NULL
     GROUP BY p.orgid`,
    [scopeOrgids, isoDate(w.monthsStart), isoDate(w.d60)],
  )
  return res.rows.map(r => ({ orgid: r.orgid, quietCount: r.quiet_count }))
}

/**
 * Named quiet members with per-member history. Callers gate this behind the
 * single-unit scope check (D9); it is never invoked for a broader scope.
 */
export async function loadQuietMembers(
  scopeOrgids: readonly number[],
  asOf: Date,
): Promise<QuietMemberRecord[]> {
  if (scopeOrgids.length === 0) return []
  const w = participationWindows(asOf)
  const res = await pool.query<{
    capid: number
    full_name: string | null
    orgid: number
    last_present_on: Date | null
    rows90: number
    present90: number
  }>(
    `WITH mtg AS (${ALL_MEETINGS}),
     logging_units AS (
       SELECT DISTINCT orgid FROM mtg WHERE orgid = ANY($1::int[])
     ),
     member_pool AS (
       SELECT cm.capid, cm.full_name, cm.orgid
       FROM computed_member cm
       JOIN logging_units lu ON lu.orgid = cm.orgid
     ),
     history AS (
       SELECT a.capid,
              max(m.start_date) FILTER (WHERE a.present) AS last_present_on,
              count(*) FILTER (WHERE a.present AND m.start_date >= $3::date)::int AS present60,
              count(a.attendance_log_id) FILTER (WHERE m.start_date >= $4::date)::int AS rows90,
              count(*) FILTER (WHERE a.present AND m.start_date >= $4::date)::int AS present90
       FROM attendance_attendees a
       JOIN mtg m ON m.attendance_log_id = a.attendance_log_id
       WHERE a.capid IN (SELECT capid FROM member_pool)
       GROUP BY a.capid
     )
     SELECT p.capid, p.full_name, p.orgid, h.last_present_on,
            coalesce(h.rows90, 0)::int AS rows90, coalesce(h.present90, 0)::int AS present90
     FROM member_pool p
     LEFT JOIN history h ON h.capid = p.capid
     WHERE coalesce(h.present60, 0) = 0
     ORDER BY h.last_present_on NULLS FIRST, p.full_name`,
    [scopeOrgids, isoDate(w.monthsStart), isoDate(w.d60), isoDate(w.d90)],
  )
  return res.rows.map(r => ({
    capid: r.capid,
    fullName: r.full_name ?? '',
    orgid: r.orgid,
    lastPresentOn: r.last_present_on,
    rows90: r.rows90,
    present90: r.present90,
  }))
}

/**
 * Per-member participation facts for the member profile drill-down.
 * Exported for api/members.ts to consume when the profile gains its
 * participation line (that wiring is a later change, not made here).
 */
export async function memberParticipationOf(
  capid: number,
  asOf: Date,
): Promise<MemberParticipation> {
  const w = participationWindows(asOf)
  const res = await pool.query<{
    last_present_on: Date | null
    rows90: number
    present90: number
  }>(
    `SELECT max(m.start_date) FILTER (WHERE a.present) AS last_present_on,
            count(a.attendance_log_id) FILTER (WHERE m.start_date >= $3::date)::int AS rows90,
            count(*) FILTER (WHERE a.present AND m.start_date >= $3::date)::int AS present90
     FROM attendance_attendees a
     JOIN (
       SELECT DISTINCT attendance_log_id, start_date
       FROM attendance_meetings
       WHERE start_date >= $2::date
     ) m ON m.attendance_log_id = a.attendance_log_id
     WHERE a.capid = $1`,
    [capid, isoDate(w.monthsStart), isoDate(w.d90)],
  )
  const row = res.rows[0]
  return {
    lastPresentOn: isoDate(row?.last_present_on ?? null),
    rate90: rateOf(row?.present90 ?? 0, row?.rows90 ?? 0),
  }
}

// --- Route ---

async function handleParticipation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const asOf = new Date()
  const realScopeOrgids = ctx.scopeOrgids.filter(id => id !== UNASSIGNED_ORGID)
  const singleUnit = realScopeOrgids.length === 1

  const [unitAggs, monthly] = await Promise.all([
    loadParticipationUnitAggs(realScopeOrgids, asOf),
    loadMonthlySeries(realScopeOrgids, asOf),
  ])
  // Nothing logged in 12 months: skip the quiet scan entirely (no unit
  // qualifies as "a unit that logs", so the count is zero by definition).
  let quietCounts: QuietCountRow[] = []
  let quietNamed: QuietMemberRecord[] | null = null
  if (unitAggs.length > 0) {
    if (singleUnit) quietNamed = await loadQuietMembers(realScopeOrgids, asOf)
    else quietCounts = await loadQuietCounts(realScopeOrgids, asOf)
  } else if (singleUnit) {
    quietNamed = []
  }

  const body: ParticipationResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    ...buildParticipation(asOf, {
      unitAggs,
      monthlyAgg: monthly.agg,
      monthlyGuests: monthly.guests,
      quietCounts,
      quietNamed,
    }),
  }
  reply.send(body)
}

export function registerParticipationRoutes(app: FastifyInstance): void {
  app.get('/api/orgs/:orgid/participation', { preHandler: requireAuth }, handleParticipation)
}
