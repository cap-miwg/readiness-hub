/**
 * The computed-table contract: one TypeScript shape per row of the tables in
 * migrations/003_computed.sql, plus the exact JSONB payload types. compute.ts
 * writes these rows; the API layer reads them and can rely on every shape
 * documented here. Keep this file free of server imports (pg, config, fastify):
 * domain types and plain constants only, mirroring dataset.ts.
 *
 * Nullability contract (the SQL mirrors carry no NOT NULL constraints, the
 * types here are the source of truth):
 * - computed_member rows exist only for members with MbrStatus ACTIVE and a
 *   member type in the app_settings 'org.member_types' include list.
 * - Senior-only columns (current_level, level_progress, tig_eligible_on) are
 *   null for cadets; cadet-only columns (next_achv_*, cadet_state_facts,
 *   tig_complete_on, hfz_valid_until, phase, honor_credit) are null for
 *   seniors. Discriminate with is_senior_scope / is_cadet_scope.
 * - Dates in typed columns are SQL date (pg returns a JS Date); dates inside
 *   JSONB payloads are ISO strings (see Jsonified<T>).
 */

import type { LevelsProgress, PromotionDetails, ProcessedSenior } from './senior.js'
import type { ProcessedCadet, PromotionReadiness, PromotionState } from './cadet.js'
import type { EsQualification } from './es.js'
import type { UnitEsAnalysis } from './esUnit.js'
import type { UnitOrgStatsMetrics } from './orgStats.js'

/** Table names, single source for compute staging and API reads. */
export const COMPUTED_MEMBER_TABLE = 'computed_member'
export const COMPUTED_MEMBER_DUTY_TABLE = 'computed_member_duty'
export const COMPUTED_MEMBER_TRACK_TABLE = 'computed_member_track'
export const COMPUTED_ORG_TABLE = 'computed_org'

/**
 * JSON serialization of a domain type: Date fields become ISO strings, all
 * other shapes pass through. JSONB payloads store domain results in exactly
 * this form (compute.ts round-trips through JSON before insert).
 */
export type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T

/**
 * computed_member.promotion: discriminated by kind (which always matches
 * is_senior_scope / is_cadet_scope). Null for seniors whose rank has no
 * duty-performance promotion rule (e.g. Lt Col, Col: special appointments per
 * CAPR 35-5 section 3.2) and for members in neither dashboard scope.
 */
export type ComputedPromotion =
  | { kind: 'senior'; details: Jsonified<PromotionDetails> }
  | { kind: 'cadet'; readiness: PromotionReadiness }

/**
 * computed_member.cadet_state_facts: the stored facts the API re-derives the
 * six-state promotion machine from at request time via
 * timeSensitive.deriveCadetState(facts, asOf), so a stalled ingest ages the
 * data banner instead of freezing time (docs/ARCHITECTURE.md, Compute).
 * Dates are ISO yyyy-mm-dd strings.
 */
export interface CadetStateFacts {
  /** Achievement 21 approved: state is SPAATZ_COMPLETE regardless of asOf. */
  spaatzComplete: boolean
  /**
   * Every controllable requirement for the next achievement was complete at
   * compute time (controllable = not activeParticipation / cadetOath /
   * timeInGrade, v1 ServicesCadetDataService.html:777-783).
   */
  reqsReady: boolean
  /**
   * The physicalFitness requirement was satisfied through the 180-day HFZ
   * window; when true and hfzValidUntil passes, read-time derivation must
   * degrade reqsReady and the fitness hard-requirement group.
   */
  hfzCounted: boolean
  hfzValidUntil: string | null
  /** Effective promotion date + 56 days; null when no effective date resolves. */
  tigEligibleOn: string | null
  /** Completed count of the 3 hard requirement groups (leadership / fitness / aerospace). */
  hardDone: number
  controllableDone: number
  controllableTotal: number
  /** The machine's answer at compute time, for display fallback and debugging. */
  stateAtCompute: PromotionState
}

