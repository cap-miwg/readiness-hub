/**
 * Shared report API contracts between server and web. Same rules as
 * contracts.ts: no server-only imports, types and plain constants only.
 */

export interface ReportMeta {
  id: string
  title: string
  description: string
  /** Lucide icon name, v1 parity (Index.html:4274-4455 reportCatalog). */
  icon: string
  /** Accent color token, v1 parity. */
  accent: string
  tags: string[]
}

export interface ReportColumn {
  key: string
  header: string
}

/** Scope echo so a rendered report is self-describing and shareable. */
export interface ReportScope {
  orgid: number
  descendants: boolean
  /** Display name of the scope org, GLR-MI-205 style. */
  orgName: string
  /** Members considered by the generator (after tag-pool filtering). */
  memberCount: number
}

export interface ReportResult {
  columns: ReportColumn[]
  /**
   * Row cells keyed by column key. Rows may carry extra non-column keys for
   * drill-down rendering (e.g. QCUA per-criterion detail).
   */
  rows: Record<string, unknown>[]
  /** ISO timestamp of generation (request-time now, not ingest time). */
  generatedAt: string
  scope: ReportScope
  /** Report-level summary payload (v1 result.meta), shape per report id. */
  meta?: Record<string, unknown>
}

export interface ReportsListResponse {
  reports: ReportMeta[]
}
