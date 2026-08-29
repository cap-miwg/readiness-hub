import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import type { MeResponse } from '../shared/contracts.js'
import { audit } from './audit.js'
import { DEV_USERS, registerDevAuth } from './devAuth.js'
import { accessLog, csrfProtect, requireAdmin, requireAuth } from './guard.js'
import { completeLogin, LoginRejectedError, startLogin } from './oidc.js'
import {
  createSession,
  deleteAllSessions,
  deleteSession,
  readSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from './session.js'

export { requireAuth, requireAdmin } from './guard.js'

const STATE_COOKIE = 'rh_oidc_state'
const VERIFIER_COOKIE = 'rh_oidc_verifier'
const OIDC_COOKIE_PATH = '/auth'
const OIDC_COOKIE_MAX_AGE_S = 600

function oidcCookieOptions(baseUrl: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: baseUrl.startsWith('https'),
    path: OIDC_COOKIE_PATH,
    maxAge: OIDC_COOKIE_MAX_AGE_S,
    signed: true,
  }
}

function readSignedCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.cookies[name]
  if (!raw) return null
  const unsigned = req.unsignCookie(raw)
  return unsigned.valid && unsigned.value ? unsigned.value : null
}

function clearOidcCookies(reply: FastifyReply): void {
  reply.clearCookie(STATE_COOKIE, { path: OIDC_COOKIE_PATH })
  reply.clearCookie(VERIFIER_COOKIE, { path: OIDC_COOKIE_PATH })
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function errorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign-in failed - Readiness Hub</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1f2937}
a{color:#1d4ed8}</style></head>
<body>
<h1>Sign-in failed</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/auth/login">Try again</a></p>
</body>
</html>`
}

function devPickerPage(): string {
  const buttons = DEV_USERS.map(
    u =>
      `<button data-email="${escapeHtml(u.email)}">${escapeHtml(u.name)} (${escapeHtml(u.role)})</button>`,
  ).join('\n')
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev sign-in - Readiness Hub</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1f2937}
button{display:block;margin:0.5rem 0;padding:0.5rem 1rem;cursor:pointer}
.warn{background:#fef3c7;padding:0.5rem 1rem;border-radius:0.25rem}</style></head>
<body>
<h1>Dev sign-in</h1>
<p class="warn">AUTH_MODE=dev: authentication is a picker, not a login. Never expose this deployment.</p>
${buttons}
<script>
for (const b of document.querySelectorAll('button')) {
  b.addEventListener('click', async () => {
    const res = await fetch('/auth/dev/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: b.dataset.email }),
    })
    if (res.ok) location.href = '/'
    else alert('login failed: ' + res.status)
  })
}
</script>
</body>
</html>`
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  // Dev auth fail-closed lives in index.ts (mixed-config refusal) plus the
  // localhost-default compose bind and the DEV_ALLOW_REAL_INGEST gate: the
  // container image always runs NODE_ENV=production, so a NODE_ENV check here
  // would break the sanctioned quickstart demo path.

  app.addHook('onRequest', csrfProtect(config.BASE_URL))
  app.addHook('onResponse', accessLog())

  registerDevAuth(app)

  app.get('/auth/login', async (_req, reply) => {
    if (config.AUTH_MODE === 'dev') {
      reply.type('text/html').send(devPickerPage())
      return
    }
    const { redirectUrl, state, codeVerifier } = await startLogin()
    const opts = oidcCookieOptions(config.BASE_URL)
    reply.setCookie(STATE_COOKIE, state, opts)
    reply.setCookie(VERIFIER_COOKIE, codeVerifier, opts)
    reply.redirect(redirectUrl)
  })

  app.get('/auth/callback', async (req, reply) => {
    if (config.AUTH_MODE !== 'google') {
      reply.code(404).send({ error: 'not found' })
      return
    }
    const state = readSignedCookie(req, STATE_COOKIE)
    const codeVerifier = readSignedCookie(req, VERIFIER_COOKIE)
    clearOidcCookies(reply)
    if (!state || !codeVerifier) {
      reply
        .code(400)
        .type('text/html')
        .send(errorPage('Your sign-in attempt expired or did not start here. Please try again.'))
      return
    }
    const currentUrl = new URL(req.url, config.BASE_URL)
    try {
      const user = await completeLogin(currentUrl, state, codeVerifier)
      const session = await createSession(user)
      reply.setCookie(SESSION_COOKIE, session.id, sessionCookieOptions(config.BASE_URL))
      await audit(user.email, 'auth.login', { mode: 'google', role: user.role })
      reply.redirect('/')
    } catch (err) {
      if (err instanceof LoginRejectedError) {
        await audit(err.email ?? 'unknown', 'auth.login.rejected', { reason: err.message })
        reply.code(403).type('text/html').send(errorPage(err.message))
        return
      }
      req.log.error({ err }, 'oidc callback failed')
      await audit('unknown', 'auth.login.rejected', { reason: 'code exchange failed' })
      reply.code(400).type('text/html').send(errorPage('Sign-in failed. Please try again.'))
    }
  })

  app.post('/auth/logout', async (req, reply) => {
    const id = req.cookies[SESSION_COOKIE]
    if (id) {
      const session = await readSession(id)
      await deleteSession(id)
      if (session) await audit(session.email, 'auth.logout', {})
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    reply.send({ ok: true })
  })

  app.get('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    const session = req.rhSession
    if (!session) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const me: MeResponse = {
      email: session.email,
      name: session.name,
      role: session.role,
      authMode: config.AUTH_MODE,
    }
    reply.send(me)
  })

  app.post(
    '/api/admin/sessions/revoke-all',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const actor = req.rhSession?.email ?? 'unknown'
      const revoked = await deleteAllSessions()
      await audit(actor, 'auth.sessions.revoke_all', { revoked })
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      reply.send({ ok: true, revoked })
    },
  )
}
