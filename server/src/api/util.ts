/**
 * Pure helpers for the API layer: query-param parsing, org scope and tree
 * resolution from org_closure rows, the v1-ported dashboard filters, PII field
 * gating, feedback rate limiting, and Markdown neutralization. No database or
 * Fastify imports here so server/test/api.test.ts covers them directly.
 */

import { UNASSIGNED_ORGID } from '../ingest/orgTree.js'
import { normalizeRank } from '../domain/constants/index.js'
import type {
  CadetRow,
  CadetsResponse,
  LevelChip,
  OrgTreeNode,
  RankCategory,
  Role,
  SeniorLevelId,
  SeniorRow,
  UnitComparisonRow,
  OverviewViewMode,
} from '../shared/contracts.js'
import type { Jsonified } from '../domain/computedTypes.js'
import type { UnitEsAnalysis } from '../domain/esUnit.js'
import type { UnitOrgStatsMetrics } from '../domain/orgStats.js'

export { UNASSIGNED_ORGID }

const DAY_MS = 24 * 60 * 60 * 1000

// --- Value formatting ---

/**
 * Calendar-date string for a value that is either a UTC-midnight Date (parse
 * layer convention), a local-midnight Date (pg date columns), or an ISO string
 * already; the intended calendar date is preserved either way.
 */
