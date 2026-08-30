/**
 * Emergency Services constants, typed views over the mechanical v1 extraction
 * (v1-constants.json, from v1 ConfigConstants.html). v1 keyed everything by
 * string; v2 canonical IDs are integers (docs/ARCHITECTURE.md, type
 * discipline). Conversions here parse the extracted strings so a hand-retyping
 * error is impossible.
 */
import v1 from './v1-constants.json' with { type: 'json' }

function toInt(value: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new Error(`v1-constants.json: expected integer id, got "${value}"`)
  }
  return n
}

const intSet = (values: readonly string[]): ReadonlySet<number> => new Set(values.map(toInt))

/**
 * Well-known ES achievement IDs.
 * v1 ConfigConstants.html:79-81 shipped SET: '217' with a comment admitting
 * SET is really 124 (217 is ICUT); the v1 services used the literal '124' for
 * every SET check. v2 exports the correct values (MIGRATION-V1.md).
 */
export const ES_ACHIEVEMENT_IDS = {
  GES: 53,
  SET: 124,
  ICUT: 217,
  /** v1 alias for the correct SET id; kept so ported call sites read the same. */
  SET_ACTUAL: 124,
  VFR_PILOT: 44,
  MISSION_SCANNER: 55,
  GTL: 69,
  IC3: 61,
  DRIVERS_LICENSE: 211,
  BCUT: 212,
  ACUT: 213,
} as const

/** Functional area code -> display name. */
export const ES_FUNCTIONAL_AREAS: Readonly<Record<string, string>> = v1.ES_FUNCTIONAL_AREAS

/** Badges, patches, IS/ICS courses, ET-Senior levels, BCUT/ACUT, old pilot quals: never displayed. */
export const ES_EXCLUDED_ACHIEVEMENT_IDS: ReadonlySet<number> = intSet(v1.ES_EXCLUDED_ACHIEVEMENT_IDS)

export const ES_EXCLUDED_FUNCTIONAL_AREAS: ReadonlySet<string> = new Set(v1.ES_EXCLUDED_FUNCTIONAL_AREAS)

export const ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS: ReadonlySet<string> = new Set(
  v1.ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS,
)

export type EsSpecialPrereq =
  | { type: 'OR'; options: number[] }
  | { type: 'CONDITIONAL_MEMBER_TYPE'; seniorAchvId: number; cadetAchvId: number }
  | { type: 'TASK'; taskId: number }
  | { type: 'OR_WITH_CROSS_TRAINING'; options: { achvId: number; crossTraining: number[] }[] }

export interface EsSpecialCase {
  name: string
  specialPrereqs: EsSpecialPrereq[]
}

interface RawSpecialPrereq {
  type: string
  options?: unknown[]
  senior?: string
  cadet?: string
  taskID?: string
}

function convertSpecialPrereq(raw: RawSpecialPrereq): EsSpecialPrereq {
  switch (raw.type) {
    case 'OR':
      return { type: 'OR', options: (raw.options as string[]).map(toInt) }
    case 'CONDITIONAL_MEMBER_TYPE':
      return {
        type: 'CONDITIONAL_MEMBER_TYPE',
        seniorAchvId: toInt(raw.senior as string),
        cadetAchvId: toInt(raw.cadet as string),
      }
    case 'TASK':
      return { type: 'TASK', taskId: toInt(raw.taskID as string) }
    case 'OR_WITH_CROSS_TRAINING':
      return {
        type: 'OR_WITH_CROSS_TRAINING',
        options: (raw.options as { achvID: string; crossTraining: string[] }[]).map(o => ({
          achvId: toInt(o.achvID),
          crossTraining: o.crossTraining.map(toInt),
        })),
      }
    default:
      throw new Error(`v1-constants.json: unknown special prerequisite type "${raw.type}"`)
  }
}

/**
 * Prerequisites eServices does not model in AchvStepAchv: VFR Pilot medical
 * OR, GES member-type conditional + ICS 100, PSC OR-with-cross-training,
 * UASMP task pair (v1 ConfigConstants.html:183-220).
 */
