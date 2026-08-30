/**
 * Shared derived types and display metadata for the member surfaces (Senior
 * dashboard, Cadet dashboard, member profile modal). All payload types derive
 * from @shared/contracts via indexed access so the server stays the single
 * source of truth. Display metadata speaks the Quiet Authority verdict
 * grammar (docs/design/V2-DESIGN-PLAN.md section 3): color is a verdict,
 * category is never a color, and success is silence.
 */

import type {
  CadetRow,
  MemberProfileResponse,
  SeniorLevelId,
  SeniorRow,
} from '@shared/contracts'
import type { FilterOption, VerdictKind } from '../../components/ui'

export type LevelsProgressJson = NonNullable<SeniorRow['levelProgress']>
export type LevelProgressJson = LevelsProgressJson[SeniorLevelId]
export type SeniorPromotionJson = NonNullable<SeniorRow['promotion']>
export type MemberDetail = MemberProfileResponse['detail']
export type SeniorDetailJson = NonNullable<MemberDetail['senior']>
export type CadetDetailJson = NonNullable<MemberDetail['cadet']>
export type EsQualJson = MemberDetail['esAll'][number]
export type CadetReqsJson = NonNullable<CadetDetailJson['nextRequirements']>
export type ReqStatusJson = CadetReqsJson['requirements'][number]
export type CadetState = CadetRow['state']

export interface LevelMeta {
  id: SeniorLevelId
  label: string
  name: string
}

// The six E&T levels of the Education and Training program (v1
// ConfigConstants.html LEVELS; Level 2 is split into two parts).
export const LEVEL_META: readonly LevelMeta[] = [
  { id: 'L1', label: '1', name: 'Level 1' },
  { id: 'L2P1', label: '2.1', name: 'Level 2 Part 1' },
  { id: 'L2P2', label: '2.2', name: 'Level 2 Part 2' },
  { id: 'L3', label: '3', name: 'Level 3' },
  { id: 'L4', label: '4', name: 'Level 4' },
  { id: 'L5', label: '5', name: 'Level 5' },
]

export type LevelStatusJson = LevelProgressJson['status']

/**
 * E&T level status in verdict terms: submitted/ready work is planned work
 * (symbol), completion is quiet, never started is a not-recorded state.
 */
export const LEVEL_STATUS_META: Record<LevelStatusJson, { label: string; kind: VerdictKind }> = {
  completed: { label: 'Completed', kind: 'neutral' },
  pending: { label: 'Submitted', kind: 'plan' },
  ready: { label: 'Ready to submit', kind: 'plan' },
  'in-progress': { label: 'In progress', kind: 'neutral' },
  'not-started': { label: 'Not started', kind: 'notRecorded' },
}

export function levelProgressOf(
  progress: SeniorRow['levelProgress'],
  id: SeniorLevelId,
): LevelProgressJson | null {
  if (progress === null) return null
  return progress[id] ?? null
}

/**
 * Plain-text E&T line for roster rows ("Level 3 · 2 tasks to L4"), replacing
 * the v1 six-dot strip. The suffix names the first level not yet completed
 * and the required-task shortfall from LevelsProgress (server
 * domain/senior.ts: totalReq/totalComp are required-task counts).
 */
export function etLevelLine(
  currentLevel: string | null,
  progress: SeniorRow['levelProgress'],
): string {
  const base = currentLevel ?? 'Not started'
  if (progress === null) return base
  for (const meta of LEVEL_META) {
    const p = progress[meta.id]
    if (p === undefined || p.status === 'completed') continue
    if (p.status === 'pending') return `${base} · L${meta.label} submitted`
    if (p.status === 'ready') return `${base} · L${meta.label} ready to submit`
    if (p.totalReq > 0) {
      const remaining = Math.max(0, p.totalReq - p.totalComp)
      if (remaining > 0) {
        return `${base} · ${remaining} task${remaining === 1 ? '' : 's'} to L${meta.label}`
      }
    }
    return base
  }
  return base
}

/**
 * ES qualification status in verdict terms: Active is quiet, Training is
 * planned work, Expired is the actionable finding the dashboards count,
 * Not Approved is a watch state, Missing was never recorded.
 */
