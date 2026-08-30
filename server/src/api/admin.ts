/**
 * Admin endpoints (requireAuth + requireAdmin; the global CSRF hook already
 * demands same-origin plus x-rh-csrf on every /api/admin mutation). Every
 * mutation writes an audit_log row with no member data in the detail.
 */

import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { z } from 'zod'
import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { audit } from '../auth/audit.js'
import { requireAdmin, requireAuth } from '../auth/guard.js'
import { fetchCapwatchZip } from '../ingest/fetcher.js'
import { clearAuthFailureMarker } from '../ingest/scheduler.js'
import { ADOPTION_TABLES } from '../ingest/tables.js'
import {
  ingestAdoptionCsvs,
  ingestZip,
  type IngestLog,
  type IngestResult,
} from '../ingest/run.js'
import type {
  AdminSettingsResponse,
  AuditEntry,
  AuditResponse,
  IngestFileStat,
  IngestResponse,
  IngestRunSummary,
  UsageDailyPoint,
  UsageResponse,
  UsageRouteCount,
} from '../shared/contracts.js'
import { loadStaleHours, STALE_HOURS_MAX, STALE_HOURS_MIN } from './meta.js'
import { loadOrgSettings } from './scope.js'
import { isoTimestamp, parseBoolParam } from './util.js'

const ADMIN_GUARDS = [requireAuth, requireAdmin]

/** Room for the 250 MB zip cap plus multipart framing (docs/ARCHITECTURE.md, Ingest). */
const UPLOAD_BODY_LIMIT = 260 * 1024 * 1024
const ADOPTION_FILE_LIMIT = 50 * 1024 * 1024

function asIngestLog(log: FastifyBaseLogger): IngestLog {
  return {
    info: m => log.info(m),
    warn: m => log.warn(m),
    error: m => log.error(m),
  }
}

function ingestResponseOf(result: IngestResult): IngestResponse {
  return {
    ok: result.ok,
    runId: result.runId,
    anchorOrgid: result.anchorOrgid,
    downloadDate: isoTimestamp(result.downloadDate),
    fileStats: result.fileStats,
    skippedEntries: result.skippedEntries,
    error: result.error,
  }
}

function actorOf(req: FastifyRequest): string {
  return req.rhSession?.email ?? 'unknown'
}

/**
 * Dev auth is a user picker, so real-data ingest is refused unless the
 * operator opted in explicitly; the same check lives in ingest/run.ts, this
 * one just surfaces it as a clean 403 before the upload is read.
 */
function devIngestRefused(reply: FastifyReply): boolean {
  if (config.AUTH_MODE === 'dev' && !config.DEV_ALLOW_REAL_INGEST) {
    reply.code(403).send({
      error:
        'AUTH_MODE=dev refuses real-data ingest. Set DEV_ALLOW_REAL_INGEST=true to override, or seed the demo fixture instead.',
    })
    return true
  }
  return false
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500)
}

async function handleIngestUpload(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (devIngestRefused(reply)) return
  if (!req.isMultipart()) {
    reply.code(400).send({ error: 'multipart/form-data with a zip file required' })
    return
  }
  const force = parseBoolParam((req.query as Record<string, unknown>)['force'])

  let file: MultipartFile | undefined
  let zipBuf: Buffer
  try {
    file = await req.file()
    if (file === undefined) {
      reply.code(400).send({ error: 'multipart zip file required' })
      return
    }
    zipBuf = await file.toBuffer()
  } catch {
    reply.code(413).send({ error: 'upload exceeded the size limit' })
    return
  }

  try {
    const result = await ingestZip(zipBuf, { source: 'upload', force }, asIngestLog(req.log))
    await audit(actorOf(req), 'admin.ingest.upload', {
      runId: result.runId,
      ok: result.ok,
      forced: force,
      error: result.error,
    })
    reply.send(ingestResponseOf(result))
  } catch (err) {
    const message = errorMessage(err)
    await audit(actorOf(req), 'admin.ingest.upload', { ok: false, forced: force, error: message })
    reply.code(500).send({ error: `ingest failed: ${message}` })
  }
}

