import { randomBytes } from 'node:crypto'
import type { CookieSerializeOptions } from '@fastify/cookie'
import { pool } from '../db/pool.js'
import type { Role } from '../shared/contracts.js'

export const SESSION_COOKIE = 'rh_session'

export const SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const TOUCH_INTERVAL_MS = 10 * 60 * 1000

export interface SessionRow {
  id: string
  email: string
  name: string
  role: Role
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

export function newSessionId(): string {
  return randomBytes(16).toString('hex')
}

/** Sliding 7-day expiry, capped at 30 days from session creation. */
export function expiryFor(createdAt: Date, asOf: Date): Date {
  return new Date(
    Math.min(asOf.getTime() + SLIDING_TTL_MS, createdAt.getTime() + ABSOLUTE_TTL_MS),
  )
}

export function isExpired(
  session: Pick<SessionRow, 'createdAt' | 'expiresAt'>,
  asOf: Date,
): boolean {
  return (
    asOf.getTime() >= session.expiresAt.getTime() ||
    asOf.getTime() >= session.createdAt.getTime() + ABSOLUTE_TTL_MS
  )
}

/** Sliding-expiry writes are rate-limited to one per session per interval. */
export function shouldTouch(lastSeenAt: Date, asOf: Date): boolean {
  return asOf.getTime() - lastSeenAt.getTime() >= TOUCH_INTERVAL_MS
}

export function sessionCookieOptions(baseUrl: string): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: baseUrl.startsWith('https'),
    path: '/',
    maxAge: Math.floor(ABSOLUTE_TTL_MS / 1000),
  }
}

interface DbSessionRow {
  id: string
  email: string
  name: string
  role: string
  created_at: Date
  last_seen_at: Date
  expires_at: Date
}

function fromDb(row: DbSessionRow): SessionRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'viewer',
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
  }
}

export async function createSession(
  user: { email: string; name: string; role: Role },
  asOf: Date = new Date(),
): Promise<SessionRow> {
  const id = newSessionId()
  const expiresAt = expiryFor(asOf, asOf)
  await pool.query(
    `INSERT INTO sessions (id, email, name, role, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6)`,
    [id, user.email, user.name, user.role, asOf, expiresAt],
  )
  return {
    id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: asOf,
    lastSeenAt: asOf,
    expiresAt,
  }
}

/** Returns null (and deletes the row) when the session is expired. */
export async function readSession(
  id: string,
  asOf: Date = new Date(),
): Promise<SessionRow | null> {
  const res = await pool.query<DbSessionRow>(
    `SELECT id, email, name, role, created_at, last_seen_at, expires_at
     FROM sessions WHERE id = $1`,
    [id],
  )
  const row = res.rows[0]
  if (!row) return null
  const session = fromDb(row)
  if (isExpired(session, asOf)) {
    await deleteSession(id)
    return null
  }
  return session
}

/** Slides the expiry window; a no-op within TOUCH_INTERVAL_MS of the last touch. */
export async function touchSession(
  session: SessionRow,
  asOf: Date = new Date(),
): Promise<SessionRow> {
  if (!shouldTouch(session.lastSeenAt, asOf)) return session
  const expiresAt = expiryFor(session.createdAt, asOf)
  await pool.query('UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1', [
    session.id,
    asOf,
    expiresAt,
  ])
  return { ...session, lastSeenAt: asOf, expiresAt }
}

export async function deleteSession(id: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE id = $1', [id])
}

/** Admin revoke-all: invalidates every session, including the caller's. */
export async function deleteAllSessions(): Promise<number> {
  const res = await pool.query('DELETE FROM sessions')
  return res.rowCount ?? 0
}