/**
 * computed_member.es_summary: the member's dashboard-view ES picture.
 * qualifications is buildEsQualifications(forDashboard: true) output, which
 * carries per-qual expiration ISO dates so the API can re-derive
 * isExpiringSoon at any asOf via timeSensitive.isExpiringSoon.
 */
export interface ComputedEsSummary {
  counts: {
    active: number
    training: number
    expired: number
    missing: number
    notApproved: number
  }
  qualifications: Jsonified<EsQualification>[]
}

/**
 * computed_member.detail: the full per-member drill-down payload. senior and
 * cadet are the complete ProcessedSenior / ProcessedCadet results (duties,
 * tracks, levels, promotion, cadet requirements); esAll is the profile-view
 * qualification list (730-day expired retention), esDashboard the dashboard
 * view (180-day retention, GES/OPSEC synthesis).
 */
export interface ComputedMemberDetail {
  senior: Jsonified<ProcessedSenior> | null
  cadet: Jsonified<ProcessedCadet> | null
  esDashboard: Jsonified<EsQualification>[]
  esAll: Jsonified<EsQualification>[]
}

/** One row of computed_member. Field order matches COMPUTED_MEMBER_COLUMNS. */
export interface ComputedMemberRow {
  capid: number
  /** Home ORGID normalized into the anchor subtree (-1 = unassigned). */
  orgid: number
  nameLast: string
  nameFirst: string
  /** Display form "Rank NameLast, NameFirst" (v1 Index.html:4677 member string). */
  fullName: string
  /** Member.Rank; for cadets the current CadetRank when one resolves. */
  rank: string
  /** Member.Type verbatim (CADET | SENIOR | LIFE | FIFTY YEAR | ...). */
  memberType: string
  joined: Date | null
  expiration: Date | null
  rankDate: Date | null
  dobYear: number | null
  /** Age at compute time, 365.25-day years (v1 parity); null without DOB. */
  ageAsofCompute: number | null
  /** Senior dashboard scope: type SENIOR or LIFE (v1 ServicesDataService.html:314-321). */
  isSeniorScope: boolean
  /** Cadet dashboard scope: type CADET. */
  isCadetScope: boolean
  /** "Level N" display form for the highest complete E&T level; null when none (or cadet). */
  currentLevel: string | null
  levelProgress: Jsonified<LevelsProgress> | null
  promotion: ComputedPromotion | null
  /**
   * The date the member is (or becomes) fully promotion-eligible assuming only
   * time remains: null while a non-time requirement (level, duty assignment,
   * cadet controllable requirement) is outstanding. A past date means eligible
   * now: timeSensitive.isPromotableNow(promotableOn, asOf).
   * Senior duty-months gaps are estimated with v1's 30.44-day month.
   */
  promotableOn: Date | null
  /** Senior TIG-met date: RankDate + required TIG months (PromotionDetails.eligibleDate). */
  tigEligibleOn: Date | null
  /** Cadet next CadetAchvID (currentAchievement + 1); null past Spaatz. */
  nextAchvId: number | null
  nextAchvPublicNumber: number | null
  cadetStateFacts: CadetStateFacts | null
  /** Cadet TIG-met date: effective promotion date + 56 days. */
  tigCompleteOn: Date | null
  /** HFZ credit window end (DateTaken + 180 days) when a window record exists. */
  hfzValidUntil: Date | null
  /** Cadet: effective date of the current achievement (approval date, rank-date fallback). Senior: RankDate. */
  lastPromotionOn: Date | null
  /** Cadet phase number as text ('1'..'4'); null when phase 0 or senior. */
  phase: string | null
  /** Cadet: earned honor credit on at least one approved achievement. Null for seniors. */
  honorCredit: boolean | null
  esSummary: ComputedEsSummary
  /** Active quals expiring within 90 days at compute time (dashboard badge/sort). */
  esExpiringCount: number
  detail: ComputedMemberDetail
}