export function isoDate(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null
  if (typeof d === 'string') return d.slice(0, 10)
  if (Number.isNaN(d.getTime())) return null
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoTimestamp(d: Date | null | undefined): string | null {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

/** Whole days elapsed since a stored date at asOf; null without a date. */
export function daysSince(date: Date | string | null, asOf: Date): number | null {
  if (date === null) return null
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((asOf.getTime() - t) / DAY_MS)
}

// --- Query param parsing ---

function firstOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export function parseBoolParam(value: unknown): boolean {
  const v = firstOf(value)
  return v === 'true' || v === '1'
}

/** Comma-separated (or repeated) list param; entries trimmed, empties dropped. */
export function parseCsvParam(value: unknown): string[] {
  const parts: string[] = []
  const values = Array.isArray(value) ? value : [value]
  for (const v of values) {
    if (typeof v !== 'string') continue
    for (const piece of v.split(',')) {
      const trimmed = piece.trim()
      if (trimmed !== '') parts.push(trimmed)
    }
  }
  return parts
}

export function parseIntParam(value: unknown): number | null {
  const v = firstOf(value)
  if (v === undefined || !/^-?\d{1,9}$/.test(v.trim())) return null
  return Number.parseInt(v.trim(), 10)
}

/**
 * Email local part parsed as an integer CAPID (the miwg.cap.gov Workspace
 * convention of CAPID-numbered mailboxes); null when the local part is not
 * purely numeric.
 */
export function capidFromEmail(email: string): number | null {
  const at = email.indexOf('@')
  if (at <= 0) return null
  const local = email.slice(0, at)
  if (!/^\d{1,9}$/.test(local)) return null
  return Number.parseInt(local, 10)
}

// --- Unit naming (v1 ServicesDataService.html buildUnitName parity) ---

/** Unit numbers compare zero-stripped then 3-padded. */
export function normalizeUnit(unit: string): string {
  const stripped = unit.trim().replace(/^0+/, '')
  return (stripped !== '' ? stripped : '0').padStart(3, '0')
}

export function unitLabel(region: string, wing: string, unit: string): string {
  return `${region}-${wing}-${normalizeUnit(unit)}`
}

/** Adoption unit key, v1 AppUnitOverview.html:1930-1937 (generalized off MI). */
export function adoptionUnitKey(wing: string, unit: string): string {
  return `${wing}-${normalizeUnit(unit)}`
}

// --- Org closure scope resolution ---

export interface ClosurePair {
  ancestor: number
  descendant: number
  depth: number
}

/**
 * The anchor org is the only real org that is an ancestor of the synthetic
 * UNASSIGNED node (ingest/orgTree.ts appends (anchor, -1, 1) on every build).
 * Null when the closure is empty (no ingest yet).
 */
export function anchorOrgidOf(closure: readonly ClosurePair[]): number | null {
  for (const row of closure) {
    if (row.descendant === UNASSIGNED_ORGID && row.ancestor !== UNASSIGNED_ORGID) {
      return row.ancestor
    }
  }
  return null
}

/** Real orgids in the anchor subtree (depth-0 rows, excluding UNASSIGNED). */
export function subtreeOrgidsOf(closure: readonly ClosurePair[]): number[] {
  const out: number[] = []
  for (const row of closure) {
    if (row.depth === 0 && row.descendant !== UNASSIGNED_ORGID) out.push(row.descendant)
  }
  return out
}

/**
 * Member scope for an org-scoped endpoint: the org itself, or every
 * descendant. UNASSIGNED (-1) rides along only where the closure carries it,
 * which is the anchor's descendant set (and the -1 node itself).
 */
export function resolveScopeOrgids(
  closure: readonly ClosurePair[],
  orgid: number,
  descendants: boolean,
): number[] | null {
  const known = closure.some(
    r => r.descendant === orgid && (r.depth === 0 || orgid === UNASSIGNED_ORGID),
  )
  if (!known) return null
  if (!descendants) return [orgid]
  const out: number[] = []
  for (const row of closure) {
    if (row.ancestor === orgid) out.push(row.descendant)
  }
  return out
}

// --- Org tree assembly for /api/orgs ---

export interface OrgInfo {
  name: string
  unit: string
  type: string
  scope: string
  wing: string
  region: string
}

export interface OrgTreeSource {
  anchorOrgid: number
  /** child orgid -> parent orgid, from org_closure depth-1 rows. */
  parents: ReadonlyMap<number, number>
  orgs: ReadonlyMap<number, OrgInfo>
  /** computed_member self counts by orgid (includes -1 when present). */
  counts: ReadonlyMap<number, number>
  /** app_settings 'org.excluded_units' unit numbers. */
  excludedUnits: readonly string[]
}

function nodeFor(orgid: number, src: OrgTreeSource): OrgTreeNode {
  const info = src.orgs.get(orgid)
  return {
    orgid,
    name: info?.name ?? `Org ${orgid}`,
    unit: info?.unit ?? '',
    type: info?.type ?? '',
    scope: info?.scope ?? '',
    memberCount: src.counts.get(orgid) ?? 0,
    children: [],
  }
}

/**
 * Anchor-subtree tree with excluded units dropped (children reparented to the
 * nearest kept ancestor; the anchor itself is never dropped) and the
 * Unassigned pseudo-node appended under the anchor only when -1 members exist.
 */
export function buildOrgTree(src: OrgTreeSource): OrgTreeNode {
  const childrenOf = new Map<number, number[]>()
  for (const [child, parent] of src.parents) {
    if (child === UNASSIGNED_ORGID) continue
    const arr = childrenOf.get(parent)
    if (arr) arr.push(child)
    else childrenOf.set(parent, [child])
  }
  const excluded = new Set(src.excludedUnits.map(normalizeUnit))
  const isExcluded = (orgid: number): boolean => {
    if (orgid === src.anchorOrgid) return false
    const info = src.orgs.get(orgid)
    return info !== undefined && excluded.has(normalizeUnit(info.unit))
  }

  const build = (orgid: number, seen: Set<number>): OrgTreeNode => {
    const node = nodeFor(orgid, src)
    const queue = [...(childrenOf.get(orgid) ?? [])]
    while (queue.length > 0) {
      const child = queue.shift() as number
      if (seen.has(child)) continue
      seen.add(child)
      if (isExcluded(child)) {
        queue.push(...(childrenOf.get(child) ?? []))
        continue
      }
      node.children.push(build(child, seen))
    }
    node.children.sort((a, b) => {
      const byUnit = normalizeUnit(a.unit).localeCompare(normalizeUnit(b.unit))
      return byUnit !== 0 ? byUnit : a.name.localeCompare(b.name)
    })
    return node
  }

  const root = build(src.anchorOrgid, new Set([src.anchorOrgid]))
  const unassignedCount = src.counts.get(UNASSIGNED_ORGID) ?? 0
  if (unassignedCount > 0) {
    root.children.push({
      orgid: UNASSIGNED_ORGID,
      name: 'Unassigned',
      unit: '',
      type: '',
      scope: '',
      memberCount: unassignedCount,
      children: [],
    })
  }
  return root
}

// --- Unit Overview view mode (v1 AppUnitOverview.html:1826-1846) ---

export function isCommandHqType(orgType: string): boolean {
  const t = orgType.toUpperCase()
  return (
    t.includes('GROUP') || t.includes('WING') || t.includes('REGION') || t.includes('NATIONAL')
  )
}

export function viewModeFor(orgType: string, descendants: boolean): OverviewViewMode {
  if (!isCommandHqType(orgType)) return 'operational'
  return descendants ? 'aggregate' : 'command-only'
}

export interface ComparisonSource {
  orgid: number
  name: string
  unitLabel: string
  memberCount: number
  seniorCount: number
  cadetCount: number
  es: Jsonified<UnitEsAnalysis>
  orgStats: Jsonified<UnitOrgStatsMetrics> | null
}

export function comparisonRowOf(src: ComparisonSource): UnitComparisonRow {
  const sustainability = src.orgStats?.metrics.sustainability ?? null
  return {
    orgid: src.orgid,
    name: src.name,
    unitLabel: src.unitLabel,
    memberCount: src.memberCount,
    seniorCount: src.seniorCount,
    cadetCount: src.cadetCount,
    readinessScore: src.es.readinessScore,
    readinessRating: src.es.readinessRating,
    quickSummary: src.es.quickSummary,
    sustainabilityScore: sustainability?.overallScore ?? null,
    sustainabilityRating: sustainability?.rating ?? null,
    retentionRate: src.orgStats?.metrics.retention?.retentionRate ?? null,
    recruitingMonthlyAverage: src.orgStats?.metrics.recruiting?.monthlyAverage ?? null,
    growthStatus: src.orgStats?.metrics.growth?.status ?? null,
  }
}

// --- Senior dashboard filters (v1 Index.html:1192-1279) ---

/** Rank category sets, verbatim from v1 Index.html:1204-1207. */
export const RANK_CATEGORY_SETS: Readonly<Record<RankCategory, readonly string[]>> = {
  OFFICER: ['2D LT', '1ST LT', 'CAPT', 'MAJ', 'LT COL', 'COL'],
  NCO: ['SSGT', 'TSGT', 'MSGT', 'SMSGT', 'CMSGT'],
  FLIGHT: ['FO', 'TFO', 'SFO'],
  SM: ['SM'],
}

export const SENIOR_LEVEL_IDS: readonly SeniorLevelId[] = [
  'L1',
  'L2P1',
  'L2P2',
  'L3',
  'L4',
  'L5',
]

function levelIdOf(value: unknown): SeniorLevelId | null {
  const v = firstOf(value)?.toUpperCase().trim()
  return SENIOR_LEVEL_IDS.find(id => id === v) ?? null
}

export interface SeniorFilters {
  rankCategories: string[]
  ranks: string[]
  trackLevels: string[]
  tracks: string[]
  functAreas: string[]
  duties: string[]
  dutyAsst: 'primary' | 'assistant' | null
  levelComplete: SeniorLevelId | null
  levelIncomplete: SeniorLevelId | null
  promotable: boolean
}

export function parseSeniorFilters(query: Record<string, unknown>): SeniorFilters {
  const upper = (values: string[]): string[] => values.map(v => v.toUpperCase().trim())
  const asst = firstOf(query['dutyAsst'])?.toLowerCase()
  return {
    rankCategories: upper(parseCsvParam(query['rankCategory'])),
    ranks: parseCsvParam(query['rank']).map(normalizeRank),
    trackLevels: upper(parseCsvParam(query['trackLevel'])),
    tracks: upper(parseCsvParam(query['track'])),
    functAreas: upper(parseCsvParam(query['functArea'])),
    duties: upper(parseCsvParam(query['duty'])),
    dutyAsst: asst === 'primary' || asst === 'assistant' ? asst : null,
    levelComplete: levelIdOf(query['levelComplete']),
    levelIncomplete: levelIdOf(query['levelIncomplete']),
    promotable: parseBoolParam(query['promotable']),
  }
}

function levelStatusOf(row: SeniorRow, level: SeniorLevelId): string | null {
  const progress = row.levelProgress
  if (progress === null) return null
  return progress[level]?.status ?? null
}

export function applySeniorFilters(
  rows: readonly SeniorRow[],
  f: SeniorFilters,
): SeniorRow[] {
  let out = [...rows]

  if (f.promotable) out = out.filter(r => r.promotable)

  if (f.levelComplete !== null) {
    const level = f.levelComplete
    out = out.filter(r => levelStatusOf(r, level) === 'completed')
  }
  if (f.levelIncomplete !== null) {
    const level = f.levelIncomplete
    // v1 Index.html:1184-1188: rows without progress for the level never match.
    out = out.filter(r => {
      const status = levelStatusOf(r, level)
      return status !== null && status !== 'completed'
    })
  }

  if (f.ranks.length > 0) {
    out = out.filter(r => f.ranks.includes(normalizeRank(r.rank)))
  }

  if (f.rankCategories.length > 0) {
    out = out.filter(r => {
      const rank = normalizeRank(r.rank)
      return f.rankCategories.some(cat => {
        const set = RANK_CATEGORY_SETS[cat as RankCategory]
        return set !== undefined && set.includes(rank)
      })
    })
  }

  if (f.tracks.length > 0 || f.trackLevels.length > 0) {
    out = out.filter(r => {
      // v1 Index.html:1216-1220: NONE matches trackless members only when no
      // specific track is also selected.
      if (f.trackLevels.includes('NONE') && r.tracks.length === 0) {
        return f.tracks.length === 0
      }
      const nameMatches = (track: string): boolean =>
        f.tracks.some(wanted => track.toUpperCase().trim().includes(wanted))
      if (f.tracks.length > 0 && f.trackLevels.length > 0) {
        return r.tracks.some(
          t => nameMatches(t.track) && f.trackLevels.includes(t.trackLevel.toUpperCase().trim()),
        )
      }
      if (f.tracks.length > 0) return r.tracks.some(t => nameMatches(t.track))
      return r.tracks.some(t => f.trackLevels.includes(t.trackLevel.toUpperCase().trim()))
    })
  }

  if (f.functAreas.length > 0) {
    out = out.filter(r =>
      r.duties.some(
        d => d.functArea !== null && f.functAreas.includes(d.functArea.toUpperCase().trim()),
      ),
    )
  }

  if (f.duties.length > 0) {
    out = out.filter(r =>
      r.duties.some(d => f.duties.some(wanted => d.duty.toUpperCase().trim().includes(wanted))),
    )
  }

  if (f.dutyAsst !== null) {
    const wantAsst = f.dutyAsst === 'assistant'
    out = out.filter(r => r.duties.some(d => d.asst === wantAsst))
  }

  return out
}

export function buildLevelChips(rows: readonly SeniorRow[]): LevelChip[] {
  return SENIOR_LEVEL_IDS.map(level => {
    let complete = 0
    let incomplete = 0
    for (const row of rows) {
      const status = levelStatusOf(row, level)
      if (status === 'completed') complete++
      else if (status !== null) incomplete++
    }
    return { level, complete, incomplete }
  })
}

// --- Cadet dashboard filters (v1 AppCadetDashboard.html:90-137) ---

export interface CadetFilters {
  states: string[]
  ranks: string[]
  duties: string[]
  phases: string[]
}

export function parseCadetFilters(query: Record<string, unknown>): CadetFilters {
  const upper = (values: string[]): string[] => values.map(v => v.toUpperCase().trim())
  return {
    states: upper(parseCsvParam(query['state'])),
    ranks: upper(parseCsvParam(query['rank'])),
    duties: upper(parseCsvParam(query['duty'])),
    phases: parseCsvParam(query['phase']),
  }
}

export function applyCadetFilters(rows: readonly CadetRow[], f: CadetFilters): CadetRow[] {
  let out = [...rows]
  if (f.states.length > 0) out = out.filter(r => f.states.includes(r.state))
  if (f.ranks.length > 0) {
    out = out.filter(r => f.ranks.includes(r.rank.toUpperCase().trim()))
  }
  if (f.duties.length > 0) {
    out = out.filter(r =>
      r.duties.some(d => f.duties.some(wanted => d.duty.toUpperCase().trim().includes(wanted))),
    )
  }
  if (f.phases.length > 0) {
    out = out.filter(r => r.phase !== null && f.phases.includes(r.phase))
  }
  return out
}

/**
 * Header tiles, v1 AppCadetDashboard.html:123-137: close is TIME_PENDING plus
 * NEARLY_READY, ninetyPlusDays counts 90+ days at the current grade, and
 * honorCredits sums credits (not cadets).
 */
export function buildCadetTiles(rows: readonly CadetRow[]): CadetsResponse['tiles'] {
  const phases: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 }
  let ready = 0
  let close = 0
  let ninetyPlusDays = 0
  let honorCredits = 0
  for (const row of rows) {
    if (row.state === 'READY') ready++
    if (row.state === 'TIME_PENDING' || row.state === 'NEARLY_READY') close++
    if (row.daysSincePromotion !== null && row.daysSincePromotion >= 90) ninetyPlusDays++
    honorCredits += row.honorCreditCount
    if (row.phase !== null) phases[row.phase] = (phases[row.phase] ?? 0) + 1
  }
  return { ready, close, ninetyPlusDays, honorCredits, phases }
}

// --- Member profile PII gating (docs/ARCHITECTURE.md, AuthN/AuthZ) ---

export interface ContactRecord {
  type: string
  priority: string
  contact: string
  doNotContact: boolean
}

export function primaryEmailOf(
  contacts: readonly ContactRecord[],
): { email: string | null; doNotContact: boolean } {
  const hit = contacts.find(
    c => c.type.toUpperCase().trim() === 'EMAIL' && c.priority.toUpperCase().trim() === 'PRIMARY',
  )
  return { email: hit?.contact ?? null, doNotContact: hit?.doNotContact ?? false }
}

/**
 * Parent/guardian email, suppressed when identical to the member's own email
 * (v1 ModalCadetProfile.html:147-158).
 */
export function parentEmailOf(
  contacts: readonly ContactRecord[],
  memberEmail: string | null,
): string | null {
  const hit = contacts.find(
    c =>
      c.type.toUpperCase().trim() === 'CADET PARENT EMAIL' &&
      c.priority.toUpperCase().trim() === 'PRIMARY',
  )
  const email = hit?.contact ?? null
  return email !== null && email === memberEmail ? null : email
}

/**
 * The PII rule is absolute: DOB and parent/guardian contact render only for
 * role admin; viewers get computed age elsewhere in the profile.
 */
export function restrictedBlock(
  role: Role,
  dob: string | null,
  parentEmail: string | null,
): { dob: string | null; parentEmail: string | null } | undefined {
  if (role !== 'admin') return undefined
  return { dob, parentEmail }
}

// --- Feedback rate limiting and Markdown neutralization ---

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private prune(key: string, now: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs)
    this.hits.set(key, kept)
    return kept
  }

  wouldAllow(key: string, now: number): boolean {
    return this.prune(key, now).length < this.limit
  }

  record(key: string, now: number): void {
    this.prune(key, now).push(now)
  }
}

/**
 * Neutralize untrusted user text for a GitHub issue body by quoting it inside
 * a fence longer than any backtick run it contains, so nothing inside can
 * escape the block or render as Markdown/mentions.
 */
export function fencedBlock(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}text\n${text}\n${fence}`
}

export function issueTitleOf(category: string, title: string): string {
  const clean = title.replace(/[\r\n`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `Feedback (${category}): ${clean}`
}

/** Reporter identity stays in the feedback table, never in the public issue. */
export function issueBodyOf(category: string, title: string, body: string): string {
  return [
    'In-app feedback (mirrored automatically; reporter recorded server-side).',
    '',
    `Category: ${category}`,
    '',
    'Title:',
    fencedBlock(title),
    '',
    'Body:',
    fencedBlock(body),
  ].join('\n')
}
