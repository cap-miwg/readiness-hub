/**
 * Senior promotion rules. Two tables are exported on purpose:
 * - v1PromotionRules: verbatim what v1 shipped (ConfigPromotionRules.html),
 *   kept so tests can assert exactly which rows v2 corrected.
 * - PROMOTION_RULES: the corrected table per CAPR 35-5 (22 Nov 2016)
 *   Figures 2, 8, 9, 10. The exact diffs are documented in MIGRATION-V1.md.
 */
import v1 from './v1-constants.json' with { type: 'json' }

export interface PromotionRule {
  next: string
  tigMonths: number
  /** Required E&T level (currentLevel >= level), unless requiredParts overrides. */
  level: number
  /** Months as a CAP member (from Member.Joined), CAPR 35-5 fig 2 note for SM. */
  minMembershipMonths?: number
  /** Specific level parts that must be complete (overrides the level check). */
  requiredParts?: string[]
  dutyReq?: string
  dutyMonths?: number
}

/** v1's table, verbatim (ConfigPromotionRules.html:2-16). Known wrong; see PROMOTION_RULES. */
export const v1PromotionRules: Readonly<Record<string, PromotionRule>> = v1.PROMOTION_RULES

/**
 * Corrected duty-performance promotion table, keyed by normalizeRank output.
 * Sources: CAPR 35-5 (22 Nov 2016) fig 2 (officers), fig 8/9 (NCOs),
 * fig 10 (flight officers).
 */
export const PROMOTION_RULES: Readonly<Record<string, PromotionRule>> = {
  // CAPR 35-5 fig 2: 2d Lt needs Level 1 + Level 2 Part 1 and 6 months as a member (v1 had no membership minimum).
  SM: { next: '2d Lt', tigMonths: 0, level: 1, requiredParts: ['L1', 'L2P1'], minMembershipMonths: 6 },
  // CAPR 35-5 fig 2: 18 months TIG, Level 2 (unchanged from v1).
  '2D LT': { next: '1st Lt', tigMonths: 18, level: 2 },
  // CAPR 35-5 fig 2: 30 months TIG, Level 3 (unchanged from v1).
  '1ST LT': { next: 'Capt', tigMonths: 30, level: 3 },
  // CAPR 35-5 fig 2: 4 years TIG (v1 had 36 months).
  CAPT: { next: 'Maj', tigMonths: 48, level: 4 },
  // CAPR 35-5 fig 2: 5 years TIG (v1 had 48 months).
  MAJ: { next: 'Lt Col', tigMonths: 60, level: 5 },
  // No LT COL row: Colonel is a special appointment (CAPR 35-5 section 3.2), not duty performance (v1 had one).
  // CAPR 35-5 fig 10 (flight officers, unchanged from v1).
  FO: { next: 'TFO', tigMonths: 18, level: 2 },
  TFO: { next: 'SFO', tigMonths: 30, level: 3 },
  // CAPR 35-5 fig 2: Captain requires 30 months as 1st Lt or SFO (v1 had 0).
  SFO: { next: 'Capt', tigMonths: 30, level: 3 },
  // CAPR 35-5 figs 8/9 (NCOs, unchanged from v1 except the MSGT label below).
  SSGT: { next: 'TSgt', tigMonths: 12, level: 2 },
  TSGT: { next: 'MSgt', tigMonths: 24, level: 3, dutyReq: 'Unit NCO', dutyMonths: 24 },
  // CAPR 35-5 fig 9 wording is "Squadron/Flight NCO" (v1 labeled it "NCO Advisor"); the
  // duty-title matcher in domain/senior.ts keeps v1's semantics for this rule.
  MSGT: { next: 'SMSgt', tigMonths: 36, level: 4, dutyReq: 'Squadron/Flight NCO', dutyMonths: 36 },
  SMSGT: { next: 'CMSgt', tigMonths: 48, level: 5, dutyReq: 'Command NCO', dutyMonths: 48 },
}

/**
 * Rank string -> PROMOTION_RULES key, ported from v1 UtilsDataParsing.html:52-71
 * (including its single-period replace and substring matches).
 */
export function normalizeRank(rank: string | null | undefined): string {
  if (!rank) return ''
  const r = rank.toUpperCase().replace('.', '').trim()
  if (r === 'SENIOR MEMBER' || r === 'SM') return 'SM'
  if (r.includes('SECOND') || r === '2D LT') return '2D LT'
  if (r.includes('FIRST') || r === '1ST LT') return '1ST LT'
  if (r.includes('CAPTAIN')) return 'CAPT'
  if (r.includes('MAJOR')) return 'MAJ'
  if (r.includes('LIEUTENANT COLONEL') || r === 'LT COL') return 'LT COL'
  if (r.includes('COLONEL')) return 'COL'
  if (r === 'FLIGHT OFFICER') return 'FO'
  if (r === 'TECHNICAL FLIGHT OFFICER') return 'TFO'
  if (r === 'SENIOR FLIGHT OFFICER') return 'SFO'
  if (r === 'STAFF SERGEANT') return 'SSGT'
  if (r === 'TECHNICAL SERGEANT') return 'TSGT'
  if (r === 'MASTER SERGEANT') return 'MSGT'
  if (r === 'SENIOR MASTER SERGEANT') return 'SMSGT'
  if (r === 'CHIEF MASTER SERGEANT') return 'CMSGT'
  return r
}
