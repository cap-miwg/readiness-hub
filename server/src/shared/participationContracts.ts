/**
 * Shared participation API contracts between server and web (the attendance
 * module, D7). Same rules as contracts.ts: no server-only imports, types and
 * plain constants only. Dates are ISO yyyy-mm-dd strings; rates are 0..1
 * fractions (null when no attendee rows exist to divide).
 *
 * Privacy posture: guests appear as counts only (guest identities are never
 * ingested), and quiet-member NAMES are served only when the resolved scope is
 * a single unit; above that scope the response carries counts alone (D9).
 * A scope where nothing is logged reports recorded=false and the web renders
 * the neutral NOT RECORDED state, never a red verdict.
 */

/** One calendar month of the trailing 12-month participation series. */
export interface ParticipationMonth {
  /** Calendar month, 'YYYY-MM'. */
  month: string
  /** Distinct attendance logs whose StartDate falls in the month. */
  meetings: number
  /**
   * Present=true attendee rows divided by all attendee rows for the month's
   * meetings (the roster-snapshot approximation); null when no attendee rows.
   */
  avgAttendanceRate: number | null
  /** Guest count (rows in the guest log; identities are never stored). */
  guests: number
}

/** Aggregates over the trailing 90 days. */
export interface ParticipationWindow {
  meetings: number
  /** Present rows / attendee rows across the window; null when no rows. */
  avgRate: number | null
  guests: number
}

/** A named quiet member; served at single-unit scope only (D9). */
export interface QuietMemberEntry {
  capid: number
  fullName: string
  /**
   * Most recent Present=true meeting date within the trailing 12 months;
   * null when the member has no recorded presence in that window.
   */
  lastPresentOn: string | null
}

/**
 * Active include-list members with zero Present=true rows in the trailing 60
 * days, counted only in units that log attendance (a unit that does not use
 * the eServices attendance module contributes nobody).
 */
export interface ParticipationQuiet {
  count: number
  /** Present ONLY when the resolved scope is a single unit (D9). */
  members?: QuietMemberEntry[]
}

export interface ParticipationResponse {
  orgid: number
  descendants: boolean
  /** Any meetings logged for the scope in the trailing 12 months. */
  recorded: boolean
  /** Exactly 12 entries, oldest month first, ending at the current month. */
  monthly: ParticipationMonth[]
  last90: ParticipationWindow
  quietMembers: ParticipationQuiet
}

/** Per-member participation facts for the member profile drill-down. */
export interface MemberParticipation {
  /** Most recent Present=true meeting date within 12 months, ISO date. */
  lastPresentOn: string | null
  /** The member's own present/rows rate over the trailing 90 days. */
  rate90: number | null
}
