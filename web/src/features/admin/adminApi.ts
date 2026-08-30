import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AdminAnnouncementsResponse,
  AdminSettingsResponse,
  AdminSettingsUpdate,
  Announcement,
  AnnouncementInput,
  AnnouncementMutationResponse,
  AnnouncementUpdateInput,
  AuditResponse,
  IngestResponse,
  IngestRunSummary,
  UsageResponse,
} from '@shared/contracts'
import { ApiError, apiFetch, queryKeys } from '../../api/client'

export const adminKeys = {
  runs: ['admin', 'runs'] as const,
  audit: ['admin', 'audit'] as const,
  settings: ['admin', 'settings'] as const,
  announcements: ['admin', 'announcements'] as const,
  usage: ['admin', 'usage'] as const,
}

/** The member-facing list on Home caches under this key; mutations bust both. */
export const ANNOUNCEMENTS_PUBLIC_KEY = ['announcements'] as const

export function useRuns(enabled = true) {
  return useQuery<{ runs: IngestRunSummary[] }, ApiError>({
    queryKey: adminKeys.runs,
    queryFn: () => apiFetch<{ runs: IngestRunSummary[] }>('/api/admin/runs'),
    staleTime: 30_000,
    enabled,
  })
}

export function useAudit(enabled = true) {
  return useQuery<AuditResponse, ApiError>({
    queryKey: adminKeys.audit,
    queryFn: () => apiFetch<AuditResponse>('/api/admin/audit'),
    staleTime: 30_000,
    enabled,
  })
}

export function useSettings(enabled = true) {
  return useQuery<AdminSettingsResponse, ApiError>({
    queryKey: adminKeys.settings,
    queryFn: () => apiFetch<AdminSettingsResponse>('/api/admin/settings'),
    staleTime: 60_000,
    enabled,
  })
}

export function useUsage(enabled = true) {
  return useQuery<UsageResponse, ApiError>({
    queryKey: adminKeys.usage,
    queryFn: () => apiFetch<UsageResponse>('/api/admin/usage'),
    staleTime: 60_000,
    enabled,
  })
}

// --- Announcements (admin CRUD; contracts.ts Announcements section) ---

export function useAdminAnnouncements(enabled = true) {
  return useQuery<AdminAnnouncementsResponse, ApiError>({
    queryKey: adminKeys.announcements,
    queryFn: () => apiFetch<AdminAnnouncementsResponse>('/api/admin/announcements'),
    staleTime: 30_000,
    enabled,
  })
}

function useInvalidateAnnouncements() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: adminKeys.announcements })
    void qc.invalidateQueries({ queryKey: ANNOUNCEMENTS_PUBLIC_KEY })
    void qc.invalidateQueries({ queryKey: adminKeys.audit })
  }
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation<AnnouncementMutationResponse, ApiError, AnnouncementInput>({
    mutationFn: input =>
      apiFetch<AnnouncementMutationResponse>('/api/admin/announcements', {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  })
}

export interface AnnouncementUpdateVars {
  id: number
  input: AnnouncementUpdateInput
}

export function useUpdateAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation<AnnouncementMutationResponse, ApiError, AnnouncementUpdateVars>({
    mutationFn: ({ id, input }) =>
      apiFetch<AnnouncementMutationResponse>(`/api/admin/announcements/${id}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation<{ ok: boolean }, ApiError, Announcement>({
    mutationFn: a => apiFetch<{ ok: boolean }>(`/api/admin/announcements/${a.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/** Invalidate everything an ingest can change. */
function useInvalidateAfterIngest() {
  const qc = useQueryClient()
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKeys.runs }),
      qc.invalidateQueries({ queryKey: adminKeys.audit }),
      qc.invalidateQueries({ queryKey: queryKeys.meta }),
      qc.invalidateQueries({ queryKey: queryKeys.orgs }),
    ])
  }
}

function extractXhrError(xhr: XMLHttpRequest): string {
  const fallback = `Request failed (${xhr.status} ${xhr.statusText})`
  const text = xhr.responseText
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (typeof parsed['error'] === 'string' && parsed['error']) return parsed['error']
    if (typeof parsed['message'] === 'string' && parsed['message']) return parsed['message']
  } catch {
    return text.slice(0, 200)
  }
  return fallback
}

/**
 * Multipart upload with progress. fetch() cannot report upload progress, so
 * the two ingest uploads go through XMLHttpRequest; the x-rh-csrf header
 * matches what apiFetch sends on every mutation.
 */
export function uploadMultipart(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<IngestResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('accept', 'application/json')
    xhr.setRequestHeader('x-rh-csrf', '1')
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as IngestResponse)
        } catch {
          reject(new ApiError(xhr.status, 'The server returned a malformed ingest response.'))
        }
      } else {
        reject(new ApiError(xhr.status, extractXhrError(xhr)))
      }
    }
    xhr.onerror = () =>
      reject(new ApiError(0, 'Could not reach the server. Check your connection and try again.'))
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled.'))
    xhr.send(form)
  })
}

export interface ZipUploadInput {
  file: File
  force: boolean
  onProgress: (percent: number) => void
}

export function useUploadZip() {
  const invalidate = useInvalidateAfterIngest()
  return useMutation<IngestResponse, ApiError, ZipUploadInput>({
    mutationFn: ({ file, force, onProgress }) => {
      const form = new FormData()
      form.append('file', file, file.name)
      return uploadMultipart(`/api/admin/ingest${force ? '?force=1' : ''}`, form, onProgress)
    },
    onSettled: () => void invalidate(),
  })
}

export interface AdoptionUploadInput {
  stats: File | null
  users: File | null
  onProgress: (percent: number) => void
}

export function useUploadAdoption() {
  const invalidate = useInvalidateAfterIngest()
  return useMutation<IngestResponse, ApiError, AdoptionUploadInput>({
    mutationFn: ({ stats, users, onProgress }) => {
      const form = new FormData()
      // Field names 'stats' and 'users' map to the registry filenames
      // server-side (api/admin.ts adoptionFileNameOf), so the picked files
      // can be named anything.
      if (stats) form.append('stats', stats, stats.name)
      if (users) form.append('users', users, users.name)
      return uploadMultipart('/api/admin/ingest/adoption', form, onProgress)
    },
    onSettled: () => void invalidate(),
  })
}

export function useFetchNow() {
  const invalidate = useInvalidateAfterIngest()
  return useMutation<IngestResponse, ApiError, { force: boolean }>({
    mutationFn: ({ force }) =>
      apiFetch<IngestResponse>(`/api/admin/ingest/fetch${force ? '?force=1' : ''}`, {
        method: 'POST',
      }),
    onSettled: () => void invalidate(),
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation<AdminSettingsResponse, ApiError, AdminSettingsUpdate>({
    mutationFn: update =>
      apiFetch<AdminSettingsResponse>('/api/admin/settings', { method: 'PUT', body: update }),
    onSuccess: data => {
      qc.setQueryData(adminKeys.settings, data)
      void qc.invalidateQueries({ queryKey: queryKeys.orgs })
      void qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useRevokeAllSessions() {
  return useMutation<{ ok: boolean; revoked: number }, ApiError, void>({
    mutationFn: () =>
      apiFetch<{ ok: boolean; revoked: number }>('/api/admin/sessions/revoke-all', {
        method: 'POST',
        skipAuthRedirect: true,
      }),
  })
}
