import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Filter and scope state lives in the URL search string so every view is
 * shareable (docs/ARCHITECTURE.md, Frontend). Two reserved keys carry the org
 * scope across all pages; everything else is a per-page filter param.
 * Multi-valued filters use repeated keys (?duty=A&duty=B) so values may
 * contain any character.
 */

export const ORG_PARAM = 'orgid'
export const DESCENDANTS_PARAM = 'descendants'

export interface OrgScope {
  /** null = no explicit selection; the shell falls back to the anchor org. */
  orgid: number | null
  /** The Sub-Units toggle: include all descendant units in scope. */
  descendants: boolean
}

export function readOrgScope(params: URLSearchParams): OrgScope {
  const raw = params.get(ORG_PARAM)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return {
    orgid: Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null,
    descendants: params.get(DESCENDANTS_PARAM) === '1',
  }
}

/** Returns a copy of params with the scope applied; other params untouched. */
export function writeOrgScope(params: URLSearchParams, scope: OrgScope): URLSearchParams {
  const next = new URLSearchParams(params)
  if (scope.orgid === null) next.delete(ORG_PARAM)
  else next.set(ORG_PARAM, String(scope.orgid))
  if (scope.descendants) next.set(DESCENDANTS_PARAM, '1')
  else next.delete(DESCENDANTS_PARAM)
  return next
}

/** Search string carrying only the org scope, for cross-page nav links. */
export function orgScopeSearch(scope: OrgScope): string {
  const s = writeOrgScope(new URLSearchParams(), scope).toString()
  return s ? `?${s}` : ''
}

export function useOrgScope(): {
  scope: OrgScope
  setScope: (next: OrgScope) => void
  setOrgid: (orgid: number | null) => void
  setDescendants: (descendants: boolean) => void
} {
  const [params, setParams] = useSearchParams()
  const scope = useMemo(() => readOrgScope(params), [params])

  const setScope = useCallback(
    (next: OrgScope) => {
      setParams(prev => writeOrgScope(prev, next))
    },
    [setParams],
  )
  const setOrgid = useCallback(
    (orgid: number | null) => {
      setParams(prev => writeOrgScope(prev, { ...readOrgScope(prev), orgid }))
    },
    [setParams],
  )
  const setDescendants = useCallback(
    (descendants: boolean) => {
      setParams(prev => writeOrgScope(prev, { ...readOrgScope(prev), descendants }))
    },
    [setParams],
  )
  return { scope, setScope, setOrgid, setDescendants }
}

// Per-page filter params. Plain functions for logic, hooks for components.

export function getListParam(params: URLSearchParams, key: string): string[] {
  return params.getAll(key)
}

export function setListParam(
  params: URLSearchParams,
  key: string,
  values: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete(key)
  for (const v of values) next.append(key, v)
  return next
}

export function getFlagParam(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1'
}

export function setFlagParam(
  params: URLSearchParams,
  key: string,
  value: boolean,
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (value) next.set(key, '1')
  else next.delete(key)
  return next
}

export function getStringParam(params: URLSearchParams, key: string): string | null {
  const v = params.get(key)
  return v === null || v === '' ? null : v
}

export function setStringParam(
  params: URLSearchParams,
  key: string,
  value: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (value === null || value === '') next.delete(key)
  else next.set(key, value)
  return next
}

/** Multi-select filter (FilterMenu) bound to a repeated URL param. */
export function useListParam(key: string): [string[], (values: string[]) => void] {
  const [params, setParams] = useSearchParams()
  const values = useMemo(() => getListParam(params, key), [params, key])
  const set = useCallback(
    (next: string[]) => {
      // replace: filter tweaks should not pile up in browser history.
      setParams(prev => setListParam(prev, key, next), { replace: true })
    },
    [setParams, key],
  )
  return [values, set]
}

/** Boolean toggle filter bound to a URL param ('1' when on). */
export function useFlagParam(key: string): [boolean, (value: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const value = useMemo(() => getFlagParam(params, key), [params, key])
  const set = useCallback(
    (next: boolean) => {
      setParams(prev => setFlagParam(prev, key, next), { replace: true })
    },
    [setParams, key],
  )
  return [value, set]
}

/** Single-valued filter (search box, single select) bound to a URL param. */
export function useStringParam(key: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const value = useMemo(() => getStringParam(params, key), [params, key])
  const set = useCallback(
    (next: string | null) => {
      setParams(prev => setStringParam(prev, key, next), { replace: true })
    },
    [setParams, key],
  )
  return [value, set]
}