async function handleIngestFetch(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (devIngestRefused(reply)) return
  const force = parseBoolParam((req.query as Record<string, unknown>)['force'])

  const fetched = await fetchCapwatchZip()
  if (fetched.kind !== 'ok') {
    await audit(actorOf(req), 'admin.ingest.fetch', {
      ok: false,
      stage: fetched.kind,
      error: fetched.message,
    })
    reply.code(502).send({ error: fetched.message })
    return
  }

  // A successful fetch proves the credentials work; clear the scheduler's
  // persisted auth-failure marker so scheduled fetches resume.
  await clearAuthFailureMarker().catch(err =>
    req.log.warn(`could not clear the auth-failure marker: ${errorMessage(err)}`),
  )

  try {
    const result = await ingestZip(fetched.zip, { source: 'fetch', force }, asIngestLog(req.log))
    await audit(actorOf(req), 'admin.ingest.fetch', {
      runId: result.runId,
      ok: result.ok,
      forced: force,
      error: result.error,
    })
    reply.send(ingestResponseOf(result))
  } catch (err) {
    const message = errorMessage(err)
    await audit(actorOf(req), 'admin.ingest.fetch', { ok: false, forced: force, error: message })
    reply.code(500).send({ error: `ingest failed: ${message}` })
  }
}

/** Uploaded part -> registry filename (GoogleAdoptionStats.csv / GoogleAdoptionUsers.csv). */
function adoptionFileNameOf(part: MultipartFile): string | null {
  const byName = ADOPTION_TABLES.find(
    t => t.file.toLowerCase() === (part.filename ?? '').toLowerCase(),
  )
  if (byName !== undefined) return byName.file
  const field = part.fieldname.toLowerCase()
  if (field === 'stats') return 'GoogleAdoptionStats.csv'
  if (field === 'users') return 'GoogleAdoptionUsers.csv'
  return null
}

async function handleIngestAdoption(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (devIngestRefused(reply)) return
  if (!req.isMultipart()) {
    reply.code(400).send({ error: 'multipart/form-data with the adoption CSVs required' })
    return
  }

  const buffers = new Map<string, Buffer>()
  const unrecognized: string[] = []
  try {
    for await (const part of req.files({ limits: { files: 2, fileSize: ADOPTION_FILE_LIMIT } })) {
      const name = adoptionFileNameOf(part)
      if (name === null) {
        unrecognized.push(part.filename ?? part.fieldname)
        await part.toBuffer()
        continue
      }
      buffers.set(name, await part.toBuffer())
    }
  } catch {
    reply.code(413).send({ error: 'upload exceeded the size limit' })
    return
  }
  if (buffers.size === 0) {
    reply.code(400).send({
      error: `no recognized adoption CSVs; expected ${ADOPTION_TABLES.map(t => t.file).join(' and/or ')}${unrecognized.length > 0 ? ` (got ${unrecognized.join(', ')})` : ''}`,
    })
    return
  }

  try {
    const result = await ingestAdoptionCsvs(buffers, { source: 'upload' }, asIngestLog(req.log))
    await audit(actorOf(req), 'admin.ingest.adoption', {
      runId: result.runId,
      ok: result.ok,
      files: [...buffers.keys()],
      error: result.error,
    })
    reply.send(ingestResponseOf(result))
  } catch (err) {
    const message = errorMessage(err)
    await audit(actorOf(req), 'admin.ingest.adoption', { ok: false, error: message })
    reply.code(500).send({ error: `adoption ingest failed: ${message}` })
  }
}

interface DbRunRow {
  id: number
  started_at: Date
  finished_at: Date | null
  status: string
  source: string
  download_date: Date | null
  file_stats: unknown
  error: string | null
  forced: boolean
}

function runSummaryOf(r: DbRunRow): IngestRunSummary {
  const stats = r.file_stats as {
    files?: IngestFileStat[]
    skippedEntries?: string[]
  } | null
  return {
    id: r.id,
    startedAt: r.started_at.toISOString(),
    finishedAt: isoTimestamp(r.finished_at),
    status:
      r.status === 'succeeded' || r.status === 'failed' || r.status === 'aborted'
        ? r.status
        : 'running',
    source:
      r.source === 'fetch' || r.source === 'cli' || r.source === 'demo' ? r.source : 'upload',
    downloadDate: isoTimestamp(r.download_date),
    fileStats:
      stats !== null && Array.isArray(stats.files)
        ? { files: stats.files, skippedEntries: stats.skippedEntries ?? [] }
        : null,
    error: r.error,
    forced: r.forced,
  }
}

async function handleRuns(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const res = await pool.query<DbRunRow>(
    `SELECT id::int AS id, started_at, finished_at, status, source, download_date,
            file_stats, error, forced
     FROM ingest_runs ORDER BY started_at DESC LIMIT 50`,
  )
  reply.send({ runs: res.rows.map(runSummaryOf) })
}

