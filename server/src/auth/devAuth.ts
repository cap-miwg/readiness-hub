import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import type { Role } from '../shared/contracts.js'
import { audit } from './audit.js'
import { createSession, sessionCookieOptions, SESSION_COOKIE } from './session.js'

export interface DevUser {
  email: string
  name: string
  role: Role
}

export const DEV_USERS: readonly DevUser[] = [
  { email: 'admin@example.org', name: 'Wing Admin', role: 'admin' },
  { email: 'commander@example.org', name: 'Unit Commander', role: 'viewer' },
  { email: 'member@example.org', name: 'Member', role: 'viewer' },
]

export function findDevUser(email: unknown): DevUser | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  return DEV_USERS.find(u => u.email === normalized) ?? null
}

/**
 * Dev-mode auth: a fixed user picker, no Google dependency. The routes exist
 * in both modes but refuse everything unless AUTH_MODE=dev, so a
 * misconfigured proxy cannot expose a login bypass in google mode.
 */
export function registerDevAuth(app: FastifyInstance): void {
  app.get('/auth/dev/users', async (_req, reply) => {
    if (config.AUTH_MODE !== 'dev') {
      reply.code(404).send({ error: 'not found' })
      return
    }
    reply.send(DEV_USERS)
  })

  app.post('/auth/dev/login', async (req, reply) => {
    if (config.AUTH_MODE !== 'dev') {
      reply.code(404).send({ error: 'not found' })
      return
    }
    const body = req.body as { email?: unknown } | null | undefined
    const user = findDevUser(body?.email)
    if (!user) {
      reply.code(400).send({ error: 'unknown dev user' })
      return
    }
    const session = await createSession(user)
    reply.setCookie(SESSION_COOKIE, session.id, sessionCookieOptions(config.BASE_URL))
    await audit(user.email, 'auth.login', { mode: 'dev', role: user.role })
    reply.send({ ok: true })
  })
}
