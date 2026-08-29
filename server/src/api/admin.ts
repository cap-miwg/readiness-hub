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
} from '../shared/contracts.js'
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

const settingsSchema = z
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
  })
  .strict()

async function upsertSetting(key: string, value: string[]): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

async function handleGetSettings(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const settings = await loadOrgSettings()
  const body: AdminSettingsResponse = {
    excludedUnits: settings.excludedUnits,
    memberTypes: settings.memberTypes,
  }
  reply.send(body)
}

async function handlePutSettings(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    reply.code(400).send({ error: `invalid settings: ${issues}` })
    return
  }
  const { excludedUnits, memberTypes } = parsed.data
  if (excludedUnits === undefined && memberTypes === undefined) {
    reply.code(400).send({ error: 'provide excludedUnits and/or memberTypes' })
    return
  }
  if (excludedUnits !== undefined) {
    await upsertSetting('org.excluded_units', excludedUnits.map(u => u.trim()))
  }
  if (memberTypes !== undefined) {
    await upsertSetting('org.member_types', memberTypes.map(t => t.trim().toUpperCase()))
  }
  await audit(actorOf(req), 'admin.settings.update', {
    excludedUnits: excludedUnits ?? null,
    memberTypes: memberTypes ?? null,
  })
  const settings = await loadOrgSettings()
  const body: AdminSettingsResponse = {
    excludedUnits: settings.excludedUnits,
    memberTypes: settings.memberTypes,
  }
  reply.send(body)
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
  app.get('/api/admin/audit', { preHandler: ADMIN_GUARDS }, handleAudit)
  app.get('/api/admin/settings', { preHandler: ADMIN_GUARDS }, handleGetSettings)
  app.put('/api/admin/settings', { preHandler: ADMIN_GUARDS }, handlePutSettings)
}