export const ES_STATUS_KIND: Record<string, VerdictKind> = {
  Active: 'neutral',
  Training: 'plan',
  Expired: 'action',
  'Not Approved': 'watch',
  Missing: 'notRecorded',
}

/**
 * Promotion-state verdict grammar for cadet rows: READY is planned work for
 * the board, NEARLY_READY is the watch state, waiting on time or effort is
 * neutral text (nothing to act on), Spaatz completion is quiet.
 */
export const CADET_STATE_META: Record<CadetState, { label: string; kind: VerdictKind }> = {
  READY: { label: 'Ready', kind: 'plan' },
  TIME_PENDING: { label: 'Time pending', kind: 'neutral' },
  NEARLY_READY: { label: 'Nearly ready', kind: 'watch' },
  IN_PROGRESS: { label: 'In progress', kind: 'neutral' },
  NOT_STARTED: { label: 'Not started', kind: 'neutral' },
  SPAATZ_COMPLETE: { label: 'Spaatz complete', kind: 'neutral' },
}

export interface CadetBlocker {
  kind: 'watch' | 'neutral'
  label: string
  title?: string
}

/**
 * The one named blocking requirement per cadet row (V2-DESIGN-PLAN.md
 * section 6, the blocker engine): HFZ credit missing or lapsed where the
 * next promotion requires it (Achievement 4 on, CAPR 60-1 fitness
 * requirement), else a future TIG date, else the next achievement.
 */
export function cadetBlockerOf(row: CadetRow, todayIso: string): CadetBlocker | null {
  if (row.state === 'SPAATZ_COMPLETE') return null
  const achv = row.nextAchvPublicNumber
  if (row.state === 'READY') {
    // Nothing blocks a READY cadet; the next step is the board, not a fix.
    return achv !== null
      ? { kind: 'neutral', label: `Next: Achv ${achv}`, title: 'Eligible now; awaiting promotion approval' }
      : null
  }
  const hfzMissing = row.hfzValidUntil === null || row.hfzValidUntil < todayIso
  if (achv !== null && achv >= 4 && hfzMissing) {
    return {
      kind: 'watch',
      label: 'HFZ',
      title:
        row.hfzValidUntil === null
          ? 'No HFZ credit on file; the next promotion requires one'
          : `HFZ credit lapsed ${row.hfzValidUntil}; the next promotion requires a current one`,
    }
  }
  if (row.tigCompleteOn !== null && row.tigCompleteOn > todayIso) {
    return { kind: 'neutral', label: `TIG ${row.tigCompleteOn}`, title: 'Time in grade completes on this date' }
  }
  if (achv !== null) return { kind: 'neutral', label: `Next: Achv ${achv}` }
  return null
}

/**
 * Blocker rollup for the Cadet dashboard tiles, derived from the same
 * per-row blocker engine (cadetBlockerOf) so the tiles and the row chips can
 * never disagree. Precedence per row: READY, then the HFZ watch blocker,
 * then a TIG wait (state TIME_PENDING), else in progress; SPAATZ_COMPLETE
 * counts nowhere (nothing left to block).
 */
export interface CadetTileRollup {
  ready: number
  blockedHfz: number
  blockedTig: number
  inProgress: number
}

export function cadetTileRollup(rows: readonly CadetRow[], todayIso: string): CadetTileRollup {
  const out: CadetTileRollup = { ready: 0, blockedHfz: 0, blockedTig: 0, inProgress: 0 }
  for (const row of rows) {
    if (row.state === 'READY') {
      out.ready++
      continue
    }
    if (row.state === 'SPAATZ_COMPLETE') continue
    const blocker = cadetBlockerOf(row, todayIso)
    if (blocker !== null && blocker.kind === 'watch') {
      // The only watch blocker the engine emits is HFZ missing or lapsed.
      out.blockedHfz++
      continue
    }
    if (row.state === 'TIME_PENDING') {
      out.blockedTig++
      continue
    }
    out.inProgress++
  }
  return out
}

