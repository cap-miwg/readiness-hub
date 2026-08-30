import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { describe, expect, it, vi } from 'vitest'

// config.ts validates env at import time; satisfy it before loading modules.
// The OIDC callback only exists in google mode. Vitest (via Vite) injects
// process.env.BASE_URL='/', which is not a URL; pin a real one for config.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'
process.env.AUTH_MODE = 'google'
process.env.BASE_URL = 'http://localhost:8080'

vi.mock('../src/auth/oidc.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/auth/oidc.js')>()
  return {
    ...actual,
    startLogin: vi.fn(async () => ({
      redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth?fake=1',
      state: 'test-state',
      codeVerifier: 'test-verifier',
    })),
    completeLogin: vi.fn(),
  }
})

vi.mock('../src/auth/audit.js', () => ({ audit: vi.fn(async () => {}) }))

const { LoginRejectedError, completeLogin } = await import('../src/auth/oidc.js')
const { audit } = await import('../src/auth/audit.js')
const { registerAuth, LOGIN_REJECTED_REDIRECT } = await import('../src/auth/routes.js')

const completeLoginMock = vi.mocked(completeLogin)
const auditMock = vi.mocked(audit)

/** Build the app and walk /auth/login to obtain valid signed OIDC cookies. */
async function appWithOidcCookies() {
  const app = Fastify()
  await app.register(fastifyCookie, { secret: process.env.SESSION_SECRET as string })
  await registerAuth(app)
  const login = await app.inject({ method: 'GET', url: '/auth/login' })
  expect(login.statusCode).toBe(302)
  const raw = login.headers['set-cookie'] ?? []
  const cookies = (Array.isArray(raw) ? raw : [raw])
    .map(c => c.split(';')[0] ?? '')
    .join('; ')
  return { app, cookies }
}

describe('OIDC callback error paths', () => {
  it('redirects a domain-rejected sign-in to the SPA login page with the mapped code', async () => {
    completeLoginMock.mockRejectedValueOnce(
      new LoginRejectedError('account domain is not allowed', 'stranger@gmail.com'),
    )
    const { app, cookies } = await appWithOidcCookies()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=x&state=test-state',
      headers: { cookie: cookies },
    })
    expect(res.statusCode).toBe(302)
    // 'domain' is a code the web login page maps to a friendly message
    // (web/src/pages/Login.tsx loginErrorMessage).
    expect(res.headers.location).toBe('/login?error=domain')
    expect(LOGIN_REJECTED_REDIRECT).toBe('/login?error=domain')
    expect(auditMock).toHaveBeenCalledWith('stranger@gmail.com', 'auth.login.rejected', {
      reason: 'account domain is not allowed',
    })
    await app.close()
  })

  it('keeps the standalone HTML error page for a generic exchange failure', async () => {
    completeLoginMock.mockRejectedValueOnce(new Error('code exchange failed'))
    const { app, cookies } = await appWithOidcCookies()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=x&state=test-state',
      headers: { cookie: cookies },
    })
    expect(res.statusCode).toBe(400)
    expect(String(res.headers['content-type'])).toContain('text/html')
    expect(res.body).toContain('Sign-in failed')
    await app.close()
  })
})
