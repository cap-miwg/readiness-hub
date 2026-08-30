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
  /**
   * CAPWATCH_FETCH_CRON verbatim when a scheduled fetch is configured, else
   * null. Feeds the Home "About the data" panel's next-expected fact
   * (V2-DESIGN-PLAN.md section 5); the client humanizes the cron.
   */
  ingestSchedule: string | null
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
  /** Wing code (e.g. MI) for the MI-104 charter chip; '' on pseudo-nodes. */
  wing?: string
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

/** One point of the 12-month strength sparkline (org_statistics TOTAL counts). */
export interface StrengthPoint {
  /** Month key, yyyy-mm. */
  month: string
  /** Combined (senior + cadet) TOTAL for that month across the scope. */
  total: number
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
  /**
   * Masthead meeting line for the requested org itself (never aggregated),
   * from the OrgMeetings ingest: "Meets Thursdays 18:30, Riverside Armory".
   * Null when the unit records no meeting in eServices (render nothing, per
   * the NOT RECORDED convention).
   */
  meetingLine?: string | null
  /**
   * Combined membership now minus 12 months ago for the scope, from the
   * computed org_stats monthly series; null with under 12 months of history.
   * Renders as the delta under the Members figure.
   */
  strengthDelta12mo?: number | null
  /** Up to 12 monthly points, oldest first, for the ink sparkline. */
  strengthSeries?: StrengthPoint[]
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

// --- Needs Attention findings (V2-DESIGN-PLAN.md section 6, module 1) ---

/**
 * ACTION = scarlet verdict (actionable now), WATCH = bordered yellow diamond
 * (approaching problem), PLAN = Symbol Blue chip (scheduled work).
 */
export type FindingCategory = 'action' | 'watch' | 'plan'

/**
 * One ranked queue row: one sentence, one deep link. Text carries counts,
 * never member names (D9); the SPOF finding names the position at rest.
 */
export interface Finding {
  /** Stable slug per finding kind, e.g. 'es-quals-expired', 'spof-gtl'. */
  id: string
  category: FindingCategory
  /** One plain-English sentence. */
  text: string
  /** App-relative deep link carrying orgid (and descendants) params. */
  href: string
  /** Short verb phrase for the action link, e.g. "Review expirations". */
  actionLabel: string
  /** 1-based position in the ranked queue (action > watch > plan). */
  rank: number
}

/**
 * GET /api/orgs/:orgid/findings?descendants=. Capped at 5; findings is []
 * for a healthy scope (the calm empty state renders client-side).
 */
export interface FindingsResponse {
  orgid: number
  descendants: boolean
  findings: Finding[]
}

// --- My Progress (D11, Home platform page) ---

export type MyProgressScope = 'senior' | 'cadet' | 'other'

export interface MyProgressFigure {
  label: string
  /** Display-ready value ("148", "2 of 5", "Met", "Not recorded"). */
  value: string
  caption?: string
}

export interface MyProgressChecklistItem {
  label: string
  done: boolean
  /** Progress or evidence detail ("8 of 12 months"); null when none. */
  detail: string | null
}

export interface MyProgressExpiringQual {
  qualification: string
  /** ISO yyyy-mm-dd. */
  expiration: string | null
  daysUntil: number | null
}

export interface MyProgressMember {
  capid: number
  fullName: string
  rank: string
  orgid: number
  /** "GLR-MI-104" style label; null for the Unassigned pseudo-org. */
  unitLabel: string | null
  scope: MyProgressScope
}

/**
 * GET /api/me/progress. Identity resolution per D11: the session email's
 * local part as an integer CAPID, else a unique MbrContact PRIMARY EMAIL
 * match; zero or ambiguous matches return matched: false and nothing else
 * (the card degrades gracefully, never guesses). Copy is plain English: no
 * bare acronyms without expansion on first use.
 */
export interface MyProgressResponse {
  matched: boolean
  member?: MyProgressMember
  /** One or two plain-English sentences naming the next concrete step. */
  nextAction?: string
  /** Up to three personal figures for the quiet numeral strip. */
  figures: MyProgressFigure[]
  /** Requirement checklist toward the next promotion or achievement. */
  checklist?: MyProgressChecklistItem[]
  /** Active Emergency Services qualifications expiring within 90 days. */
  expiringQuals?: MyProgressExpiringQual[]
}

// --- Announcements (admin-authored, V2-DESIGN-PLAN.md section 5) ---

/**
 * body is stored and served as PLAIN TEXT: the web renders it as text with
 * line breaks only, never as HTML or Markdown.
 */
export interface Announcement {
  id: number
  /** ISO timestamp. */
  createdAt: string
  authorEmail: string
  title: string
  body: string
  /** ISO yyyy-mm-dd display window; null = unbounded on that side. */
  startsAt: string | null
  endsAt: string | null
  archived: boolean
}

/** GET /api/announcements: active window only, newest first, limit 10. */
export interface AnnouncementsResponse {
  announcements: Announcement[]
}

/** GET /api/admin/announcements: everything incl. archived and scheduled. */
export interface AdminAnnouncementsResponse {
  announcements: Announcement[]
}

/**
 * POST /api/admin/announcements body. title <= 120 chars, body <= 2000 chars
 * of plain text, dates ISO yyyy-mm-dd with endsAt >= startsAt when both set.
 */
export interface AnnouncementInput {
  title: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
}

/** PUT /api/admin/announcements/:id body (full replace + archive toggle). */
export interface AnnouncementUpdateInput extends AnnouncementInput {
  archived?: boolean
}

/** POST/PUT reply. DELETE replies { ok: true }. */
export interface AnnouncementMutationResponse {
  announcement: Announcement
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
  /** Rows removed by a registry rowFilter (e.g. non-EMAIL MbrContact types). */
  droppedRows?: number
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

// --- Admin usage panel (V2-DESIGN-PLAN.md section 10 success metrics) ---

export interface UsageDailyPoint {
  /** ISO yyyy-mm-dd, bucketed on the database session's calendar day. */
  day: string
  /** Distinct authenticated users seen that day. */
  users: number
}

export interface UsageRouteCount {
  /** Normalized route pattern: query strings stripped, ids collapsed. */
  route: string
  hits: number
}

/**
 * GET /api/admin/usage: the access_log rollup behind the success-metric
 * baseline (150+ distinct 60-day actives, 20+ units viewed weekly). The
 * access_log retention window is 90 days, so every figure here fits inside it.
 */
export interface UsageResponse {
  distinctUsers7d: number
  distinctUsers30d: number
  distinctUsers60d: number
  requests30d: number
  /** Distinct org_param values requested in the last 7 days. */
  unitsViewed7d: number
  /** Exactly 30 points, oldest first, zero-filled days included. */
  dailyUsers: UsageDailyPoint[]
  /** Top 8 normalized routes by hits over the last 30 days. */
  topRoutes30d: UsageRouteCount[]
}
