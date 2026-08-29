/**
 * Shared API contracts between server and web. The server is the source of
 * truth; web imports these types via the @shared alias. Keep this file free of
 * server-only imports: types, enums, and plain constants only.
 */

import type {
  ComputedEsSummary,
  ComputedMemberDetail,
  ComputedPromotion,
  Jsonified,
  OrgChartNode,
} from '../domain/computedTypes.js'
import type { PromotionState } from '../domain/cadet.js'
import type { LevelsProgress, PromotionDetails } from '../domain/senior.js'
import type { UnitEsAnalysis } from '../domain/esUnit.js'
import type { UnitOrgStatsMetrics } from '../domain/orgStats.js'

export type Role = 'viewer' | 'admin'

export interface MeResponse {
  email: string
  name: string
  role: Role
  authMode: 'dev' | 'google'
  /**
   * The viewer's home unit ORGID, resolved by parsing the email local part as
   * an integer CAPID and looking up computed_member.orgid. A Workspace
   * convention (CAPID@domain mailboxes), documented as such; absent when the
   * local part is not a CAPID or no computed member matches.
   */
  homeOrgid?: number
}

export interface MetaResponse {
  appVersion: string
  /** Deployment-configurable display name; defaults to "Readiness Hub". */
  appName: string
  /** Last successful ingest, ISO timestamp, null before first ingest. */
  lastIngestAt: string | null
  /** CAPWATCH DownLoadDate of the current dataset (extract generation time). */
  downloadDate: string | null
  memberCount: number
  orgCount: number
}

/**
 * One node of the anchor-subtree org tree served by /api/orgs. Units listed in
 * app_settings 'org.excluded_units' are dropped from the tree (their children,
 * if any, reparent to the nearest kept ancestor); their members remain in every
 * member-scoped endpoint (v1 parity: picker-only exclusion). A synthetic
 * 'Unassigned' node (orgid -1) appears under the anchor only when computed
 * members exist with orgid -1.
 */
export interface OrgTreeNode {
  orgid: number
  name: string
  unit: string
  type: string
  scope: string
  /** ACTIVE include-list members whose home org is this node (self scope). */
  memberCount: number
  children: OrgTreeNode[]
}

export interface OrgsResponse {
  anchorOrgid: number
  tree: OrgTreeNode
}

// --- Shared scope conventions ---
//
// Every org-scoped endpoint takes an integer orgid (path param) plus a
// `descendants` boolean query param (default false; accepts true/1). The
// member scope resolves through org_closure joined to computed_member.orgid;
// UNASSIGNED (-1) members belong to the anchor's descendants scope only, and
// orgid -1 itself addresses the Unassigned pseudo-node. Date fields in
// responses are ISO yyyy-mm-dd strings; timestamps are full ISO strings.
// Org-scoped endpoints return 404 with a message before the first ingest.

/** organizations row summary used across org-scoped responses. */
export interface OrgSummary {
  orgid: number
  name: string
  unit: string
  /** "REGION-WING-UNIT" with the unit zero-stripped then 3-padded (v1 buildUnitName). */
  unitLabel: string
  wing: string
  region: string
  type: string
}

/**
 * Unit Overview view mode, ported from v1 AppUnitOverview.html:1826-1846:
 * operational (Mode A) for non-HQ unit types; command-only (Mode B) when the
 * org type contains GROUP/WING/REGION/NATIONAL and descendants is false;
 * aggregate (Mode C) for a command HQ with descendants on.
 */
export type OverviewViewMode = 'operational' | 'command-only' | 'aggregate'

/** One subordinate operational unit in the Mode C comparison table. */
export interface UnitComparisonRow {
  orgid: number
  name: string
  unitLabel: string
  memberCount: number
  seniorCount: number
  cadetCount: number
  readinessScore: number
  readinessRating: string
  quickSummary: string
  sustainabilityScore: number | null
  sustainabilityRating: string | null
  retentionRate: number | null
  recruitingMonthlyAverage: number | null
  growthStatus: string | null
}

export interface OverviewResponse {
  orgid: number
  descendants: boolean
  /** computed_org granularity served: 'subtree' when descendants, else 'self'. */
  scope: 'self' | 'subtree'
  org: OrgSummary
  viewMode: OverviewViewMode
  totals: {
    members: number
    seniors: number
    cadets: number
    /** Real orgs in scope after unit exclusions (the "Units in Scope" tile). */
    unitsInScope: number
  }
  es: Jsonified<UnitEsAnalysis>
  orgStats: Jsonified<UnitOrgStatsMetrics> | null
  /**
   * Mode C only (null otherwise): descendants' self rows, HQ unit types and
   * excluded units dropped (v1 AppUnitOverview.html:1852-1866).
   */
  comparison: UnitComparisonRow[] | null
}

export interface EsAnalysisResponse {
  orgid: number
  descendants: boolean
  scope: 'self' | 'subtree'
  es: Jsonified<UnitEsAnalysis>
}