/** ISO yyyy-mm-dd dates render verbatim; null renders as a neutral dash. */
export function fmtDate(iso: string | null | undefined): string {
  return iso ?? '-'
}

/**
 * Filter options derived from the unfiltered scope rows, with per-member
 * counts (each member counts once per distinct value).
 */
export function optionCounts<T>(
  rows: readonly T[] | undefined,
  pick: (row: T) => readonly string[],
): FilterOption[] {
  if (rows === undefined) return []
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const value of new Set(pick(row))) {
      if (value === '') continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }))
}

/**
 * Duty-to-required-track map, mirroring the server's authoritative
 * DUTY_TO_TRACK_MAP (server/src/domain/constants/v1-constants.json, applied
 * in domain/senior.ts applyDutyTrackWarnings). Mirrored here because roster
 * rows carry only the duty name and the CAPWATCH FunctArea code ('LG',
 * 'PD'), and matching those codes against track names is what made the old
 * heuristic fire on most rows. Keep in sync with the server copy.
 */
export const DUTY_TO_TRACK_MAP: Readonly<Record<string, string>> = {
  'AEROSPACE EDUCATION OFFICER': 'AEROSPACE',
  'CYBER EDUCATION OFFICER': 'AEROSPACE',
  'DIRECTOR OF AEROSPACE EDUCATION': 'AEROSPACE',
  'DEPUTY COMMANDER FOR CADETS': 'CADET PROGRAMS',
  'ACTIVITIES OFFICER': 'CADET PROGRAMS',
  'DRUG DEMAND REDUCTION OFFICER': 'CADET PROGRAMS',
  'FITNESS OFFICER': 'CADET PROGRAMS',
  'SQUADRON LEADERSHIP OFFICER': 'CADET PROGRAMS',
  'LEADERSHIP OFFICER': 'CADET PROGRAMS',
  'DIRECTOR OF CADET PROGRAMS': 'CADET PROGRAMS',
  COMMANDER: 'COMMAND',
  HISTORIAN: 'HISTORIAN',
  'HEALTH SERVICES OFFICER': 'HEALTH SERVICES',
  'DIRECTOR OF HEALTH SERVICES': 'HEALTH SERVICES',
  'COMMUNICATIONS OFFICER': 'COMMUNICATIONS',
  'DIRECTOR OF COMMUNICATIONS': 'COMMUNICATIONS',
  'DISASTER PREPAREDNESS OFFICER': 'EMERGENCY SERVICES',
  'EMERGENCY SERVICES OFFICER': 'EMERGENCY SERVICES',
  'EMERGENCY SERVICES TRAINING OFFICER': 'EMERGENCY SERVICES',
  'SEARCH AND RESCUE OFFICER': 'EMERGENCY SERVICES',
  'DIRECTOR OF EMERGENCY SERVICES': 'EMERGENCY SERVICES',
  'FINANCE OFFICER': 'FINANCE',
  'DIRECTOR OF FINANCE': 'FINANCE',
  'LEGAL OFFICER': 'LEGAL',
  'INFORMATION TECHNOLOGIES OFFICER': 'INFORMATION TECHNOLOGY',
  'WEB SECURITY ADMIN': 'INFORMATION TECHNOLOGY',
  'DIRECTOR OF INFORMATION TECHNOLOGY': 'INFORMATION TECHNOLOGY',
  'LOGISTICS OFFICER': 'LOGISTICS',
  'MAINTENANCE OFFICER': 'LOGISTICS',
  'SUPPLY OFFICER': 'LOGISTICS',
  'TRANSPORTATION OFFICER': 'LOGISTICS',
  'DIRECTOR OF LOGISTICS': 'LOGISTICS',
  'PUBLIC AFFAIRS OFFICER': 'PUBLIC AFFAIRS',
  'DIRECTOR OF PUBLIC AFFAIRS': 'PUBLIC AFFAIRS',
  'RECRUITING OFFICER': 'RECRUITING AND RETENTION',
  'RETENTION OFFICER': 'RECRUITING AND RETENTION',
  'RECRUITING AND RETENTION OFFICER': 'RECRUITING AND RETENTION',
  'DIRECTOR OF RECRUITING AND RETENTION': 'RECRUITING AND RETENTION',
  'ALERTING OFFICER': 'OPERATIONS',
  'HOMELAND SECURITY OFFICER': 'OPERATIONS',
  'OPERATIONS OFFICER': 'OPERATIONS',
  'SMALL UNMANNED AERIAL SYSTEMS OFFICER': 'OPERATIONS',
  'DIRECTOR OF OPERATIONS': 'OPERATIONS',
  'PERSONNEL OFFICER': 'PERSONNEL',
  'DIRECTOR OF PERSONNEL': 'PERSONNEL',
  'ADMINISTRATIVE OFFICER': 'ADMINISTRATION',
  'DIRECTOR OF ADMINISTRATION': 'ADMINISTRATION',
  'EDUCATION AND TRAINING OFFICER': 'PROFESSIONAL DEVELOPMENT',
  'TESTING OFFICER': 'PROFESSIONAL DEVELOPMENT',
  'DIRECTOR OF PROFESSIONAL DEVELOPMENT': 'PROFESSIONAL DEVELOPMENT',
  'DIRECTOR OF EDUCATION AND TRAINING': 'PROFESSIONAL DEVELOPMENT',
  'SAFETY OFFICER': 'SAFETY',
  'DIRECTOR OF SAFETY': 'SAFETY',
  'STANDARDIZATION AND EVALUATION OFFICER': 'STANDARDS AND EVALUATIONS',
  'STANDARDIZATION/EVALUATION OFFICER': 'STANDARDS AND EVALUATIONS',
  'DIRECTOR OF STANDARDIZATION AND EVALUATION': 'STANDARDS AND EVALUATIONS',
  'INSPECTOR GENERAL': 'INSPECTOR GENERAL',
  CHAPLAIN: 'CHAPLAIN',
  'CHARACTER DEVELOPMENT INSTRUCTOR': 'CHARACTER DEVELOPMENT',
}

