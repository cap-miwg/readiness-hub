import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AdoptionResponse, FindingsResponse, OverviewResponse } from '@shared/contracts'
import type { ParticipationResponse } from '@shared/participationContracts'
import type { LogisticsResponse } from '@shared/logisticsContracts'
import { ApiError, apiFetch, useOrgs } from '../../api/client'
import { useOrgScope } from '../../lib/urlState'

/** Jsonified ES analysis payload as served inside OverviewResponse. */
export type EsAnalysis = OverviewResponse['es']
/** Jsonified recruiting/retention metrics payload (null when no ORGStatistics rows). */
export type OrgStats = NonNullable<OverviewResponse['orgStats']>

export interface EffectiveScope {
  /** Selected orgid, falling back to the anchor org; null until orgs resolve. */
  orgid: number | null
  descendants: boolean
  /** True while the anchor fallback is still loading. */
  resolving: boolean
  /** Set when the anchor fallback failed to load and no explicit orgid is set. */
  orgsError: ApiError | null
}

export function useEffectiveScope(): EffectiveScope {
  const { scope } = useOrgScope()
  const orgsQ = useOrgs()
  return {
    orgid: scope.orgid ?? orgsQ.data?.anchorOrgid ?? null,
    descendants: scope.descendants,
    resolving: scope.orgid === null && orgsQ.isPending,
    orgsError: scope.orgid === null ? (orgsQ.error ?? null) : null,
  }
}

export function overviewPath(orgid: number, descendants: boolean): string {
  return `/api/orgs/${orgid}/overview${descendants ? '?descendants=1' : ''}`
}

export function adoptionPath(orgid: number, descendants: boolean): string {
  return `/api/orgs/${orgid}/adoption${descendants ? '?descendants=1' : ''}`
}

export function useOverview(
  orgid: number | null,
  descendants: boolean,
): UseQueryResult<OverviewResponse, ApiError> {
  return useQuery<OverviewResponse, ApiError>({
    queryKey: ['overview', orgid, descendants],
    queryFn: () => {
      if (orgid === null) throw new ApiError(0, 'no org selected')
      return apiFetch<OverviewResponse>(overviewPath(orgid, descendants))
    },
    enabled: orgid !== null,
    staleTime: 60_000,
  })
}

export function findingsPath(orgid: number, descendants: boolean): string {
  return `/api/orgs/${orgid}/findings${descendants ? '?descendants=1' : ''}`
}

export function participationPath(orgid: number, descendants: boolean): string {
  return `/api/orgs/${orgid}/participation${descendants ? '?descendants=1' : ''}`
}

export function logisticsPath(orgid: number, descendants: boolean): string {
  return `/api/orgs/${orgid}/logistics${descendants ? '?descendants=1' : ''}`
}

/** The ranked Needs Attention queue (contracts.ts FindingsResponse). */
export function useFindings(
  orgid: number | null,
  descendants: boolean,
): UseQueryResult<FindingsResponse, ApiError> {
  return useQuery<FindingsResponse, ApiError>({
    queryKey: ['findings', orgid, descendants],
    queryFn: () => {
      if (orgid === null) throw new ApiError(0, 'no org selected')
      return apiFetch<FindingsResponse>(findingsPath(orgid, descendants))
    },
    enabled: orgid !== null,
    staleTime: 60_000,
  })
}

/**
 * Attendance module (participationContracts.ts). recorded=false is a normal
 * answer (the NOT RECORDED neutral state), never an error.
 */
export function useParticipation(
  orgid: number | null,
  descendants: boolean,
): UseQueryResult<ParticipationResponse, ApiError> {
  return useQuery<ParticipationResponse, ApiError>({
    queryKey: ['participation', orgid, descendants],
    queryFn: () => {
      if (orgid === null) throw new ApiError(0, 'no org selected')
      return apiFetch<ParticipationResponse>(participationPath(orgid, descendants))
    },
    enabled: orgid !== null,
    staleTime: 60_000,
  })
}

/** Logistics read-only view (logisticsContracts.ts); ORMS stays authoritative. */
export function useLogistics(
  orgid: number | null,
  descendants: boolean,
): UseQueryResult<LogisticsResponse, ApiError> {
  return useQuery<LogisticsResponse, ApiError>({
    queryKey: ['logistics', orgid, descendants],
    queryFn: () => {
      if (orgid === null) throw new ApiError(0, 'no org selected')
      return apiFetch<LogisticsResponse>(logisticsPath(orgid, descendants))
    },
    enabled: orgid !== null,
    staleTime: 60_000,
  })
}

/**
 * Adoption sideload query. The server replies 404 when no adoption data has
 * been loaded; that is the "hide the section" signal, mapped to null here so
 * the section renders only on real data (contracts.ts AdoptionResponse).
 */
export function useAdoption(
  orgid: number | null,
  descendants: boolean,
): UseQueryResult<AdoptionResponse | null, ApiError> {
  return useQuery<AdoptionResponse | null, ApiError>({
    queryKey: ['adoption', orgid, descendants],
    queryFn: async () => {
      if (orgid === null) return null
      try {
        return await apiFetch<AdoptionResponse>(adoptionPath(orgid, descendants))
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    enabled: orgid !== null,
    staleTime: 5 * 60_000,
  })
}
