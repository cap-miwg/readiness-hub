/**
 * Shared API contracts between server and web. The server is the source of
 * truth; web imports these types via the @shared alias. Keep this file free of
 * server-only imports: types, enums, and plain constants only.
 */

export type Role = 'viewer' | 'admin'

export interface MeResponse {
  email: string
  name: string
  role: Role
  authMode: 'dev' | 'google'
}

export interface MetaResponse {
  appVersion: string
  /** Last successful ingest, ISO timestamp, null before first ingest. */
  lastIngestAt: string | null
  /** CAPWATCH DownLoadDate of the current dataset (extract generation time). */
  downloadDate: string | null
  memberCount: number
  orgCount: number
}
