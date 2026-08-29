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

/** One node of the anchor-subtree org tree served by /api/orgs. */
export interface OrgTreeNode {
  orgid: number
  name: string
  unit: string
  type: string
  scope: string
  children: OrgTreeNode[]
}

export interface OrgsResponse {
  anchorOrgid: number
  tree: OrgTreeNode
}
