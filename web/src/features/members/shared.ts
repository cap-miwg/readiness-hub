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
 * Roster-level duty/track mismatch heuristic. The authoritative warnings
 * (hasTrack / warningMsg from v1 ServicesDataService.html:276-308) ride only
 * on the profile payload; list rows carry the duty's functional area, which
 * the compute layer fills from DUTY_TO_TRACK_MAP when CAPWATCH omits it, so
 * the same substring match against enrolled tracks approximates them.
 */
export function dutyLacksTrack(
  functArea: string | null,
  tracks: readonly { track: string }[],
): boolean {
  if (functArea === null || functArea.trim() === '') return false
  const want = functArea.toUpperCase().trim()
  return !tracks.some(t => {
    const name = t.track.toUpperCase().trim()
    return name.includes(want) || want.includes(name)
  })
}

export function trackLacksDuty(
  track: { track: string; trackLevel: string },
  duties: readonly { functArea: string | null }[],
): boolean {
  if (track.trackLevel.toUpperCase().trim() !== 'NONE') return false
  const name = track.track.toUpperCase().trim()
  return !duties.some(d => {
    if (d.functArea === null) return false
    const fa = d.functArea.toUpperCase().trim()
    return fa === name || name.includes(fa) || fa.includes(name)
  })
}

/**
 * The one discrepancy a senior roster row may carry (V2-DESIGN-PLAN.md
 * section 6: one meaningful discrepancy indicator per row). Track-without-
 * duty outranks duty-without-track; the returned sentence names it.
 */
export function seniorDiscrepancyOf(row: SeniorRow): string | null {
  for (const t of row.tracks) {
    if (trackLacksDuty(t, row.duties)) {
      return `${t.track}: enrolled with no matching duty assignment`
    }
  }
  for (const d of row.duties) {
    if (dutyLacksTrack(d.functArea, row.tracks)) {
      return `${d.duty}: missing specialty track${d.functArea !== null ? ` (${d.functArea})` : ''}`
    }
  }
  return null
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
