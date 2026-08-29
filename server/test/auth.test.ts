import { describe, expect, it } from 'vitest'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const { checkIdentityClaims, roleFor } = await import('../src/auth/oidc.js')
const {
  ABSOLUTE_TTL_MS,
  SLIDING_TTL_MS,
  TOUCH_INTERVAL_MS,
  expiryFor,
  isExpired,
  newSessionId,
  shouldTouch,
  sessionCookieOptions,
} = await import('../src/auth/session.js')
const { csrfDecision } = await import('../src/auth/guard.js')
const { findDevUser, DEV_USERS } = await import('../src/auth/devAuth.js')

const ALLOWED = ['miwg.cap.gov', 'gawg.cap.gov']
const ADMINS = ['admin@miwg.cap.gov']

describe('checkIdentityClaims: domain allowlist on the verified ID token', () => {
  const good = {
    email: 'member@miwg.cap.gov',
    email_verified: true,
    hd: 'miwg.cap.gov',
    name: 'A Member',
  }

  it('accepts a verified account whose hd is allowed', () => {
    const result = checkIdentityClaims(good, ALLOWED)
    expect(result).toEqual({ ok: true, email: 'member@miwg.cap.gov', name: 'A Member' })
  })

  it('rejects when hd is missing (consumer account), with a readable message', () => {
    const result = checkIdentityClaims({ ...good, hd: undefined }, ALLOWED)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('miwg.cap.gov')
      expect(result.email).toBe('member@miwg.cap.gov')
    }
  })

  it('rejects an hd outside the allowlist', () => {
    const result = checkIdentityClaims({ ...good, hd: 'evil.example.com' }, ALLOWED)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('evil.example.com')
  })

  it('compares hd case-insensitively', () => {
    expect(checkIdentityClaims({ ...good, hd: 'MIWG.CAP.GOV' }, ALLOWED).ok).toBe(true)
  })

  it('rejects unverified email even on an allowed domain', () => {
    expect(checkIdentityClaims({ ...good, email_verified: false }, ALLOWED).ok).toBe(false)
  })

  it('rejects a non-boolean email_verified claim', () => {
    expect(checkIdentityClaims({ ...good, email_verified: 'true' }, ALLOWED).ok).toBe(false)
  })

  it('rejects a missing email claim', () => {
    expect(checkIdentityClaims({ ...good, email: undefined }, ALLOWED).ok).toBe(false)
  })

  it('falls back to email when name is missing', () => {
    const result = checkIdentityClaims({ ...good, name: undefined }, ALLOWED)
    expect(result).toEqual({ ok: true, email: 'member@miwg.cap.gov', name: 'member@miwg.cap.gov' })
  })
})

describe('roleFor', () => {
  it('grants admin only to listed emails, case-insensitively', () => {
    expect(roleFor('admin@miwg.cap.gov', ADMINS)).toBe('admin')
    expect(roleFor('Admin@MIWG.cap.gov', ADMINS)).toBe('admin')
    expect(roleFor('member@miwg.cap.gov', ADMINS)).toBe('viewer')
    expect(roleFor('admin@miwg.cap.gov', [])).toBe('viewer')
  })
})

describe('session expiry math', () => {
  const created = new Date('2026-08-01T00:00:00Z')
  const day = 24 * 60 * 60 * 1000

  it('slides expiry 7 days from activity while under the absolute cap', () => {
    const asOf = new Date(created.getTime() + 2 * day)
    expect(expiryFor(created, asOf).getTime()).toBe(asOf.getTime() + SLIDING_TTL_MS)
  })

  it('caps expiry at 30 days from creation', () => {
    const asOf = new Date(created.getTime() + 28 * day)
    expect(expiryFor(created, asOf).getTime()).toBe(created.getTime() + ABSOLUTE_TTL_MS)
    expect(expiryFor(created, asOf).getTime()).toBeLessThan(asOf.getTime() + SLIDING_TTL_MS)
  })

  it('expires an idle session after the sliding window', () => {
    const expiresAt = expiryFor(created, created)
    const session = { createdAt: created, expiresAt }
    expect(isExpired(session, new Date(created.getTime() + 7 * day - 1))).toBe(false)
    expect(isExpired(session, new Date(created.getTime() + 7 * day))).toBe(true)
  })

  it('expires at the absolute cap even with recent activity', () => {
    const lastTouch = new Date(created.getTime() + 29 * day)
    const session = { createdAt: created, expiresAt: expiryFor(created, lastTouch) }
    expect(isExpired(session, new Date(created.getTime() + 30 * day - 1))).toBe(false)
    expect(isExpired(session, new Date(created.getTime() + 30 * day))).toBe(true)
  })

  it('touches at most once per 10 minutes', () => {
    const seen = new Date('2026-08-01T12:00:00Z')
    expect(shouldTouch(seen, new Date(seen.getTime() + TOUCH_INTERVAL_MS - 1))).toBe(false)
    expect(shouldTouch(seen, new Date(seen.getTime() + TOUCH_INTERVAL_MS))).toBe(true)
  })

  it('generates 128-bit hex session ids', () => {
    const id = newSessionId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(newSessionId()).not.toBe(id)
  })

  it('marks the cookie Secure only for https BASE_URL', () => {
    expect(sessionCookieOptions('https://hub.example.org').secure).toBe(true)
    expect(sessionCookieOptions('http://localhost:8080').secure).toBe(false)
    const opts = sessionCookieOptions('http://localhost:8080')
    expect(opts.httpOnly).toBe(true)
    expect(opts.sameSite).toBe('lax')
    expect(opts.path).toBe('/')
  })
})

