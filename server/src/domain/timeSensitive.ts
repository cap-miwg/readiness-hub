/**
 * Read-time re-derivation of time-dependent flags from the dates stored in
 * computed_member. Compute freezes facts, never states: the API calls these
 * with request-time now() so a stalled ingest ages the data banner instead of
 * freezing time (docs/ARCHITECTURE.md, Compute). Pure functions; heavy rule
 * logic stays in the domain modules and these only re-evaluate the stored
 * time gates.
 */

import type { PromotionState } from './cadet.js'
import type { CadetStateFacts } from './computedTypes.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Accepts pg Dates and the ISO strings stored inside JSONB payloads. */
function toTime(value: Date | string | null): number | null {
  if (value === null) return null
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Re-derive the six-state cadet promotion machine (port of
 * ServicesCadetDataService.html:770-810 via domain/cadet.ts
 * calculatePromotionReadiness) from stored facts at any asOf. Only the time
 * gates move: TIG eligibility (tigEligibleOn) and HFZ currency
 * (hfzValidUntil, when the fitness requirement was satisfied through the
 * 180-day window). Everything else is frozen at compute, matching what the
 * stored columns can support.
 */
export function deriveCadetState(facts: CadetStateFacts, asOf: Date): PromotionState {
  if (facts.spaatzComplete) return 'SPAATZ_COMPLETE'

  const tigEligibleAt = toTime(facts.tigEligibleOn)
  const tigReady = tigEligibleAt !== null && asOf.getTime() >= tigEligibleAt

  const hfzValidAt = toTime(facts.hfzValidUntil)
  const hfzExpired =
    facts.hfzCounted && (hfzValidAt === null || asOf.getTime() > hfzValidAt)

  const reqsReady = facts.reqsReady && !hfzExpired
  // An expired HFZ window removes the fitness hard-requirement group and one
  // controllable completion; the other stored counts cannot move with time.
  const hardDone = Math.max(0, facts.hardDone - (hfzExpired ? 1 : 0))
  const controllableDone = Math.max(0, facts.controllableDone - (hfzExpired ? 1 : 0))

  if (tigReady && reqsReady) return 'READY'
  if (reqsReady && !tigReady) return 'TIME_PENDING'
  if (hardDone >= 2) return 'NEARLY_READY'
  if (controllableDone > 0) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

/**
 * computed_member.promotable_on semantics: a non-null date means every
 * non-time requirement was met at compute; the member is promotable once asOf
 * reaches it.
 */
export function isPromotableNow(promotableOn: Date | string | null, asOf: Date): boolean {
  const t = toTime(promotableOn)
  return t !== null && asOf.getTime() >= t
}

/**
 * Active-item expiration window: true when expiration falls inside
 * [asOf, asOf + windowDays]. Already-expired items return false (they are
 * expired, not expiring). Standard windows are 90/180/730 days
 * (docs/ARCHITECTURE.md, Compute).
 */
export function isExpiringSoon(
  expiration: Date | string | null,
  asOf: Date,
  windowDays: number,
): boolean {
  const t = toTime(expiration)
  if (t === null) return false
  const now = asOf.getTime()
  return t >= now && t <= now + windowDays * DAY_MS
}

/** Membership expiration against computed_member.expiration; same window rule. */
export function membershipExpiresSoon(
  expiration: Date | string | null,
  asOf: Date,
  windowDays: number,
): boolean {
  return isExpiringSoon(expiration, asOf, windowDays)
}

export function isExpired(expiration: Date | string | null, asOf: Date): boolean {
  const t = toTime(expiration)
  return t !== null && t < asOf.getTime()
}

/**
 * Age from computed_member.dob_year, year granularity: the age the member
 * reaches on their birthday during asOf's calendar year. Exact DOB is
 * admin-gated in members; viewer-facing age gates accept this coarseness.
 */
export function ageAsOf(dobYear: number | null, asOf: Date): number | null {
  if (dobYear === null) return null
  return asOf.getFullYear() - dobYear
}

/**
 * Turns targetAge (18, 21) during asOf's calendar year, from dob_year alone.
 */
export function approachingAge(dobYear: number | null, targetAge: number, asOf: Date): boolean {
  const age = ageAsOf(dobYear, asOf)
  return age !== null && age === targetAge
}

/** Days between asOf and a stored date; negative when the date has passed. */
export function daysUntil(date: Date | string | null, asOf: Date): number | null {
  const t = toTime(date)
  if (t === null) return null
  return Math.floor((t - asOf.getTime()) / DAY_MS)
}
