/**
 * Quality Unit Award (QUA) constants, typed views over the mechanical v1
 * extraction (v1-constants.json, from v1 ConfigConstants.html:1044-1125).
 * Great Lakes Region QUA: fiscal-year cycle, 7 of 10 criteria.
 */
import v1 from './v1-constants.json' with { type: 'json' }

function toInt(value: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new Error(`v1-constants.json: expected integer id, got "${value}"`)
  }
  return n
}

/** ES operational qualifications counted for QUA criterion 4 (UDF, GTM3, MS, or above). */
export const QUA_OPERATIONAL_ES_ACHIEVEMENT_IDS: ReadonlySet<number> = new Set(
  v1.QUA_OPERATIONAL_ES_ACHIEVEMENT_IDS.map(toInt),
)

/** Rank spellings that count as Captain or higher for QUA criterion 5. */
export const QUA_CAPTAIN_OR_HIGHER_RANKS: ReadonlySet<string> = new Set(v1.QUA_CAPTAIN_OR_HIGHER_RANKS)

/** NCO rank spellings (alternative to the officer path for the SM promotion criterion). */
export const QUA_NCO_RANKS: ReadonlySet<string> = new Set(v1.QUA_NCO_RANKS)

export interface QuaEligibleUnitType {
  type: string
  threshold: number
  label: string
}

/** Unit types eligible for QUA and their member-count thresholds. */
export const QUA_ELIGIBLE_UNIT_TYPES: Readonly<Record<string, QuaEligibleUnitType>> =
  v1.QUA_ELIGIBLE_UNIT_TYPES

/** Training course names accepted as Cadet Protection Training (checked within 1 year). */
export const QUA_CADET_PROTECTION_COURSES: readonly string[] = v1.QUA_CADET_PROTECTION_COURSES

/** SeniorAwards.Award value for the Yeager Award. */
export const QUA_YEAGER_AWARD_NAME: string = v1.QUA_YEAGER_AWARD_NAME