describe('csrfDecision table', () => {
  const base = {
    method: 'POST',
    path: '/api/feedback',
    originHeader: undefined as string | undefined,
    refererHeader: undefined as string | undefined,
    csrfHeader: undefined as string | undefined,
    baseHost: 'hub.example.org',
  }

  it('GET passes without any origin headers', () => {
    expect(csrfDecision({ ...base, method: 'GET' })).toEqual({ ok: true })
    expect(csrfDecision({ ...base, method: 'HEAD' })).toEqual({ ok: true })
    expect(csrfDecision({ ...base, method: 'OPTIONS' })).toEqual({ ok: true })
  })

  it('POST with neither Origin nor Referer is rejected', () => {
    expect(csrfDecision(base).ok).toBe(false)
  })

  it('cross-origin POST is rejected', () => {
    expect(csrfDecision({ ...base, originHeader: 'https://evil.example.com' }).ok).toBe(false)
    expect(
      csrfDecision({ ...base, refererHeader: 'https://evil.example.com/form.html' }).ok,
    ).toBe(false)
  })

  it('same-origin POST passes on non-admin routes without x-rh-csrf', () => {
    expect(csrfDecision({ ...base, originHeader: 'https://hub.example.org' })).toEqual({
      ok: true,
    })
  })

  it('same-origin Referer alone passes when Origin is absent', () => {
    expect(
      csrfDecision({ ...base, refererHeader: 'https://hub.example.org/some/page' }),
    ).toEqual({ ok: true })
  })

  it('same-origin admin mutation without x-rh-csrf is rejected', () => {
    const result = csrfDecision({
      ...base,
      path: '/api/admin/ingest',
      originHeader: 'https://hub.example.org',
    })
    expect(result.ok).toBe(false)
  })

  it('same-origin admin mutation with x-rh-csrf: 1 passes', () => {
    expect(
      csrfDecision({
        ...base,
        path: '/api/admin/ingest',
        originHeader: 'https://hub.example.org',
        csrfHeader: '1',
      }),
    ).toEqual({ ok: true })
  })

  it('cross-origin admin mutation is rejected even with x-rh-csrf', () => {
    expect(
      csrfDecision({
        ...base,
        path: '/api/admin/ingest',
        originHeader: 'https://evil.example.com',
        csrfHeader: '1',
      }).ok,
    ).toBe(false)
  })

  it('an unparseable Origin is rejected', () => {
    expect(csrfDecision({ ...base, originHeader: 'null' }).ok).toBe(false)
  })

  it('a same-hostname different-port origin is rejected', () => {
    expect(
      csrfDecision({ ...base, baseHost: 'localhost:8080', originHeader: 'http://localhost:5173' })
        .ok,
    ).toBe(false)
  })
})

describe('dev user picker', () => {
  it('exposes exactly the fixed picker list with one admin', () => {
    expect(DEV_USERS.map(u => u.role)).toEqual(['admin', 'viewer', 'viewer'])
    expect(DEV_USERS[0]).toEqual({
      email: 'admin@example.org',
      name: 'Wing Admin',
      role: 'admin',
    })
  })

  it('resolves picker emails case-insensitively and rejects strangers', () => {
    expect(findDevUser('Admin@Example.org')?.role).toBe('admin')
    expect(findDevUser('member@example.org')?.role).toBe('viewer')
    expect(findDevUser('outsider@example.org')).toBeNull()
    expect(findDevUser(42)).toBeNull()
    expect(findDevUser(undefined)).toBeNull()
  })
})
