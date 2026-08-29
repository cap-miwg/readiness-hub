/**
 * Shared derived types and display metadata for the member surfaces (Senior
 * dashboard, Cadet dashboard, member profile modal). All payload types derive
 * from @shared/contracts via indexed access so the server stays the single
 * source of truth.
 */

import type {
  CadetRow,
  MemberProfileResponse,
  SeniorLevelId,
  SeniorRow,
} from '@shared/contracts'
import type { FilterOption, Tone } from '../../components/ui'

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

export const LEVEL_STATUS_META: Record<LevelStatusJson, { label: string; tone: Tone }> = {
  completed: { label: 'Completed', tone: 'green' },
  pending: { label: 'Submitted', tone: 'amber' },
  ready: { label: 'Ready to submit', tone: 'amber' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  'not-started': { label: 'Not started', tone: 'slate' },
}

export function levelProgressOf(
  progress: SeniorRow['levelProgress'],
  id: SeniorLevelId,
): LevelProgressJson | null {
  if (progress === null) return null
  return progress[id] ?? null
}

export const ES_STATUS_TONE: Record<string, Tone> = {
  Active: 'green',
  Training: 'blue',
  Expired: 'red',
  'Not Approved': 'amber',
  Missing: 'slate',
}

export const CADET_STATE_META: Record<CadetState, { label: string; tone: Tone; bar: string }> = {
  READY: { label: 'Ready', tone: 'green', bar: 'bg-green-500' },
  TIME_PENDING: { label: 'Time pending', tone: 'amber', bar: 'bg-amber-400' },
  NEARLY_READY: { label: 'Nearly ready', tone: 'blue', bar: 'bg-blue-400' },
  IN_PROGRESS: { label: 'In progress', tone: 'indigo', bar: 'bg-indigo-300' },
  NOT_STARTED: { label: 'Not started', tone: 'slate', bar: 'bg-slate-300' },
  SPAATZ_COMPLETE: { label: 'Spaatz complete', tone: 'green', bar: 'bg-emerald-500' },
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