/** One row of computed_member_duty (multi-valued Senior/Cadet dashboard filters). */
export interface ComputedMemberDutyRow {
  capid: number
  duty: string
  asst: boolean
  heldAtOrgid: number
  /**
   * CAPWATCH FunctArea when present, else the DUTY_TO_TRACK_MAP derivation
   * (docs/ARCHITECTURE.md, Compute: Functional Area materialized from the map).
   */
  functArea: string | null
  lvl: string | null
  /** 'senior' = DutyPosition.txt row, 'cadet' = CadetDutyPositions.txt row. */
  source: 'senior' | 'cadet'
}

/** One row of computed_member_track. */
export interface ComputedMemberTrackRow {
  capid: number
  track: string
  /** NONE | TECHNICIAN | SENIOR | MASTER. */
  trackLevel: string
}

/**
 * One node of the computed_org.orgchart tree, ported from v1
 * Index.html:5037-5138 (cadet fixed hierarchy, additional-members node,
 * vacancy display rules by unit type) plus the traditional senior staff
 * structure (Index.html:4849-4905). Vacant-but-allowed nodes are included with
 * vacant: true; the client's hide-vacant toggle filters on that flag.
 */
export interface OrgChartNode {
  id: string
  title: string
  type: 'senior' | 'cadet'
  members: OrgChartMember[]
  /** No members on this node or anywhere beneath it. */
  vacant: boolean
  children: OrgChartNode[]
}

export interface OrgChartMember {
  /** Null only for synthetic display-only entries; real assignments carry CAPID. */
  capid: number | null
  /** "Rank NameLast, NameFirst" with " (A)" appended for assistants (v1 parity). */
  display: string
  asst: boolean
}

export type ComputedOrgScope = 'self' | 'subtree'

/**
 * One row of computed_org. scope 'self' covers members whose home org is this
 * org; 'subtree' covers the descendant set including self and, for the anchor
 * org only, the synthetic UNASSIGNED (-1) members. Member counts are ACTIVE
 * members of the include-list types.
 */
export interface ComputedOrgRow {
  orgid: number
  scope: ComputedOrgScope
  memberCount: number
  /** SENIOR + LIFE + FIFTY YEAR (orgStats classification, v1 ServicesOrgStatsDataService.html:26-34). */
  seniorCount: number
  cadetCount: number
  /** analyzeUnit result for the scope's member set. */
  es: Jsonified<UnitEsAnalysis>
  /** getMetricsForUnit result; null when no org_statistics rows cover the scope. */
  orgStats: Jsonified<UnitOrgStatsMetrics> | null
  /** Org chart tree; null only for scopes with no organizations row (never for real orgs). */
  orgchart: OrgChartNode | null
}

/**
 * Snake-case column lists in insert order; compute.ts serializes row objects
 * against these, and 003_computed.sql declares the same columns.
 */
export const COMPUTED_MEMBER_COLUMNS = [
  'capid',
  'orgid',
  'name_last',
  'name_first',
  'full_name',
  'rank',
  'member_type',
  'joined',
  'expiration',
  'rank_date',
  'dob_year',
  'age_asof_compute',
  'is_senior_scope',
  'is_cadet_scope',
  'current_level',
  'level_progress',
  'promotion',
  'promotable_on',
  'tig_eligible_on',
  'next_achv_id',
  'next_achv_public_number',
  'cadet_state_facts',
  'tig_complete_on',
  'hfz_valid_until',
  'last_promotion_on',
  'phase',
  'honor_credit',
  'es_summary',
  'es_expiring_count',
  'detail',
] as const

export const COMPUTED_MEMBER_DUTY_COLUMNS = [
  'capid',
  'duty',
  'asst',
  'held_at_orgid',
  'funct_area',
  'lvl',
  'source',
] as const

export const COMPUTED_MEMBER_TRACK_COLUMNS = ['capid', 'track', 'track_level'] as const

export const COMPUTED_ORG_COLUMNS = [
  'orgid',
  'scope',
  'member_count',
  'senior_count',
  'cadet_count',
  'es',
  'org_stats',
  'orgchart',
] as const
