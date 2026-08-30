/**
 * The Needs Attention findings engine (V2-DESIGN-PLAN.md section 6, module 1):
 * a ranked queue of at most five one-sentence findings per org scope, each
 * with one deep link. Categories rank action > watch > plan; within a
 * category, findings rank by magnitude. A healthy scope returns [] cleanly.
 *
 * Copy discipline: counts, never member names (D9); the SPOF finding names
 * the position at rest and the member name lives one click deeper in the
 * Unit Overview ES drill-down.
 *
 * This module also owns the pure Unit Overview figure-strip shapers the
 * redesign added (meeting line from OrgMeetings, 12-month strength series and
 * delta), consumed by orgs.ts. Everything below the "DB loaders" divider
 * touches the database; everything above is pure and unit-tested in
 * server/test/findings.test.ts.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import { deriveCadetState, daysUntil } from '../domain/timeSensitive.js'
import type { CadetStateFacts, Jsonified } from '../domain/computedTypes.js'
import type { UnitOrgStatsMetrics } from '../domain/orgStats.js'
import type {
  Finding,
  FindingCategory,
  FindingsResponse,
  Role,
  StrengthPoint,
} from '../shared/contracts.js'
import { resolveOrgScope } from './orgs.js'
import { loadComputedOrg } from './scope.js'
import { isoDate } from './util.js'

// --- Pure: finding sources and ranking ---

export interface ExpiredQualCount {
  /** Qualification display name from the dashboard ES view (e.g. "GTM2"). */
  name: string
  count: number
}

/** Everything rankFindings needs, pre-aggregated so the shaper stays pure. */
export interface FindingSources {
  /** Dashboard-view ES quals with status Expired in the last 60 days. */
  expiredQuals: ExpiredQualCount[]
  /** SPOF position display names from computed_org es jsonb (D9: no names). */
  spofPositions: string[]
  /** Memberships already expired while the member is still on the ACTIVE roster. */
  expiredMemberships: number
  /** Memberships expiring in the next 30 days. */
  membershipsExpiring30: number
  /** Memberships expiring 31 to 60 days out (exclusive of the 30-day band). */
  membershipsExpiring60: number
  /** Active ES quals expiring within 30 days. */
  qualsExpiring30: number
  /** Cadets whose HFZ credit window closes before they reach time in grade. */
  hfzBeforeTig: number
  /** Cadets fully READY and awaiting a promotion board. */
  cadetsReady: number
  /** Cadets blocked only by time in grade, eligible within 14 days. */
  tigWithin14: number
  /** Seniors with a completed level pending approval (path credit status 26). */
  seniorsAwaitingApproval: number
}

export const EMPTY_SOURCES: FindingSources = {
  expiredQuals: [],
  spofPositions: [],
  expiredMemberships: 0,
  membershipsExpiring30: 0,
  membershipsExpiring60: 0,
  qualsExpiring30: 0,
  hfzBeforeTig: 0,
  cadetsReady: 0,
  tigWithin14: 0,
  seniorsAwaitingApproval: 0,
}

export const FINDINGS_CAP = 5

/** Org-scope search string for deep links (?orgid=N[&descendants=1]). */
export function scopeSearchOf(orgid: number, descendants: boolean): string {
  return `?orgid=${orgid}${descendants ? '&descendants=1' : ''}`
}

/**
 * Section-open param appended to Unit Overview deep links so the link lands
 * on the section it names instead of the top of the page. Contract agreed
 * with the web layer: param name 'section', values are the Unit Overview
 * Section ids (recruiting|es|participation|logistics|workspace|cadet-program|
 * pd|personnel). Every ES-related finding opens the es section.
 */