export const ES_PREREQUISITE_SPECIAL_CASES: ReadonlyMap<number, EsSpecialCase> = new Map(
  Object.entries(v1.ES_PREREQUISITE_SPECIAL_CASES).map(([id, raw]) => [
    toInt(id),
    {
      name: raw.name,
      specialPrereqs: (raw.specialPrereqs as RawSpecialPrereq[]).map(convertSpecialPrereq),
    },
  ]),
)

/**
 * Minimum age at qualification, AchvID -> years. Carried from v1
 * (ConfigConstants.html:226-261, claiming CAPR 60-1/60-3 as basis); not
 * verified against the regulations, see MIGRATION-V1.md.
 */
export const ES_AGE_REQUIREMENTS: ReadonlyMap<number, number> = new Map(
  Object.entries(v1.ES_AGE_REQUIREMENTS).map(([id, age]) => [toInt(id), age]),
)

/** Dashboard special handling ids (GES/OPSEC shown only when missing, SET/CD hidden). */
export const ES_DASHBOARD_SPECIAL = {
  GES: toInt(v1.ES_DASHBOARD_SPECIAL.GES),
  OPSEC: toInt(v1.ES_DASHBOARD_SPECIAL.OPSEC),
  SE_TRAINING: toInt(v1.ES_DASHBOARD_SPECIAL.SE_TRAINING),
  CD_COUNTERDRUG: toInt(v1.ES_DASHBOARD_SPECIAL.CD_COUNTERDRUG),
} as const

/** Qualifications that cannot have Skills Evaluators (GES, SET itself, courses, pilot quals). */
export const ES_NO_SKILLS_EVALUATOR_IDS: ReadonlySet<number> = intSet(v1.ES_NO_SKILLS_EVALUATOR_IDS)

/** Non-expiring qualifications excluded from profiles (GES excepted, it is special-cased). */
export const ES_NON_EXPIRING_EXCLUSIONS: ReadonlySet<number> = intSet(v1.ES_NON_EXPIRING_EXCLUSIONS)

export interface TeamPosition {
  code: string
  name: string
  achvId: number
  tier?: number
  section?: boolean
  branch?: boolean
}

export interface FieldOpsRequirements {
  name: string
  shortName: string
  icon: string
  description: string
  achvIds: { GTL: number; GTM1: number; GTM2: number; GTM3: number; UDF: number; GBD: number }
  gtmAchvIds: number[]
}

export interface AircrewRequirements {
  name: string
  shortName: string
  icon: string
  description: string
  minimum: { pilot: number; scanner: number }
  preferred: Readonly<Record<string, number>>
  achvIds: { MP: number; TMP: number; MS: number; MO: number; AP: number; AOBD: number }
  pilotAchvIds: number[]
  scannerAchvIds: number[]
}

export interface SuasRequirements {
  name: string
  shortName: string
  icon: string
  description: string
  minimum: { UASMP: number; UAST: number }
  achvIds: { UASMP: number; UAST: number }
}

export interface MissionBaseRequirements {
  name: string
  shortName: string
  icon: string
  description: string
  positions: TeamPosition[]
  minimumPositions: string[]
}

export interface CommandRequirements {
  name: string
  shortName: string
  icon: string
  description: string
  positions: TeamPosition[]
  icAchvIds: number[]
  sectionChiefAchvIds: number[]
}

export interface EsTeamRequirements {
  fieldOps: FieldOpsRequirements
  aircrew: AircrewRequirements
  suas: SuasRequirements
  missionBase: MissionBaseRequirements
  command: CommandRequirements
}

interface RawPosition {
  code: string
  name: string
  achvID: string
  tier?: number
  section?: boolean
  branch?: boolean
}

function convertPosition(raw: RawPosition): TeamPosition {
  const pos: TeamPosition = { code: raw.code, name: raw.name, achvId: toInt(raw.achvID) }
  if (raw.tier !== undefined) pos.tier = raw.tier
  if (raw.section !== undefined) pos.section = raw.section
  if (raw.branch !== undefined) pos.branch = raw.branch
  return pos
}