export interface OrgChartResponse {
  orgid: number
  descendants: boolean
  scope: 'self' | 'subtree'
  orgchart: OrgChartNode | null
}

// --- Senior dashboard ---

export type SeniorLevelId = 'L1' | 'L2P1' | 'L2P2' | 'L3' | 'L4' | 'L5'

/** Rank category sets ported from v1 Index.html:1204-1207. */
export type RankCategory = 'OFFICER' | 'NCO' | 'FLIGHT' | 'SM'

export type DutyAsstFilter = 'primary' | 'assistant'

/**
 * Query params for GET /api/orgs/:orgid/seniors. List params are
 * comma-separated. Matching semantics port v1 Index.html:1192-1279:
 * rank/rankCategory compare against normalizeRank output; track and duty match
 * case-insensitive substrings; trackLevel and functArea match exactly;
 * trackLevel NONE matches members with no tracks (only when no track filter is
 * set); track + trackLevel together must match on the same track (AND).
 * levelComplete/levelIncomplete take a SeniorLevelId and test
 * levelProgress[level].status === 'completed'. promotable=true keeps rows
 * where promotableOn has arrived (request-time isPromotableNow).
 */
export interface SeniorsQuery {
  descendants?: string
  rankCategory?: string
  rank?: string
  trackLevel?: string
  track?: string
  functArea?: string
  duty?: string
  dutyAsst?: DutyAsstFilter
  levelComplete?: SeniorLevelId
  levelIncomplete?: SeniorLevelId
  promotable?: string
}

export interface SeniorDutyItem {
  duty: string
  asst: boolean
  heldAtOrgid: number
  functArea: string | null
  lvl: string | null
  source: 'senior' | 'cadet'
}

export interface SeniorTrackItem {
  track: string
  /** NONE | TECHNICIAN | SENIOR | MASTER. */
  trackLevel: string
}

export interface EsCounts {
  active: number
  training: number
  expired: number
  missing: number
  notApproved: number
}

export interface SeniorRow {
  capid: number
  orgid: number
  fullName: string
  nameLast: string
  nameFirst: string
  rank: string
  memberType: string
  joined: string | null
  expiration: string | null
  rankDate: string | null
  currentLevel: string | null
  levelProgress: Jsonified<LevelsProgress> | null
  duties: SeniorDutyItem[]
  tracks: SeniorTrackItem[]
  promotion: Jsonified<PromotionDetails> | null
  /** Request-time isPromotableNow(promotableOn, now). */
  promotable: boolean
  promotableOn: string | null
  tigEligibleOn: string | null
  esCounts: EsCounts
  esExpiringCount: number
}

export interface LevelChip {
  level: SeniorLevelId
  complete: number
  incomplete: number
}

/**
 * Tiles (promotableCount, levelChips) are computed over the filtered rows,
 * matching v1's unitStats-over-displayData behavior (Index.html:1308-1324);
 * total is the pre-filter scope count.
 */
export interface SeniorsResponse {
  orgid: number
  descendants: boolean
  total: number
  promotableCount: number
  levelChips: LevelChip[]
  rows: SeniorRow[]
}

// --- Cadet dashboard ---

/**
 * Query params for GET /api/orgs/:orgid/cadets. List params comma-separated.
 * state filters the request-time PromotionState; rank matches the current
 * cadet rank exactly (case-insensitive); duty matches cadet duty names as
 * case-insensitive substrings (v1 AppCadetDashboard.html:95-112); phase
 * matches the phase column ('1'..'4').
 */
export interface CadetsQuery {
  descendants?: string
  state?: string
  rank?: string
  duty?: string
  phase?: string
}

export interface CadetDutyItem {
  duty: string
  asst: boolean
  heldAtOrgid: number
}

export interface CadetRow {
  capid: number
  orgid: number
  fullName: string
  nameLast: string
  nameFirst: string
  rank: string
  memberType: string
  joined: string | null
  expiration: string | null
  phase: string | null
  /** Request-time deriveCadetState(cadetStateFacts, now). */
  state: PromotionState
  /** Promotion message frozen at compute (display fallback). */
  stateMessage: string | null
  nextAchvId: number | null
  nextAchvPublicNumber: number | null
  tigCompleteOn: string | null
  hfzValidUntil: string | null
  lastPromotionOn: string | null
  /** Request-time days since lastPromotionOn; null without a promotion date. */
  daysSincePromotion: number | null
  honorCredit: boolean
  /** Honor credits earned across approved achievements (detail payload count). */
  honorCreditCount: number
  duties: CadetDutyItem[]
  esCounts: EsCounts
}

/**
 * Header tiles over the filtered rows (v1 AppCadetDashboard.html:123-137):
 * close = TIME_PENDING + NEARLY_READY; ninetyPlusDays = 90+ days since last
 * promotion; honorCredits = total credits, not cadet count. v1's CP Compliant
 * tile is not served: compute stores no Cadet Protection training facts in the
 * cadet detail payload, so it is not derivable here (dropped, documented).
 */
