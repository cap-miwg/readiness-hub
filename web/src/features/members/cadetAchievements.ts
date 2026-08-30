/**
 * Cadet achievement naming data, ported verbatim from v1
 * UtilsCadetHelpers.html:2-35 and ConfigConstants.html (CADET_ACHIEVEMENT_NAMES,
 * CADET_ACHIEVEMENT_PIONEERS, CADET_PUBLIC_ACHIEVEMENT_NUMBERS,
 * CADET_MILESTONE_ACHIEVEMENTS, CADET_ACHIEVEMENT_TO_RANK, CADET_PHASES).
 * The API serves achievement ids; display names resolve client side.
 */

export const CADET_ACHIEVEMENT_NAMES: ReadonlyMap<number, string> = new Map([
  [1, 'Achievement 1'],
  [2, 'Achievement 2'],
  [3, 'Achievement 3'],
  [4, 'Wright Brothers'],
  [5, 'Achievement 4'],
  [6, 'Achievement 5'],
  [7, 'Achievement 6'],
  [8, 'Achievement 7'],
  [9, 'Achievement 8'],
  [10, 'Billy Mitchell'],
  [11, 'Achievement 9'],
  [12, 'Achievement 10'],
  [13, 'Achievement 11'],
  [14, 'Amelia Earhart'],
  [15, 'Achievement 12'],
  [16, 'Achievement 13'],
  [17, 'Achievement 14'],
  [18, 'Achievement 15'],
  [19, 'Achievement 16'],
  [20, 'Gen Ira C Eaker'],
  [21, 'Gen Carl A Spaatz'],
])

export const CADET_ACHIEVEMENT_PIONEERS: ReadonlyMap<number, string> = new Map([
  [1, 'Curry'],
  [2, 'Arnold'],
  [3, 'Feik'],
  [5, 'Rickenbacker'],
  [7, 'Doolittle'],
  [8, 'Goddard'],
  [9, 'Armstrong'],
  [12, 'Brown'],
  [17, 'Boyd'],
  [18, 'Ride'],
])

/**
 * Milestones are absent from the public-number map and fall through to their
 * raw CadetAchvID (v1 UtilsCadetHelpers.html:32-35).
 */
export const CADET_PUBLIC_ACHIEVEMENT_NUMBERS: ReadonlyMap<number, number> = new Map([
  [1, 1],
  [2, 2],
  [3, 3],
  [5, 4],
  [6, 5],
  [7, 6],
  [8, 7],
  [9, 8],
  [11, 9],
  [12, 10],
  [13, 11],
  [15, 12],
  [16, 13],
  [17, 14],
  [18, 15],
  [19, 16],
])

export const CADET_MILESTONE_ACHIEVEMENTS: readonly number[] = [4, 10, 14, 20, 21]

export const CADET_ACHIEVEMENT_TO_RANK: ReadonlyMap<number, string> = new Map([
  [1, 'C/Amn'],
  [2, 'C/A1C'],
  [3, 'C/SrA'],
  [4, 'C/SSgt'],
  [5, 'C/TSgt'],
  [6, 'C/MSgt'],
  [7, 'C/SMSgt'],
  [8, 'C/CMSgt'],
  [9, 'C/CMSgt'],
  [10, 'C/2d Lt'],
  [11, 'C/2d Lt'],
  [12, 'C/1st Lt'],
  [13, 'C/1st Lt'],
  [14, 'C/Capt'],
  [15, 'C/Capt'],
  [16, 'C/Capt'],
  [17, 'C/Maj'],
  [18, 'C/Maj'],
  [19, 'C/Maj'],
  [20, 'C/Lt Col'],
  [21, 'C/Col'],
])

export interface CadetPhaseDef {
  phase: number
  name: string
  achievements: readonly number[]
  milestoneAchv: number
  milestoneName: string
}

export const CADET_PHASE_DEFS: readonly CadetPhaseDef[] = [
  { phase: 1, name: 'Phase I (Learning)', achievements: [1, 2, 3], milestoneAchv: 4, milestoneName: 'Wright Brothers' },
  { phase: 2, name: 'Phase II (Leadership)', achievements: [5, 6, 7, 8, 9], milestoneAchv: 10, milestoneName: 'Billy Mitchell' },
  { phase: 3, name: 'Phase III (Command)', achievements: [11, 12, 13], milestoneAchv: 14, milestoneName: 'Amelia Earhart' },
  { phase: 4, name: 'Phase IV (Executive)', achievements: [15, 16, 17, 18, 19], milestoneAchv: 20, milestoneName: 'Ira C. Eaker' },
  { phase: 5, name: 'Spaatz Award', achievements: [], milestoneAchv: 21, milestoneName: 'Carl A. Spaatz' },
]

/** Base name plus pioneer name in parentheses (v1 UtilsCadetHelpers.html:18-29). */
export function achievementDisplayName(achievementId: number): string {
  const base = CADET_ACHIEVEMENT_NAMES.get(achievementId) ?? `Achievement ${achievementId}`
  const pioneer = CADET_ACHIEVEMENT_PIONEERS.get(achievementId)
  return pioneer !== undefined ? `${base} (${pioneer})` : base
}

export function publicAchievementNumber(achievementId: number): number | null {
  const mapped = CADET_PUBLIC_ACHIEVEMENT_NUMBERS.get(achievementId)
  if (mapped !== undefined) return mapped
  return achievementId !== 0 ? achievementId : null
}

export function isMilestoneAchievement(achievementId: number): boolean {
  return CADET_MILESTONE_ACHIEVEMENTS.includes(achievementId)
}