/** Team composition minimums per CAPR 60-3 as encoded by v1 (ConfigConstants.html:297-389). */
export const ES_TEAM_REQUIREMENTS: EsTeamRequirements = (() => {
  const raw = v1.ES_TEAM_REQUIREMENTS
  return {
    fieldOps: {
      name: raw.fieldOps.name,
      shortName: raw.fieldOps.shortName,
      icon: raw.fieldOps.icon,
      description: raw.fieldOps.description,
      achvIds: {
        GTL: toInt(raw.fieldOps.achvIDs.GTL),
        GTM1: toInt(raw.fieldOps.achvIDs.GTM1),
        GTM2: toInt(raw.fieldOps.achvIDs.GTM2),
        GTM3: toInt(raw.fieldOps.achvIDs.GTM3),
        UDF: toInt(raw.fieldOps.achvIDs.UDF),
        GBD: toInt(raw.fieldOps.achvIDs.GBD),
      },
      gtmAchvIds: raw.fieldOps.gtmAchvIDs.map(toInt),
    },
    aircrew: {
      name: raw.aircrew.name,
      shortName: raw.aircrew.shortName,
      icon: raw.aircrew.icon,
      description: raw.aircrew.description,
      minimum: raw.aircrew.minimum,
      preferred: raw.aircrew.preferred,
      achvIds: {
        MP: toInt(raw.aircrew.achvIDs.MP),
        TMP: toInt(raw.aircrew.achvIDs.TMP),
        MS: toInt(raw.aircrew.achvIDs.MS),
        MO: toInt(raw.aircrew.achvIDs.MO),
        AP: toInt(raw.aircrew.achvIDs.AP),
        AOBD: toInt(raw.aircrew.achvIDs.AOBD),
      },
      pilotAchvIds: raw.aircrew.pilotAchvIDs.map(toInt),
      scannerAchvIds: raw.aircrew.scannerAchvIDs.map(toInt),
    },
    suas: {
      name: raw.suas.name,
      shortName: raw.suas.shortName,
      icon: raw.suas.icon,
      description: raw.suas.description,
      minimum: raw.suas.minimum,
      achvIds: {
        UASMP: toInt(raw.suas.achvIDs.UASMP),
        UAST: toInt(raw.suas.achvIDs.UAST),
      },
    },
    missionBase: {
      name: raw.missionBase.name,
      shortName: raw.missionBase.shortName,
      icon: raw.missionBase.icon,
      description: raw.missionBase.description,
      positions: (raw.missionBase.positions as RawPosition[]).map(convertPosition),
      minimumPositions: [...raw.missionBase.minimumPositions],
    },
    command: {
      name: raw.command.name,
      shortName: raw.command.shortName,
      icon: raw.command.icon,
      description: raw.command.description,
      positions: (raw.command.positions as RawPosition[]).map(convertPosition),
      icAchvIds: raw.command.icAchvIDs.map(toInt),
      sectionChiefAchvIds: raw.command.sectionChiefAchvIDs.map(toInt),
    },
  }
})()

/** AchvID -> position code (GTL, MP, IC3, ...). */
export const ES_ACHV_TO_POSITION: ReadonlyMap<number, string> = new Map(
  Object.entries(v1.ES_ACHV_TO_POSITION).map(([id, code]) => [toInt(id), code]),
)

/** Position code -> AchvID, inverted like v1 ConfigConstants.html:408. */
export const ES_POSITION_TO_ACHV: ReadonlyMap<string, number> = new Map(
  [...ES_ACHV_TO_POSITION].map(([id, code]) => [code, id]),
)

export interface EsReadinessWeights {
  teamCapability: number
  qualificationHealth: number
  evaluatorCoverage: number
  riskMitigation: number
  pipelineStrength: number
}

/** Composite readiness weights, v1 engineering judgment (ConfigConstants.html:413-419). */
export const ES_READINESS_WEIGHTS: EsReadinessWeights = v1.ES_READINESS_WEIGHTS

export interface EsReadinessThresholds {
  excellent: number
  good: number
  fair: number
}

export const ES_READINESS_THRESHOLDS: EsReadinessThresholds = v1.ES_READINESS_THRESHOLDS

/** Duty titles that satisfy the ICUT Skills Evaluator communications requirement. */
export const COMMUNICATIONS_DUTY_POSITIONS: ReadonlySet<string> = new Set(v1.COMMUNICATIONS_DUTY_POSITIONS)

export interface EsStatusColor {
  bg: string
  text: string
  border: string
  badge: string
}

export const ES_STATUS_COLORS: Readonly<Record<string, EsStatusColor>> = v1.ES_STATUS_COLORS
