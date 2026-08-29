import * as oidc from 'openid-client'
import { config } from '../config.js'
import type { Role } from '../shared/contracts.js'

let cached: oidc.Configuration | undefined

async function oidcConfiguration(): Promise<oidc.Configuration> {
  cached ??= await oidc.discovery(
    new URL('https://accounts.google.com'),
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
  )
  return cached
}

export function callbackUrl(): string {
  return new URL('/auth/callback', config.BASE_URL).href
}

export interface LoginStart {
  redirectUrl: string
  state: string
  codeVerifier: string
}

export async function startLogin(): Promise<LoginStart> {
  const cfg = await oidcConfiguration()
  const codeVerifier = oidc.randomPKCECodeVerifier()
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
  const state = oidc.randomState()
  const url = oidc.buildAuthorizationUrl(cfg, {
    redirect_uri: callbackUrl(),
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  return { redirectUrl: url.href, state, codeVerifier }
}

/** Login failed our policy (not a transport error); message is user-facing. */
export class LoginRejectedError extends Error {
  readonly email: string | null

  constructor(message: string, email: string | null = null) {
    super(message)
    this.name = 'LoginRejectedError'
    this.email = email
  }
}

export interface IdentityClaims {
  email?: unknown
  email_verified?: unknown
  hd?: unknown
  name?: unknown
}

export type ClaimCheck =
  | { ok: true; email: string; name: string }
  | { ok: false; reason: string; email: string | null }

/**
 * Policy checks on an already signature-verified ID token. The hd claim must
 * come from this verified token, never from the request hint: a request-side
 * hd only prefills the account chooser and proves nothing. Consumer accounts
 * carry no hd claim and fail closed with a readable message.
 */
export function checkIdentityClaims(
  claims: IdentityClaims,
  allowedDomains: string[],
): ClaimCheck {
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (!email) {
    return { ok: false, reason: 'Google did not return an email address for this account.', email: null }
  }
  if (claims.email_verified !== true) {
    return {
      ok: false,
      reason: 'This Google account has an unverified email address and cannot be used here.',
      email,
    }
  }
  const domains = allowedDomains.join(', ')
  const hd = typeof claims.hd === 'string' ? claims.hd.trim().toLowerCase() : ''
  if (!hd) {
    return {
      ok: false,
      reason:
        'This Google account is not part of a Workspace domain. ' +
        `Sign in with your organization account (${domains}). ` +
        'If you are signed in to multiple Google accounts, pick the organization one.',
      email,
    }
  }
  if (!allowedDomains.includes(hd)) {
    return {
      ok: false,
      reason: `The Workspace domain "${hd}" is not allowed on this deployment. Allowed: ${domains}.`,
      email,
    }
  }
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : email
  return { ok: true, email, name }
}

export function roleFor(email: string, adminEmails: string[]): Role {
  return adminEmails.includes(email.trim().toLowerCase()) ? 'admin' : 'viewer'
}

export interface AuthenticatedUser {
  email: string
  name: string
  role: Role
}

/**
 * Exchange the authorization code and enforce identity policy.
 * authorizationCodeGrant validates state, PKCE, and the ID token's iss, aud,
 * exp, and signature against Google's JWKS before claims() returns anything.
 */
export async function completeLogin(
  currentUrl: URL,
  expectedState: string,
  pkceCodeVerifier: string,
): Promise<AuthenticatedUser> {
  const cfg = await oidcConfiguration()
  const tokens = await oidc.authorizationCodeGrant(cfg, currentUrl, {
    expectedState,
    pkceCodeVerifier,
    idTokenExpected: true,
  })
  const claims = tokens.claims()
  if (!claims) {
    throw new LoginRejectedError('Google did not return an ID token. Please try again.')
  }
  const check = checkIdentityClaims(
    {
      email: claims['email'],
      email_verified: claims['email_verified'],
      hd: claims['hd'],
      name: claims['name'],
    },
    config.allowedDomains,
  )
  if (!check.ok) {
    throw new LoginRejectedError(check.reason, check.email)
  }
  return { email: check.email, name: check.name, role: roleFor(check.email, config.adminEmails) }
}
