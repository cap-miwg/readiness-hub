/**
 * Announcements (V2-DESIGN-PLAN.md section 5): an admin write surface with a
 * fixed schema and a deliberately small blast radius.
 *
 * Security spec, verbatim from the plan: fixed schema (title, body, dates),
 * body stored and served as PLAIN TEXT (the web renders line breaks only,
 * never HTML or Markdown), requireAdmin + the global admin CSRF header on
 * every mutation, every mutation audit-logged, no rich media, no runtime
 * uploads. Reads are available to every authenticated user.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { audit } from '../auth/audit.js'
import { requireAdmin, requireAuth } from '../auth/guard.js'
import type {
  AdminAnnouncementsResponse,
  Announcement,
  AnnouncementMutationResponse,
  AnnouncementsResponse,
} from '../shared/contracts.js'
import { isoDate, parseIntParam } from './util.js'

const ADMIN_GUARDS = [requireAuth, requireAdmin]

export const ANNOUNCEMENT_TITLE_MAX = 120
export const ANNOUNCEMENT_BODY_MAX = 2000
const ACTIVE_LIMIT = 10
const ADMIN_LIMIT = 200

// --- Validation (pure; exercised by server/test/announcements coverage) ---

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (yyyy-mm-dd)')

const baseShape = {
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  // Plain text only by contract; newlines are the one formatting primitive.
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
  startsAt: isoDay.nullish(),
  endsAt: isoDay.nullish(),
}

function dateOrderCheck(
  value: { startsAt?: string | null | undefined; endsAt?: string | null | undefined },
  ctx: z.RefinementCtx,
): void {
  if (
    value.startsAt !== null &&
    value.startsAt !== undefined &&
    value.endsAt !== null &&
    value.endsAt !== undefined &&
    value.endsAt < value.startsAt
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'endsAt must not be before startsAt',
    })
  }
}

export const announcementCreateSchema = z.object(baseShape).strict().superRefine(dateOrderCheck)

export const announcementUpdateSchema = z
  .object({ ...baseShape, archived: z.boolean().optional() })
  .strict()
  .superRefine(dateOrderCheck)

function issuesOf(error: z.ZodError): string {
  return error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
}

/**
 * Active-window test against an injected calendar day (inclusive on both
 * ends): not archived, startsAt passed (or unset), endsAt not passed. The day
 * is computed once per request from app-local time (api/util.ts isoDate), so
 * the boundary matches the TZ the app runs in rather than the database
 * session's CURRENT_DATE (a UTC container turned announcements over up to
 * five hours early in America/New_York).
 */
export function announcementActiveOn(
  a: Pick<Announcement, 'archived' | 'startsAt' | 'endsAt'>,
  day: string,
): boolean {
  if (a.archived) return false
  if (a.startsAt !== null && a.startsAt > day) return false
  if (a.endsAt !== null && a.endsAt < day) return false
  return true
}

// --- Row mapping ---

interface DbAnnouncementRow {
  id: number
  created_at: Date
  author_email: string
  title: string
  body: string
  starts_at: Date | null
  ends_at: Date | null
  archived: boolean
}

const ANNOUNCEMENT_COLUMNS =
  'id::int AS id, created_at, author_email, title, body, starts_at, ends_at, archived'

function announcementOf(r: DbAnnouncementRow): Announcement {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    authorEmail: r.author_email,
    title: r.title,
    body: r.body,
    startsAt: isoDate(r.starts_at),
    endsAt: isoDate(r.ends_at),
    archived: r.archived,
  }
}

function actorOf(req: FastifyRequest): string {
  return req.rhSession?.email ?? 'unknown'
}

// --- Handlers ---

/**
 * Active window (announcementActiveOn) against the app-local day, passed as
 * a parameter rather than read from the database's CURRENT_DATE.
 */