export interface CadetsResponse {
  orgid: number
  descendants: boolean
  total: number
  tiles: {
    ready: number
    close: number
    ninetyPlusDays: number
    honorCredits: number
    /** Counts keyed by phase '1'..'4'. */
    phases: Record<string, number>
  }
  rows: CadetRow[]
}

// --- Member profile ---

/**
 * GET /api/members/:capid. PII gate (docs/ARCHITECTURE.md, AuthN/AuthZ):
 * restricted is present only for role admin; viewers never receive DOB or
 * parent/guardian contact and get the computed age instead.
 */
export interface MemberProfileResponse {
  capid: number
  orgid: number
  fullName: string
  nameLast: string
  nameFirst: string
  rank: string
  memberType: string
  joined: string | null
  expiration: string | null
  rankDate: string | null
  /** Year-granularity age at request time; null without DOB data. */
  age: number | null
  isSeniorScope: boolean
  isCadetScope: boolean
  currentLevel: string | null
  phase: string | null
  promotion: ComputedPromotion | null
  /** Request-time isPromotableNow(promotableOn, now). */
  promotable: boolean
  /** Request-time cadet state; null for non-cadets. */
  cadetState: PromotionState | null
  esSummary: ComputedEsSummary
  esExpiringCount: number
  detail: ComputedMemberDetail
  /** Primary email from MbrContact (type EMAIL, priority PRIMARY). */
  email: string | null
  /** DoNotContact flag on that primary email contact. */
  doNotContact: boolean
  /**
   * Admin-only block. parentEmail is MbrContact type CADET PARENT EMAIL,
   * priority PRIMARY, suppressed when identical to the member email
   * (v1 ModalCadetProfile.html:147-158).
   */
  restricted?: {
    dob: string | null
    parentEmail: string | null
  }
}

// --- Google adoption sideload ---

export interface AdoptionUnitRow {
  /** Unit key in WING-### form (v1 AppUnitOverview.html:1930-1937). */
  unit: string
  rosterCount: number | null
  totalAccounts: number | null
  activeUsers: number | null
  recentLogin: number | null
  gmailActive: number | null
  driveActive: number | null
  adoptionRate: string | null
  collectionDate: string | null
}

export interface AdoptionUserRow {
  unit: string
  email: string | null
  fullName: string | null
  isActiveUser: boolean | null
  hasRecentLogin: boolean | null
  lastLoginDate: string | null
  hasGmailActivity: boolean | null
  hasDriveActivity: boolean | null
  collectionDate: string | null
}

/**
 * GET /api/orgs/:orgid/adoption. 404 with a message when no adoption data has
 * been sideloaded (the web renders the section only when this succeeds).
 * units covers the scope; users covers the requested org's own unit key.
 */
export interface AdoptionResponse {
  orgid: number
  descendants: boolean
  unitKey: string | null
  units: AdoptionUnitRow[]
  users: AdoptionUserRow[]
}

// --- Feedback ---

export type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other'

/**
 * POST /api/feedback. title <= 200 chars, body <= 5000 chars. Rate limited
 * 5/hour per user and 30/hour globally (429 when exceeded).
 */
export interface FeedbackRequest {
  category: FeedbackCategory
  title: string
  body: string
}

export interface FeedbackResponse {
  ok: true
  id: number
}

// --- Admin ---

export interface IngestFileStat {
  file: string
  table: string
  rows: number
  droppedColumns: string[]
  rejects: number
}

/** One ingest_runs row (GET /api/admin/runs, latest 50). */
export interface IngestRunSummary {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'succeeded' | 'failed' | 'aborted'
  source: 'upload' | 'fetch' | 'cli' | 'demo'
  downloadDate: string | null
  fileStats: { files: IngestFileStat[]; skippedEntries: string[] } | null
  error: string | null
  forced: boolean
}

/** Result of POST /api/admin/ingest and /api/admin/ingest/fetch. */
export interface IngestResponse {
  ok: boolean
  runId: number | null
  anchorOrgid: number | null
  downloadDate: string | null
  fileStats: IngestFileStat[]
  skippedEntries: string[]
  error: string | null
}

export interface AuditEntry {
  id: number
  at: string
  actorEmail: string
  action: string
  detail: Record<string, unknown>
}

export interface AuditResponse {
  entries: AuditEntry[]
}

/**
 * GET/PUT /api/admin/settings: only these two keys are writable. Changes to
 * memberTypes and excludedUnits take full effect at the next ingest compute;
 * the org tree and picker exclusion applies immediately.
 */
export interface AdminSettingsResponse {
  excludedUnits: string[]
  memberTypes: string[]
}

export interface AdminSettingsUpdate {
  excludedUnits?: string[]
  memberTypes?: string[]
}
