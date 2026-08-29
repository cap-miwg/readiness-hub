import { useQuery } from '@tanstack/react-query'
import type { MeResponse, MetaResponse, OrgsResponse } from '@shared/contracts'

/**
 * Typed fetch wrapper for the Readiness Hub API. Same-origin cookies, JSON
 * bodies, normalized errors, and the CSRF custom header the server requires
 * on every non-GET route (docs/ARCHITECTURE.md, AuthN/AuthZ).
 */

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

/** The app shell registers a redirect-to-login hook here; 401s invoke it. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Suppress the global 401 hook (login-page probes, logout). */
  skipAuthRedirect?: boolean
}

function extractErrorMessage(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === 'object') {
    const rec = parsed as Record<string, unknown>
    if (typeof rec['error'] === 'string' && rec['error']) return rec['error']
    if (typeof rec['message'] === 'string' && rec['message']) return rec['message']
  }
  return fallback
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { accept: 'application/json' }
  if (method !== 'GET') {
    headers['x-rh-csrf'] = '1'
  }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (res.status === 401 && !opts.skipAuthRedirect) {
    unauthorizedHandler?.()
  }

  if (!res.ok) {
    let parsed: unknown = null
    let message = `Request failed (${res.status} ${res.statusText})`
    const text = await res.text().catch(() => '')
    if (text) {
      try {
        parsed = JSON.parse(text)
        message = extractErrorMessage(parsed, message)
      } catch {
        message = text.slice(0, 200)
      }
    }
    throw new ApiError(res.status, message, parsed)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Query keys, exported so pages and mutations can invalidate consistently. */
export const queryKeys = {
  me: ['me'] as const,
  meta: ['meta'] as const,
  orgs: ['orgs'] as const,
}

/**
 * The deployment-configurable display name may ride along on /api/meta;
 * contracts.ts does not promise it yet, so it is optional here and the shell
 * falls back to APP_NAME_FALLBACK.
 */
export type Meta = MetaResponse & { appName?: string }

export const APP_NAME_FALLBACK = 'Readiness Hub'

export function useMe() {
  return useQuery<MeResponse, ApiError>({
    queryKey: queryKeys.me,
    // The auth gate itself reacts to 401 (redirect with return-to state);
    // the global hook stays out of the way for this one query.
    queryFn: () => apiFetch<MeResponse>('/api/me', { skipAuthRedirect: true }),
    staleTime: 5 * 60_000,
  })
}

export function useMeta(enabled = true) {
  return useQuery<Meta, ApiError>({
    queryKey: queryKeys.meta,
    queryFn: () => apiFetch<Meta>('/api/meta'),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled,
  })
}

export function useOrgs(enabled = true) {
  return useQuery<OrgsResponse, ApiError>({
    queryKey: queryKeys.orgs,
    queryFn: () => apiFetch<OrgsResponse>('/api/orgs'),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export interface DevUser {
  email: string
  name?: string
  role?: string
}

/**
 * Probe for dev-auth mode. Returns the pickable users when AUTH_MODE=dev,
 * or null when the server is in google mode (the endpoint does not exist).
 * Network failures still throw so the login page can say so.
 */
export async function fetchDevUsers(): Promise<DevUser[] | null> {
  let data: unknown
  try {
    data = await apiFetch<unknown>('/auth/dev/users', { skipAuthRedirect: true })
  } catch (err) {
    if (err instanceof ApiError && err.status !== 0) return null
    throw err
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { users?: unknown }).users)
      ? ((data as { users: unknown[] }).users)
      : null
  if (!list) return null
  const users: DevUser[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (typeof rec['email'] !== 'string' || !rec['email']) continue
    const user: DevUser = { email: rec['email'] }
    if (typeof rec['name'] === 'string') user.name = rec['name']
    if (typeof rec['role'] === 'string') user.role = rec['role']
    users.push(user)
  }
  return users
}

export async function devLogin(email: string): Promise<void> {
  await apiFetch<unknown>('/auth/dev/login', {
    method: 'POST',
    body: { email },
    skipAuthRedirect: true,
  })
}

export async function logout(): Promise<void> {
  await apiFetch<unknown>('/auth/logout', { method: 'POST', skipAuthRedirect: true })
}