async function handleList(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const day = isoDate(new Date()) ?? new Date().toISOString().slice(0, 10)
  const res = await pool.query<DbAnnouncementRow>(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements
     WHERE NOT archived
       AND (starts_at IS NULL OR starts_at <= $1::date)
       AND (ends_at IS NULL OR ends_at >= $1::date)
     ORDER BY created_at DESC, id DESC
     LIMIT ${ACTIVE_LIMIT}`,
    [day],
  )
  const body: AnnouncementsResponse = {
    announcements: res.rows.map(announcementOf).filter(a => announcementActiveOn(a, day)),
  }
  reply.send(body)
}

async function handleAdminList(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const res = await pool.query<DbAnnouncementRow>(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements
     ORDER BY created_at DESC, id DESC
     LIMIT ${ADMIN_LIMIT}`,
  )
  const body: AdminAnnouncementsResponse = { announcements: res.rows.map(announcementOf) }
  reply.send(body)
}

async function handleCreate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = announcementCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    reply.code(400).send({ error: `invalid announcement: ${issuesOf(parsed.error)}` })
    return
  }
  const { title, body, startsAt, endsAt } = parsed.data
  const res = await pool.query<DbAnnouncementRow>(
    `INSERT INTO announcements (author_email, title, body, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${ANNOUNCEMENT_COLUMNS}`,
    [actorOf(req), title, body, startsAt ?? null, endsAt ?? null],
  )
  const row = res.rows[0]
  if (row === undefined) {
    reply.code(500).send({ error: 'announcement insert failed' })
    return
  }
  await audit(actorOf(req), 'admin.announcements.create', { id: row.id, title })
  const response: AnnouncementMutationResponse = { announcement: announcementOf(row) }
  reply.send(response)
}

async function handleUpdate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = parseIntParam((req.params as Record<string, unknown>)['id'])
  if (id === null) {
    reply.code(400).send({ error: 'id must be an integer' })
    return
  }
  const parsed = announcementUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    reply.code(400).send({ error: `invalid announcement: ${issuesOf(parsed.error)}` })
    return
  }
  const { title, body, startsAt, endsAt, archived } = parsed.data
  const res = await pool.query<DbAnnouncementRow>(
    `UPDATE announcements
     SET title = $2, body = $3, starts_at = $4, ends_at = $5,
         archived = COALESCE($6, archived)
     WHERE id = $1
     RETURNING ${ANNOUNCEMENT_COLUMNS}`,
    [id, title, body, startsAt ?? null, endsAt ?? null, archived ?? null],
  )
  const row = res.rows[0]
  if (row === undefined) {
    reply.code(404).send({ error: `no announcement ${id}` })
    return
  }
  await audit(actorOf(req), 'admin.announcements.update', {
    id,
    title,
    archived: row.archived,
  })
  const response: AnnouncementMutationResponse = { announcement: announcementOf(row) }
  reply.send(response)
}

async function handleDelete(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = parseIntParam((req.params as Record<string, unknown>)['id'])
  if (id === null) {
    reply.code(400).send({ error: 'id must be an integer' })
    return
  }
  const res = await pool.query<{ id: number; title: string }>(
    'DELETE FROM announcements WHERE id = $1 RETURNING id::int AS id, title',
    [id],
  )
  const row = res.rows[0]
  if (row === undefined) {
    reply.code(404).send({ error: `no announcement ${id}` })
    return
  }
  await audit(actorOf(req), 'admin.announcements.delete', { id, title: row.title })
  reply.send({ ok: true })
}

export function registerAnnouncementRoutes(app: FastifyInstance): void {
  app.get('/api/announcements', { preHandler: requireAuth }, handleList)
  app.get('/api/admin/announcements', { preHandler: ADMIN_GUARDS }, handleAdminList)
  app.post('/api/admin/announcements', { preHandler: ADMIN_GUARDS }, handleCreate)
  app.put('/api/admin/announcements/:id', { preHandler: ADMIN_GUARDS }, handleUpdate)
  app.delete('/api/admin/announcements/:id', { preHandler: ADMIN_GUARDS }, handleDelete)
}