interface DbAuditRow {
  id: number
  at: Date
  actor_email: string
  action: string
  detail: unknown
}

async function handleAudit(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const res = await pool.query<DbAuditRow>(
    `SELECT id::int AS id, at, actor_email, action, detail
     FROM audit_log ORDER BY at DESC, id DESC LIMIT 200`,
  )
  const entries: AuditEntry[] = res.rows.map(r => ({
    id: r.id,
    at: r.at.toISOString(),
    actorEmail: r.actor_email,
    action: r.action,
    detail: (r.detail as Record<string, unknown> | null) ?? {},
  }))
  const body: AuditResponse = { entries }
  reply.send(body)
}

// --- Usage panel (V2-DESIGN-PLAN.md section 10) ---
//
// The pure pieces below (normalizeRoute, topRoutesOf, fillDailySeries) are
// exported for server/test/adminUsage.test.ts; the handler only runs SQL and
// glues them together.

export const USAGE_DAILY_DAYS = 30
export const USAGE_TOP_ROUTES = 8

/**
 * Collapse an access_log route to a stable pattern. Fastify writes the route
 * pattern (/api/orgs/:orgid/seniors) when the route resolved, but raw URLs can
 * land in the log too (fallback path in auth/guard.ts accessLog), so both
 * '/api/orgs/1234/seniors?duty=IT' and the pattern form must share a bucket.
 */
export function normalizeRoute(route: string): string {
  const path = route.split('?')[0] ?? route
  return path
    .replace(/^\/api\/orgs\/[^/]+/, '/api/orgs/:orgid')
    .replace(/^\/api\/members\/[^/]+/, '/api/members/:capid')
    .replace(/^\/api\/reports\/[^/]+/, '/api/reports/:id')
    .replace(/^\/api\/admin\/announcements\/[^/]+/, '/api/admin/announcements/:id')
}

/** Aggregate per-route hit counts into normalized buckets, top `limit` by hits. */
export function topRoutesOf(
  rows: readonly { route: string; hits: number }[],
  limit: number,
): UsageRouteCount[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = normalizeRoute(row.route)
    totals.set(key, (totals.get(key) ?? 0) + row.hits)
  }
  return [...totals.entries()]
    .map(([route, hits]) => ({ route, hits }))
    .sort((a, b) => b.hits - a.hits || a.route.localeCompare(b.route))
    .slice(0, limit)
}