export const ES_SECTION_PARAM = '&section=es'

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`)
}

/** "2 GTM2, 1 UDF" breakdown, top three kinds, "+N more" past that. */
export function qualBreakdownOf(quals: readonly ExpiredQualCount[]): string {
  const sorted = [...quals].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const shown = sorted.slice(0, 3).map(q => `${q.count} ${q.name}`)
  const rest = sorted.length - 3
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ')
}

function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface Candidate extends Omit<Finding, 'rank'> {
  /** Within-category sort key, larger first. */
  magnitude: number
}

const CATEGORY_ORDER: Readonly<Record<FindingCategory, number>> = {
  action: 0,
  watch: 1,
  plan: 2,
}

/**
 * Rank the pre-aggregated sources into the capped queue. Pure; the route
 * feeds it from loadFindingSources. role is accepted for interface stability
 * but does not change the output: findings are counts-only for every role
 * (D9), so there is nothing to gate yet.
 */
export function rankFindings(
  sources: FindingSources,
  orgid: number,
  descendants: boolean,
  _role?: Role,
): Finding[] {
  const scope = scopeSearchOf(orgid, descendants)
  const candidates: Candidate[] = []

  // -- action --
  const expiredTotal = sources.expiredQuals.reduce((sum, q) => sum + q.count, 0)
  if (expiredTotal > 0) {
    candidates.push({
      id: 'es-quals-expired',
      category: 'action',
      text: `${expiredTotal} Emergency Services ${plural(expiredTotal, 'qualification')} expired in the last 60 days: ${qualBreakdownOf(sources.expiredQuals)}.`,
      href: `/unit${scope}${ES_SECTION_PARAM}`,
      actionLabel: 'Review expirations',
      magnitude: expiredTotal,
    })
  }
  for (const position of sources.spofPositions) {
    candidates.push({
      id: `spof-${slugOf(position)}`,
      category: 'action',
      text: `${position} rests on one qualified member.`,
      href: `/unit${scope}${ES_SECTION_PARAM}`,
      actionLabel: 'View position',
      magnitude: 1,
    })
  }
  if (sources.expiredMemberships > 0) {
    const n = sources.expiredMemberships
    candidates.push({
      id: 'memberships-expired',
      category: 'action',
      text:
        n === 1
          ? '1 membership has expired while the member is still on the active roster.'
          : `${n} memberships have expired while the members are still on the active roster.`,
      href: `/reports?report=membership-lapse${scope.replace('?', '&')}`,
      actionLabel: 'Open renewal list',
      magnitude: n,
    })
  }

  // -- watch --
  // The two expiry bands read as one sentence (the mockups' grammar):
  // "1 membership expires within 30 days; 5 more within 60." A solo band
  // keeps its own phrasing, and the nearer band always carries the urgency.
  if (sources.membershipsExpiring30 > 0 || sources.membershipsExpiring60 > 0) {
    const n30 = sources.membershipsExpiring30
    const n60 = sources.membershipsExpiring60
    let text: string
    if (n30 > 0 && n60 > 0) {
      text = `${n30} ${plural(n30, 'membership expires', 'memberships expire')} within 30 days; ${n60} more within 60.`
    } else if (n30 > 0) {
      text = `${n30} ${plural(n30, 'membership expires', 'memberships expire')} within 30 days.`
    } else {
      text = `${n60} ${plural(n60, 'membership expires', 'memberships expire')} within 60 days.`
    }
    candidates.push({
      id: 'memberships-expiring',
      category: 'watch',
      text,
      href: `/reports?report=membership-lapse${scope.replace('?', '&')}`,
      actionLabel: 'Open renewal list',
      // 30-day urgency dominates; the 60-day band contributes fractionally.
      magnitude: n30 * 2 + n60 / 100,
    })
  }
  if (sources.qualsExpiring30 > 0) {
    const n = sources.qualsExpiring30
    candidates.push({
      id: 'es-quals-expiring-30',
      category: 'watch',
      text: `${n} Emergency Services ${plural(n, 'qualification expires', 'qualifications expire')} within 30 days.`,
      href: `/unit${scope}${ES_SECTION_PARAM}`,
      actionLabel: 'Review expirations',
      magnitude: n,
    })
  }
  if (sources.hfzBeforeTig > 0) {
    const n = sources.hfzBeforeTig
    candidates.push({
      id: 'hfz-before-tig',
      category: 'watch',
      text: `${n} ${plural(n, 'cadet loses', 'cadets lose')} Healthy Fitness Zone credit before reaching time in grade.`,
      href: `/cadets${scope}`,
      actionLabel: 'View cadets',
      magnitude: n,
    })
  }

  // -- plan --
  if (sources.cadetsReady > 0) {
    const n = sources.cadetsReady
    candidates.push({
      id: 'cadets-ready',
      category: 'plan',
      text: `${n} ${plural(n, 'cadet is', 'cadets are')} fully ready and awaiting a promotion board.`,
      href: `/cadets${scope}&state=READY`,
      actionLabel: 'View ready cadets',
      magnitude: n,
    })
  }
  if (sources.tigWithin14 > 0) {
    const n = sources.tigWithin14
    candidates.push({
      id: 'tig-within-14',
      category: 'plan',
      text: `${n} ${plural(n, 'cadet reaches', 'cadets reach')} time-in-grade eligibility within 14 days.`,
      href: `/cadets${scope}&state=TIME_PENDING`,
      actionLabel: 'View cadets',
      magnitude: n,
    })
  }
  if (sources.seniorsAwaitingApproval > 0) {
    const n = sources.seniorsAwaitingApproval
    candidates.push({
      id: 'seniors-awaiting-approval',
      category: 'plan',
      text: `${n} ${plural(n, 'senior member has', 'senior members have')} a completed level awaiting approval.`,
      href: `/reports?report=approval${scope.replace('?', '&')}`,
      actionLabel: 'Open approval list',
      magnitude: n,
    })
  }

  candidates.sort((a, b) => {
    const byCategory = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    if (byCategory !== 0) return byCategory
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude
    return a.id.localeCompare(b.id)
  })

  return candidates.slice(0, FINDINGS_CAP).map(({ magnitude: _magnitude, ...rest }, i) => ({
    ...rest,
    rank: i + 1,
  }))
}

// --- Pure: qualification counting on a deduped basis ---

/** One dashboard-view qualification row for one member, straight off the jsonb. */
export interface QualStatusRow {
  capid: number
  /** Qualification display name (e.g. "GTM2 - Ground Team Member Level 2"). */
  name: string
  /** 'Active' | 'Training' | 'Expired' (other statuses are not fetched). */
  status: string
  /** Expiration calendar date, ISO yyyy-mm-dd; null when open-ended. */
  expiration: string | null
}

/** Lower wins the (capid, qual) slot: Training/Active suppress Expired. */
const QUAL_STATUS_PRIORITY: Readonly<Record<string, number>> = {
  ACTIVE: 0,
  TRAINING: 1,
  EXPIRED: 2,
}

/** asOf shifted by whole days, as an ISO calendar day for string comparison. */
function shiftedIsoDay(asOf: Date, days: number): string {
  const d = new Date(asOf)
  d.setDate(d.getDate() + days)
  return isoDate(d) ?? ''
}

export interface QualFindingCounts {
  expiredQuals: ExpiredQualCount[]
  qualsExpiring30: number
}

/**
 * Expired/expiring counts over a DEDUPED basis: per (capid, qual name) only
 * the best-status row counts (Active beats Training beats Expired; ties keep
 * the latest expiration). The stored es_summary dedupes seniors but not
 * cadets, so counting raw rows double-counted every cadet who held both a
 * Training and an Expired row for the same qualification.
 */
export function qualFindingCountsOf(
  rows: readonly QualStatusRow[],
  asOf: Date,
): QualFindingCounts {
  const best = new Map<string, QualStatusRow>()
  for (const row of rows) {
    const key = `${row.capid}|${row.name}`
    const current = best.get(key)
    if (current === undefined) {
      best.set(key, row)
      continue
    }
    const rowPriority = QUAL_STATUS_PRIORITY[row.status.toUpperCase()] ?? 9
    const currentPriority = QUAL_STATUS_PRIORITY[current.status.toUpperCase()] ?? 9
    if (
      rowPriority < currentPriority ||
      (rowPriority === currentPriority && (row.expiration ?? '') > (current.expiration ?? ''))
    ) {
      best.set(key, row)
    }
  }

  const day = isoDate(asOf) ?? ''
  const day60Back = shiftedIsoDay(asOf, -60)
  const day30Out = shiftedIsoDay(asOf, 30)
  const expiredByName = new Map<string, number>()
  let qualsExpiring30 = 0
  for (const row of best.values()) {
    if (row.expiration === null) continue
    const status = row.status.toUpperCase()
    if (status === 'EXPIRED' && row.expiration < day && row.expiration >= day60Back) {
      expiredByName.set(row.name, (expiredByName.get(row.name) ?? 0) + 1)
    }
    if (status === 'ACTIVE' && row.expiration >= day && row.expiration <= day30Out) {
      qualsExpiring30++
    }
  }
  const expiredQuals = [...expiredByName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { expiredQuals, qualsExpiring30 }
}

// --- Pure: cadet fact counting (shared fetch for three findings) ---

export interface CadetFactRow {
  facts: CadetStateFacts
  tigCompleteOn: Date | string | null
  hfzValidUntil: Date | string | null
}

export interface CadetFindingCounts {
  hfzBeforeTig: number
  cadetsReady: number
  tigWithin14: number
}

function toTime(value: Date | string | null): number | null {
  if (value === null) return null
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * One pass over the scope's cadet fact rows: the HFZ-before-TIG collision
 * (window closes before the future TIG date arrives), READY cadets awaiting a
 * board, and TIME_PENDING cadets whose eligibility lands within 14 days.
 */
export function cadetFindingCountsOf(
  rows: readonly CadetFactRow[],
  asOf: Date,
): CadetFindingCounts {
  let hfzBeforeTig = 0
  let cadetsReady = 0
  let tigWithin14 = 0
  for (const row of rows) {
    const state = deriveCadetState(row.facts, asOf)
    if (state === 'READY') cadetsReady++
    if (state === 'TIME_PENDING') {
      const days = daysUntil(row.facts.tigEligibleOn, asOf)
      if (days !== null && days >= 0 && days <= 14) tigWithin14++
    }
    const tig = toTime(row.tigCompleteOn)
    const hfz = toTime(row.hfzValidUntil)
    if (tig !== null && hfz !== null && tig > asOf.getTime() && hfz < tig) hfzBeforeTig++
  }
  return { hfzBeforeTig, cadetsReady, tigWithin14 }
}

// --- Pure: Unit Overview figure-strip shapers (consumed by orgs.ts) ---

export interface OrgMeetingSourceRow {
  meetDay: string | null
  meetTime: string | null
  descr: string | null
  /** ISO date of a one-off activity row; the recurring row carries null. */
  activityDate: string | null
}

function titleWord(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * "Meets Thursdays 18:30, Riverside Armory" from OrgMeetings rows. Prefers a
 * recurring row (no ActivityDate) with a meeting day; returns null when the
 * unit records nothing usable (NOT RECORDED renders as silence, never red).
 */
export function meetingLineOf(rows: readonly OrgMeetingSourceRow[]): string | null {
  const usable = rows.filter(
    r => (r.meetDay ?? '').trim() !== '' || (r.meetTime ?? '').trim() !== '',
  )
  if (usable.length === 0) return null
  const row =
    usable.find(r => r.activityDate === null && (r.meetDay ?? '').trim() !== '') ??
    usable.find(r => r.activityDate === null) ??
    (usable[0] as OrgMeetingSourceRow)

  const day = (row.meetDay ?? '').trim()
  const time = (row.meetTime ?? '').trim()
  const descr = (row.descr ?? '').trim()

  let line: string
  if (day !== '') {
    const dayWord = day.split(/\s+/).map(titleWord).join(' ')
    const plural = /s$/i.test(dayWord) ? dayWord : `${dayWord}s`
    line = time !== '' ? `Meets ${plural} ${time}` : `Meets ${plural}`
  } else {
    line = `Meets at ${time}`
  }
  return descr !== '' ? `${line}, ${descr}` : line
}

/** Last 12 monthly combined totals for the sparkline, oldest first. */
export function strengthSeriesOf(
  orgStats: Jsonified<UnitOrgStatsMetrics> | null,
): StrengthPoint[] {
  if (orgStats === null) return []
  return orgStats.monthlyData.slice(-12).map(m => ({
    month: m.date.slice(0, 7),
    total: m.combined.total,
  }))
}

/** Combined membership now minus 12 months ago; null without 12 months of data. */
export function strengthDeltaOf(orgStats: Jsonified<UnitOrgStatsMetrics> | null): number | null {
  if (orgStats === null || orgStats.summary.yearAgoTotal === null) return null
  return orgStats.summary.currentTotal - orgStats.summary.yearAgoTotal
}

// --- DB loaders ---

interface DbQualStatusRow {
  capid: number
  name: string | null
  status: string | null
  expiration: string | null
}

interface DbMembershipRow {
  expired: number
  in30: number
  in60: number
}

interface DbCountRow {
  n: number
}

interface DbCadetFactsRow {
  cadet_state_facts: unknown
  tig_complete_on: Date | null
  hfz_valid_until: Date | null
}

/**
 * Aggregate every finding source for the scope in a handful of queries.
 * "Today" is the app-local calendar day derived once from asOf (api/util.ts
 * isoDate) and passed into every date-window query as a parameter; nothing
 * here leans on the database session's CURRENT_DATE or on UTC, so the day
 * boundary matches the TZ the app runs in.
 */
export async function loadFindingSources(
  scopeOrgids: readonly number[],
  asOf: Date,
): Promise<Omit<FindingSources, 'spofPositions'>> {
  const day = isoDate(asOf) ?? asOf.toISOString().slice(0, 10)
  const [qualRes, membershipRes, cadetRes, approvalRes] = await Promise.all([
    // Raw dashboard-view qual rows; the dedupe + window counting is pure
    // (qualFindingCountsOf) so the suppress-Expired rule is unit-tested.
    pool.query<DbQualStatusRow>(
      `SELECT m.capid, q->>'name' AS name, q->>'status' AS status,
              left(q->>'expiration', 10) AS expiration
       FROM computed_member m
       CROSS JOIN LATERAL jsonb_array_elements(m.es_summary->'qualifications') q
       WHERE m.orgid = ANY($1::int[])
         AND q->>'status' IN ('Active', 'Training', 'Expired')
         AND coalesce(q->>'name', '') <> ''`,
      [scopeOrgids],
    ),
    pool.query<DbMembershipRow>(
      `SELECT
         count(*) FILTER (WHERE expiration < $2::date)::int AS expired,
         count(*) FILTER (WHERE expiration >= $2::date
                            AND expiration <= $2::date + 30)::int AS in30,
         count(*) FILTER (WHERE expiration > $2::date + 30
                            AND expiration <= $2::date + 60)::int AS in60
       FROM computed_member
       WHERE orgid = ANY($1::int[]) AND expiration IS NOT NULL`,
      [scopeOrgids, day],
    ),
    pool.query<DbCadetFactsRow>(
      `SELECT cadet_state_facts, tig_complete_on, hfz_valid_until
       FROM computed_member
       WHERE is_cadet_scope AND cadet_state_facts IS NOT NULL
         AND orgid = ANY($1::int[])`,
      [scopeOrgids],
    ),
    pool.query<DbCountRow>(
      `SELECT count(DISTINCT c.capid)::int AS n
       FROM pl_member_path_credit c
       JOIN computed_member m ON m.capid = c.capid
       WHERE m.is_senior_scope AND m.orgid = ANY($1::int[]) AND c.status_id = 26`,
      [scopeOrgids],
    ),
  ])

  const qualRows: QualStatusRow[] = qualRes.rows.flatMap(r =>
    r.name !== null && r.name !== '' && r.status !== null
      ? [{ capid: r.capid, name: r.name, status: r.status, expiration: r.expiration }]
      : [],
  )
  const qualCounts = qualFindingCountsOf(qualRows, asOf)

  const cadetRows: CadetFactRow[] = cadetRes.rows.map(r => ({
    facts: r.cadet_state_facts as CadetStateFacts,
    tigCompleteOn: r.tig_complete_on,
    hfzValidUntil: r.hfz_valid_until,
  }))
  const cadetCounts = cadetFindingCountsOf(cadetRows, asOf)
  const membership = membershipRes.rows[0] ?? { expired: 0, in30: 0, in60: 0 }

  return {
    expiredQuals: qualCounts.expiredQuals,
    expiredMemberships: membership.expired,
    membershipsExpiring30: membership.in30,
    membershipsExpiring60: membership.in60,
    qualsExpiring30: qualCounts.qualsExpiring30,
    ...cadetCounts,
    seniorsAwaitingApproval: approvalRes.rows[0]?.n ?? 0,
  }
}

/**
 * Full engine: aggregate the sources for the scope (SPOF positions come from
 * the computed_org es jsonb for the same self/subtree granularity the
 * overview serves) and rank them. role is passed through to rankFindings.
 */
export async function computeFindings(
  ctx: {
    orgid: number
    descendants: boolean
    scopeOrgids: readonly number[]
  },
  role: Role,
  asOf: Date,
): Promise<Finding[]> {
  const [partial, computed] = await Promise.all([
    loadFindingSources(ctx.scopeOrgids, asOf),
    loadComputedOrg(ctx.orgid, ctx.descendants ? 'subtree' : 'self'),
  ])
  const spofPositions =
    computed?.es.risks.singlePointsOfFailure.map(s => s.positionName) ?? []
  return rankFindings(
    { ...partial, spofPositions },
    ctx.orgid,
    ctx.descendants,
    role,
  )
}

// --- Route ---

async function handleFindings(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const findings = await computeFindings(
    { orgid: ctx.orgid, descendants: ctx.descendants, scopeOrgids: ctx.scopeOrgids },
    req.rhSession?.role ?? 'viewer',
    new Date(),
  )
  const body: FindingsResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    findings,
  }
  reply.send(body)
}

export function registerFindingsRoutes(app: FastifyInstance): void {
  app.get('/api/orgs/:orgid/findings', { preHandler: requireAuth }, handleFindings)
}
