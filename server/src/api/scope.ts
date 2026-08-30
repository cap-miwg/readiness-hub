/**
 * Database loaders behind the API's org scoping: org_closure rows, organization
 * summaries, computed_org rows, member counts, and the org-scoping settings.
 * Pure resolution logic lives in util.ts; these are thin typed queries.
 */

import { pool } from '../db/pool.js'
import {
  DEFAULT_EXCLUDED_UNITS,
  DEFAULT_MEMBER_TYPES,
} from '../domain/loadDataset.js'
import type { ComputedOrgScope, Jsonified, OrgChartNode } from '../domain/computedTypes.js'
import type { UnitEsAnalysis } from '../domain/esUnit.js'
import type { UnitOrgStatsMetrics } from '../domain/orgStats.js'
import type { OrgSummary } from '../shared/contracts.js'
import { unitLabel, type ClosurePair, type OrgInfo } from './util.js'

export async function loadClosure(): Promise<ClosurePair[]> {
  const res = await pool.query<{ ancestor_orgid: number; descendant_orgid: number; depth: number }>(
    'SELECT ancestor_orgid, descendant_orgid, depth FROM org_closure',
  )
  return res.rows.map(r => ({
    ancestor: r.ancestor_orgid,
    descendant: r.descendant_orgid,
    depth: r.depth,
  }))
}

interface DbOrgRow {
  orgid: number
  name: string | null
  unit: string | null
  type: string | null
  scope: string | null
  wing: string | null
  region: string | null
}

/** organizations summaries by orgid; mirrors carry duplicate rows, first wins. */
export async function loadOrgInfo(orgids: readonly number[]): Promise<Map<number, OrgInfo>> {
  if (orgids.length === 0) return new Map()
  const res = await pool.query<DbOrgRow>(
    `SELECT DISTINCT ON (orgid) orgid, name, unit, type, scope, wing, region
     FROM organizations WHERE orgid = ANY($1::int[]) ORDER BY orgid`,
    [orgids],
  )
  const out = new Map<number, OrgInfo>()
  for (const r of res.rows) {
    out.set(r.orgid, {
      name: r.name ?? '',
      unit: r.unit ?? '',
      type: r.type ?? '',
      scope: r.scope ?? '',
      wing: r.wing ?? '',
      region: r.region ?? '',
    })
  }
  return out
}

export function orgSummaryOf(orgid: number, info: OrgInfo | undefined): OrgSummary {
  return {
    orgid,
    name: info?.name ?? (orgid === -1 ? 'Unassigned' : `Org ${orgid}`),
    unit: info?.unit ?? '',
    unitLabel: info ? unitLabel(info.region, info.wing, info.unit) : '',
    wing: info?.wing ?? '',
    region: info?.region ?? '',
    type: info?.type ?? '',
  }
}

/** computed_member self counts by orgid (includes -1 when unassigned members exist). */
export async function loadMemberCounts(): Promise<Map<number, number>> {
  const res = await pool.query<{ orgid: number; n: number }>(
    'SELECT orgid, count(*)::int AS n FROM computed_member GROUP BY orgid',
  )
  return new Map(res.rows.map(r => [r.orgid, r.n]))
}

export interface OrgScopingSettings {
  memberTypes: string[]
  excludedUnits: string[]
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((v): v is string => typeof v === 'string')
}

/** Same defaults and keys as domain/loadDataset.ts readSettings. */
export async function loadOrgSettings(): Promise<OrgScopingSettings> {
  let memberTypes: string[] = [...DEFAULT_MEMBER_TYPES]
  let excludedUnits: string[] = [...DEFAULT_EXCLUDED_UNITS]
  const res = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM app_settings WHERE key IN ('org.member_types', 'org.excluded_units')`,
  )
  for (const row of res.rows) {
    const arr = stringArray(row.value)
    if (arr === null) continue
    if (row.key === 'org.member_types') memberTypes = arr
    if (row.key === 'org.excluded_units') excludedUnits = arr
  }
  return {
    memberTypes: memberTypes.map(t => t.trim().toUpperCase()),
    excludedUnits: excludedUnits.map(u => u.trim()),
  }
}

export interface ComputedOrgRecord {
  orgid: number
  scope: ComputedOrgScope
  memberCount: number
  seniorCount: number
  cadetCount: number
  es: Jsonified<UnitEsAnalysis>
  orgStats: Jsonified<UnitOrgStatsMetrics> | null
  orgchart: OrgChartNode | null
}

interface DbComputedOrgRow {
  orgid: number
  scope: string
  member_count: number
  senior_count: number
  cadet_count: number
  es: unknown
  org_stats: unknown
  orgchart: unknown
}

function computedOrgOf(r: DbComputedOrgRow): ComputedOrgRecord {
  return {
    orgid: r.orgid,
    scope: r.scope === 'subtree' ? 'subtree' : 'self',
    memberCount: r.member_count,
    seniorCount: r.senior_count,
    cadetCount: r.cadet_count,
    es: r.es as Jsonified<UnitEsAnalysis>,
    orgStats: (r.org_stats as Jsonified<UnitOrgStatsMetrics> | null) ?? null,
    orgchart: (r.orgchart as OrgChartNode | null) ?? null,
  }
}

const COMPUTED_ORG_SELECT =
  'SELECT orgid, scope, member_count, senior_count, cadet_count, es, org_stats, orgchart FROM computed_org'

export async function loadComputedOrg(
  orgid: number,
  scope: ComputedOrgScope,
): Promise<ComputedOrgRecord | null> {
  const res = await pool.query<DbComputedOrgRow>(
    `${COMPUTED_ORG_SELECT} WHERE orgid = $1 AND scope = $2`,
    [orgid, scope],
  )
  const row = res.rows[0]
  return row ? computedOrgOf(row) : null
}

export async function loadComputedOrgSelfRows(
  orgids: readonly number[],
): Promise<ComputedOrgRecord[]> {
  if (orgids.length === 0) return []
  const res = await pool.query<DbComputedOrgRow>(
    `${COMPUTED_ORG_SELECT} WHERE scope = 'self' AND orgid = ANY($1::int[])`,
    [orgids],
  )
  return res.rows.map(computedOrgOf)
}
