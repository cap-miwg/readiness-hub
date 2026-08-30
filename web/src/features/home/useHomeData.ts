import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type {
  AnnouncementsResponse,
  FindingsResponse,
  MyProgressResponse,
} from '@shared/contracts'
import { ApiError, apiFetch } from '../../api/client'

/*
 * Home platform-page data (V2-DESIGN-PLAN.md section 5): the personal
 * My Progress card (D11), the admin-authored announcements feed, and the
 * self-scope findings count behind the My Unit verdict sentence.
 */

export function useMyProgress(): UseQueryResult<MyProgressResponse, ApiError> {
  return useQuery<MyProgressResponse, ApiError>({
    queryKey: ['me', 'progress'],
    queryFn: () => apiFetch<MyProgressResponse>('/api/me/progress'),
    staleTime: 5 * 60_000,
  })
}

export function useAnnouncements(): UseQueryResult<AnnouncementsResponse, ApiError> {
  return useQuery<AnnouncementsResponse, ApiError>({
    queryKey: ['announcements'],
    queryFn: () => apiFetch<AnnouncementsResponse>('/api/announcements'),
    staleTime: 60_000,
  })
}

/**
 * Self-scope findings for My Unit: the verdict line states the count and
 * links into Unit Overview; the queue itself lives there, not on Home.
 */
export function useUnitFindings(orgid: number | null): UseQueryResult<FindingsResponse, ApiError> {
  return useQuery<FindingsResponse, ApiError>({
    queryKey: ['findings', orgid, false],
    queryFn: () => {
      if (orgid === null) throw new ApiError(0, 'no org selected')
      return apiFetch<FindingsResponse>(`/api/orgs/${orgid}/findings`)
    },
    enabled: orgid !== null,
    staleTime: 60_000,
  })
}