function addDays(dayIso: string, delta: number): string {
  const t = Date.parse(`${dayIso}T00:00:00Z`)
  return new Date(t + delta * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Zero-fill a per-day distinct-user series to exactly `days` points ending at
 * `todayIso` inclusive, oldest first, so the sparkline never lies by omission
 * (a day nobody signed in is a 0, not a missing point).
 */
export function fillDailySeries(
  rows: readonly { day: string; users: number }[],
  days: number,
  todayIso: string,
): UsageDailyPoint[] {
  const byDay = new Map(rows.map(r => [r.day, r.users]))
  const out: UsageDailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(todayIso, -i)
    out.push({ day, users: byDay.get(day) ?? 0 })
  }
  return out
}

interface DbUsageTotalsRow {
  d7: number
  d30: number
  d60: number
  requests30: number
  today: string
}

interface DbUsageDailyRow {
  day: string
  users: number
}

interface DbUsageRouteRow {
  route: string
  hits: number
}

async function handleUsage(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // to_char(now(),...) and at::date both bucket on the database session's
  // timezone, so "today" and the daily series share one calendar.
  const [totalsRes, unitsRes, dailyRes, routesRes] = await Promise.all([
    pool.query<DbUsageTotalsRow>(
      `SELECT
         COUNT(DISTINCT email) FILTER (WHERE at >= now() - interval '7 days')::int AS d7,
         COUNT(DISTINCT email) FILTER (WHERE at >= now() - interval '30 days')::int AS d30,
         COUNT(DISTINCT email)::int AS d60,
         COUNT(*) FILTER (WHERE at >= now() - interval '30 days')::int AS requests30,
         to_char(now(), 'YYYY-MM-DD') AS today
       FROM access_log
       WHERE at >= now() - interval '60 days'`,
    ),
    pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT org_param)::int AS n
       FROM access_log
       WHERE org_param IS NOT NULL AND at >= now() - interval '7 days'`,
    ),
    pool.query<DbUsageDailyRow>(
      `SELECT to_char(at::date, 'YYYY-MM-DD') AS day, COUNT(DISTINCT email)::int AS users
       FROM access_log
       WHERE at >= now() - interval '${USAGE_DAILY_DAYS} days'
       GROUP BY 1 ORDER BY 1`,
    ),
    pool.query<DbUsageRouteRow>(
      `SELECT route, COUNT(*)::int AS hits
       FROM access_log
       WHERE at >= now() - interval '30 days'
       GROUP BY route`,
    ),
  ])

  const totals = totalsRes.rows[0]
  const today = totals?.today ?? new Date().toISOString().slice(0, 10)
  const body: UsageResponse = {
    distinctUsers7d: totals?.d7 ?? 0,
    distinctUsers30d: totals?.d30 ?? 0,
    distinctUsers60d: totals?.d60 ?? 0,
    requests30d: totals?.requests30 ?? 0,
    unitsViewed7d: unitsRes.rows[0]?.n ?? 0,
    dailyUsers: fillDailySeries(dailyRes.rows, USAGE_DAILY_DAYS, today),
    topRoutes30d: topRoutesOf(routesRes.rows, USAGE_TOP_ROUTES),
  }
  reply.send(body)
}

/** Exported for the pure zod round-trip coverage in server/test. */
export const settingsSchema = z
  .object({
    excludedUnits: z
      .array(z.string().trim().min(1).max(6).regex(/^[0-9A-Za-z]+$/))
      .max(100)
      .optional(),
    memberTypes: z
      .array(z.string().trim().min(1).max(30).regex(/^[A-Za-z][A-Za-z ]*$/))
      .min(1)
      .max(20)
      .optional(),
    // Feeds MetaResponse.staleAfterHours (the as-of ladder): 6 hours to 7 days.
    staleHours: z.number().int().min(STALE_HOURS_MIN).max(STALE_HOURS_MAX).optional(),
  })
  .strict()

async function upsertSetting(key: string, value: string[] | number): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

async function settingsResponse(): Promise<AdminSettingsResponse> {
  const [settings, staleHours] = await Promise.all([loadOrgSettings(), loadStaleHours()])
  return {
    excludedUnits: settings.excludedUnits,
    memberTypes: settings.memberTypes,
    staleHours,
  }
}

async function handleGetSettings(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.send(await settingsResponse())
}

async function handlePutSettings(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    reply.code(400).send({ error: `invalid settings: ${issues}` })
    return
  }
  const { excludedUnits, memberTypes, staleHours } = parsed.data
  if (excludedUnits === undefined && memberTypes === undefined && staleHours === undefined) {
    reply.code(400).send({ error: 'provide excludedUnits, memberTypes, and/or staleHours' })
    return
  }
  if (excludedUnits !== undefined) {
    await upsertSetting('org.excluded_units', excludedUnits.map(u => u.trim()))
  }
  if (memberTypes !== undefined) {
    await upsertSetting('org.member_types', memberTypes.map(t => t.trim().toUpperCase()))
  }
  if (staleHours !== undefined) {
    await upsertSetting('ingest.stale_hours', staleHours)
  }
  await audit(actorOf(req), 'admin.settings.update', {
    excludedUnits: excludedUnits ?? null,
    memberTypes: memberTypes ?? null,
    staleHours: staleHours ?? null,
  })
  reply.send(await settingsResponse())
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post(
    '/api/admin/ingest',
    { preHandler: ADMIN_GUARDS, bodyLimit: UPLOAD_BODY_LIMIT },
    handleIngestUpload,
  )
  app.post('/api/admin/ingest/fetch', { preHandler: ADMIN_GUARDS }, handleIngestFetch)
  app.post(
    '/api/admin/ingest/adoption',
    { preHandler: ADMIN_GUARDS, bodyLimit: UPLOAD_BODY_LIMIT },
    handleIngestAdoption,
  )
  app.get('/api/admin/runs', { preHandler: ADMIN_GUARDS }, handleRuns)
  app.get('/api/admin/usage', { preHandler: ADMIN_GUARDS }, handleUsage)
  app.get('/api/admin/audit', { preHandler: ADMIN_GUARDS }, handleAudit)
  app.get('/api/admin/settings', { preHandler: ADMIN_GUARDS }, handleGetSettings)
  app.put('/api/admin/settings', { preHandler: ADMIN_GUARDS }, handlePutSettings)
}
