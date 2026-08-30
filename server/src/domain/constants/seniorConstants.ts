/**
 * Senior Education & Training constants, typed views over the mechanical v1
 * extraction (v1-constants.json, from v1 ConfigConstants.html).
 */
import v1 from './v1-constants.json' with { type: 'json' }

export type LevelId = 'L1' | 'L2P1' | 'L2P2' | 'L3' | 'L4' | 'L5'

export interface LevelDef {
  id: LevelId
  label: string
  name: string
  /** Substring matched against PL_Paths.PathName to find the level's PathID. */
  pathMatch: string
  /** Fallback PathName substring when pathMatch finds nothing (L2P2 -> "Level 2"). */
  fallbackMatch?: string
  baseLevel: number
  /** SeniorLevel.Lvl value for the pre-Professional-Learning legacy award. */
  legacyKey?: string
}

interface RawLevel {
  id: string
  label: string
  name: string
  pathMatch: string
  fallbackMatch?: string
  baseLevel: number
  legacyKey?: string
}

/** The six E&T levels; v1 splits Level 2 into two parts (ConfigConstants.html:914-921). */
export const LEVELS: readonly LevelDef[] = (v1.LEVELS as RawLevel[]).map(raw => {
  const def: LevelDef = {
    id: raw.id as LevelId,
    label: raw.label,
    name: raw.name,
    pathMatch: raw.pathMatch,
    baseLevel: raw.baseLevel,
  }
  if (raw.fallbackMatch !== undefined) def.fallbackMatch = raw.fallbackMatch
  if (raw.legacyKey !== undefined) def.legacyKey = raw.legacyKey
  return def
})

export const LEVEL_ORDER: readonly LevelId[] = LEVELS.map(l => l.id)

export const LEVEL_DISPLAY_MAP: ReadonlyMap<LevelId, LevelDef> = new Map(LEVELS.map(l => [l.id, l]))

/** v1 ConfigConstants.html:924: uppercase and strip everything but A-Z0-9. */
export function normalizeTaskName(name?: string | null): string {
  return (name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** v1 ConfigConstants.html:55-66: the only mapped case drops the " OFFICER" suffix from IT. */
export function normalizeTrackDisplayName(trackName: string | null | undefined): string | null {
  if (!trackName) return trackName ?? null
  if (trackName.toUpperCase().trim() === 'INFORMATION TECHNOLOGY OFFICER') {
    return 'INFORMATION TECHNOLOGY'
  }
  return trackName
}

/** Moderated (instructor-led) module names per level, verbatim from v1. */
export const MODERATED_MODULES: Readonly<Record<string, readonly string[]>> = v1.MODERATED_MODULES

/**
 * Level -> normalized moderated module names, rebuilt from MODERATED_MODULES
 * with normalizeTaskName exactly as v1 ConfigConstants.html:1016 did (the
 * extracted MODERATED_LOOKUP in v1-constants.json is asserted equal in tests).
 */
export const MODERATED_LOOKUP: ReadonlyMap<LevelId, ReadonlySet<string>> = new Map(
  (Object.entries(v1.MODERATED_MODULES) as [LevelId, string[]][]).map(([levelId, names]) => [
    levelId,
    new Set(names.map(n => normalizeTaskName(n))),
  ]),
)

function toInt(value: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new Error(`v1-constants.json: expected integer id, got "${value}"`)
  }
  return n
}

/** Level 2 track-choice TaskID -> track name (190 CADET, 268 MILITARY, 269 NEW, 270 PROFESSIONAL). */
export const LEVEL2_TRACK_CHOICES: ReadonlyMap<number, string> = new Map(
  Object.entries(v1.LEVEL2_TRACK_CHOICES).map(([id, track]) => [toInt(id), track]),
)

/** Level 2 TaskID -> tracks the task applies to ("ALL" or a subset). */
export const LEVEL2_TASK_TRACKS: ReadonlyMap<number, readonly string[]> = new Map(
  Object.entries(v1.LEVEL2_TASK_TRACKS).map(([id, tracks]) => [toInt(id), tracks]),
)

/** Duty title (uppercase) -> specialty track expected for that duty. */
export const DUTY_TO_TRACK_MAP: Readonly<Record<string, string>> = v1.DUTY_TO_TRACK_MAP