export interface SeniorMissingTrack {
  /** The held duty that requires the track. */
  duty: string
  /** The required specialty track (map value, uppercase). */
  track: string
}

/**
 * The one actionable discrepancy a senior roster row may carry: a held duty
 * position whose required specialty track (DUTY_TO_TRACK_MAP) the member
 * does not hold at any level (enrollment at NONE counts as held, matching
 * the server rule in applyDutyTrackWarnings). Unmapped duties never fire,
 * and track-without-duty renders only in the profile modal, not the roster.
 */
export function seniorMissingTrackOf(row: SeniorRow): SeniorMissingTrack | null {
  for (const d of row.duties) {
    const required = DUTY_TO_TRACK_MAP[d.duty.toUpperCase().trim()]
    if (required === undefined) continue
    const held = row.tracks.some(t => {
      const name = t.track.toUpperCase().trim()
      return name.includes(required) || required.includes(name)
    })
    if (!held) return { duty: d.duty, track: required }
  }
  return null
}

/** "CADET PROGRAMS" renders as "Cadet Programs" in the roster mark. */
export function trackTitleCase(track: string): string {
  return track
    .toLowerCase()
    .split(' ')
    .map(w => (w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const TRACK_LEVEL_RANK: Record<string, number> = { MASTER: 3, SENIOR: 2, TECHNICIAN: 1, NONE: 0 }

/** Highest-rated specialty track leads the row; the full list lives in the modal. */
export function primaryTrackOf<T extends { trackLevel: string }>(tracks: readonly T[]): T | null {
  let best: T | null = null
  let bestRank = -1
  for (const t of tracks) {
    const rank = TRACK_LEVEL_RANK[t.trackLevel.toUpperCase().trim()] ?? 0
    if (rank > bestRank) {
      best = t
      bestRank = rank
    }
  }
  return best
}

/** Primary (non-assistant) duty leads the row; assistants trail with "(A)". */
export function primaryDutyOf<T extends { asst: boolean }>(duties: readonly T[]): T | null {
  return duties.find(d => !d.asst) ?? duties[0] ?? null
}
