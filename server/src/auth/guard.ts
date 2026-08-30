import type { FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { readSession, touchSession, SESSION_COOKIE, type SessionRow } from './session.js'

declare module 'fastify' {
  interface FastifyRequest {
    rhSession?: SessionRow
  }
}

/** preHandler: 401 JSON unless a live session exists; attaches req.rhSession. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = req.cookies[SESSION_COOKIE]
  if (id) {
    const session = await readSession(id)
    if (session) {
      req.rhSession = await touchSession(session)
      return
    }
  }
  reply.code(401).send({ error: 'unauthorized' })
}

/** preHandler, ordered after requireAuth: 403 JSON unless the session is admin. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.rhSession) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }
  if (req.rhSession.role !== 'admin') {
    reply.code(403).send({ error: 'admin required' })
  }
}

export interface CsrfInput {
  method: string
  /** Request path without the query string. */
  path: string
  originHeader: string | undefined
  refererHeader: string | undefined
  /** Value of the x-rh-csrf header, if any. */
  csrfHeader: string | undefined
  /** host (hostname:port) of the deployment BASE_URL. */
  baseHost: string
  /** Host header of the request itself, if any. */
  requestHost?: string | undefined
}

export type CsrfResult = { ok: true } | { ok: false; reason: string }

function hostOf(value: string): string | null {
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

/**
 * Browser-enforced headers are the CSRF anchor: Origin (preferred) or Referer
 * must name this deployment's host. A request carrying neither is
 * indistinguishable from a cross-site form post and is rejected. Admin
 * mutations additionally require x-rh-csrf: 1, a header only same-origin
 * script can set.
 */
export function csrfDecision(input: CsrfInput): CsrfResult {
  const method = input.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { ok: true }
  const source = input.originHeader ?? input.refererHeader
  if (source === undefined) {
    return { ok: false, reason: 'missing Origin and Referer on a state-changing request' }
  }
  const sourceHost = hostOf(source)
  // Same-origin means the configured BASE_URL host, or the host the request
  // itself arrived on (covers the Vite dev proxy and direct-port access
  // behind a reverse proxy; the browser sets Origin, not the attacker).
  const allowed = sourceHost !== null && (sourceHost === input.baseHost || sourceHost === input.requestHost)
  if (!allowed) {
    return { ok: false, reason: 'cross-origin request rejected' }
  }
  if (input.path === '/api/admin' || input.path.startsWith('/api/admin/')) {
    if (input.csrfHeader !== '1') {
      return { ok: false, reason: 'missing x-rh-csrf header on admin mutation' }
    }
  }
  return { ok: true }
}

/** Global onRequest hook enforcing csrfDecision for every route. */
export function csrfProtect(baseUrl: string) {
  const baseHost = new URL(baseUrl).host
  return async function csrfHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const csrfHeader = req.headers['x-rh-csrf']
    const result = csrfDecision({
      method: req.method,
      path: req.url.split('?')[0] ?? req.url,
      originHeader: req.headers.origin,
      refererHeader: req.headers.referer,
      csrfHeader: Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader,
      baseHost,
      requestHost: req.headers.host,
    })
    if (!result.ok) {
      reply.code(403).send({ error: result.reason })
    }
  }
}

function orgParamOf(req: FastifyRequest): string | null {
  const fromParams = (req.params as Record<string, unknown> | undefined)?.['orgid']
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.['orgid']
  const value = fromParams ?? fromQuery
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

/**
 * Global onResponse hook: one access_log row per authenticated /api request.
 * Fire-and-forget; logging failure never affects the response.
 */
export function accessLog() {
  return function accessLogHook(
    req: FastifyRequest,
    _reply: FastifyReply,
    done: () => void,
  ): void {
    const session = req.rhSession
    if (session && req.url.startsWith('/api')) {
      const route = req.routeOptions.url ?? req.url.split('?')[0] ?? req.url
      void pool
        .query('INSERT INTO access_log (email, method, route, org_param) VALUES ($1, $2, $3, $4)', [
          session.email,
          req.method,
          route,
          orgParamOf(req),
        ])
        .catch(() => {})
    }
    done()
  }
}
