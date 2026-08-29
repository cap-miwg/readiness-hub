/**
 * Unit-level Emergency Services readiness analysis, ported from v1
 * ServicesESUnitAnalysisService.html. The caller passes the member set
 * (self vs subtree), so both computed_org granularities reuse the same
 * function (docs/ARCHITECTURE.md: unit ES readiness is a step function over
 * the merged member set and is not additive).
 */
import type { Dataset, MbrAchievementRow, MemberRow } from './dataset.js'
import {
  ES_ACHIEVEMENT_IDS,
  ES_ACHV_TO_POSITION,
  ES_DASHBOARD_SPECIAL,
  ES_EXCLUDED_ACHIEVEMENT_IDS,
  ES_EXCLUDED_FUNCTIONAL_AREAS,
  ES_NO_SKILLS_EVALUATOR_IDS,
  ES_READINESS_THRESHOLDS,
  ES_READINESS_WEIGHTS,
  ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS,
  ES_TEAM_REQUIREMENTS,
} from './constants/index.js'

const MS_PER_DAY = 86_400_000

// Patrons and Cadet Sponsors cannot participate in ES (v1 ServicesESUnitAnalysisService.html:29).
const EXCLUDED_MEMBER_TYPES: ReadonlySet<string> = new Set(['PATRON', 'CADET SPONSOR'])

function isEligibleEsMember(m: MemberRow): boolean {
  return m.mbrStatus.toUpperCase() === 'ACTIVE' && !EXCLUDED_MEMBER_TYPES.has(m.type.toUpperCase())
}

/** Active members of the given orgs eligible for ES (cadets included). */
export function getMembersForOrg(dataset: Dataset, orgids: ReadonlySet<number>): MemberRow[] {
  const out: MemberRow[] = []
  for (const orgid of orgids) {
    for (const m of dataset.membersByOrgid.get(orgid) ?? []) {
      if (isEligibleEsMember(m)) out.push(m)
    }
  }
  return out
}

function isDisplayableQual(dataset: Dataset, a: MbrAchievementRow): boolean {
  if (ES_EXCLUDED_ACHIEVEMENT_IDS.has(a.achvId)) return false
  const functionalArea = dataset.esAchievementById.get(a.achvId)?.functionalArea
  return !(functionalArea != null && ES_EXCLUDED_FUNCTIONAL_AREAS.has(functionalArea))
}

function getMemberActiveQuals(dataset: Dataset, capid: number): MbrAchievementRow[] {
  return (dataset.esAchievementsByCapid.get(capid) ?? []).filter(
    a => a.status.toUpperCase() === 'ACTIVE' && isDisplayableQual(dataset, a),
  )
}

/** One row per AchvID, preferring Active > Training > Not Approved > Expired. */
function getMemberAllQuals(dataset: Dataset, capid: number): MbrAchievementRow[] {
  const statusPriority: Record<string, number> = {
    ACTIVE: 1,
    TRAINING: 2,
    'NOT APPROVED': 3,
    EXPIRED: 4,
  }
  const byId = new Map<number, MbrAchievementRow>()
  for (const q of (dataset.esAchievementsByCapid.get(capid) ?? []).filter(a =>
    isDisplayableQual(dataset, a),
  )) {
    const existing = byId.get(q.achvId)
    if (existing === undefined) {
      byId.set(q.achvId, q)
      continue
    }
    const currentPriority = statusPriority[q.status.toUpperCase()] ?? 999
    const existingPriority = statusPriority[existing.status.toUpperCase()] ?? 999
    if (currentPriority < existingPriority) byId.set(q.achvId, q)
  }
  return [...byId.values()]
}

export interface QualifiedMember {
  capid: number
  name: string
  rank: string
  positions: string[]
}

export type TeamColor = 'green' | 'blue' | 'amber' | 'red'

export interface FieldOpsCapacity {
  name: string
  shortName: string
  icon: string
  canField: boolean
  canFieldGround: boolean
  canFieldUDF: boolean
  groundTeamsFieldable: number
  udfTeamsFieldable: number
  positionCounts: { GTL: number; GTM1: number; GTM2: number; GTM3: number; UDF: number; GBD: number }
  gaps: string[]
  qualifiedMembers: QualifiedMember[]
  color: TeamColor
}

/** Ground team: 1 GTL + 3 GTMs minimum; UDF team: 2 UDF members (CAPR 60-3 as encoded by v1 :149-155). */
export function calculateFieldOpsCapacity(dataset: Dataset, members: readonly MemberRow[]): FieldOpsCapacity {
  const req = ES_TEAM_REQUIREMENTS.fieldOps
  let gtl = 0
  let gtm1 = 0
  let gtm2 = 0
  let gtm3 = 0
  let udf = 0
  let gbd = 0
  const qualifiedMembers: QualifiedMember[] = []

  for (const m of members) {
    const positions: string[] = []
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      if (q.achvId === req.achvIds.GTL) {
        gtl++
        positions.push('GTL')
      }
      if (q.achvId === req.achvIds.GTM1) {
        gtm1++
        positions.push('GTM1')
      }
      if (q.achvId === req.achvIds.GTM2) {
        gtm2++
        positions.push('GTM2')
      }
      if (q.achvId === req.achvIds.GTM3) {
        gtm3++
        positions.push('GTM3')
      }
      if (q.achvId === req.achvIds.UDF) {
        udf++
        positions.push('UDF')
      }
      if (q.achvId === req.achvIds.GBD) {
        gbd++
        positions.push('GBD')
      }
    }
    if (positions.length > 0) {
      qualifiedMembers.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, positions })
    }
  }

  const gtmTotal = gtm1 + gtm2 + gtm3
  const groundTeamsFieldable = Math.min(gtl, Math.floor(gtmTotal / 3))
  const canFieldGround = gtl >= 1 && gtmTotal >= 3
  const udfTeamsFieldable = Math.floor(udf / 2)
  const canFieldUDF = udf >= 2
  const canField = canFieldGround || canFieldUDF

  const gaps: string[] = []
  if (gtl < 1) gaps.push('Need 1 GTL for ground team')
  else if (gtl === 1 && canFieldGround) gaps.push('Single GTL (SPOF)')
  if (gtmTotal < 3) gaps.push(`Need ${3 - gtmTotal} more GTM`)
  if (udf < 2) gaps.push(`Need ${2 - udf} more UDF`)

  let color: TeamColor = 'red'
  if (canFieldGround && canFieldUDF) {
    color = groundTeamsFieldable >= 2 || udfTeamsFieldable >= 2 ? 'green' : 'blue'
  } else if (canFieldGround || canFieldUDF) {
    color = 'blue'
  } else if (gtl > 0 || gtmTotal > 0 || udf > 0) {
    color = 'amber'
  }

  return {
    name: req.name,
    shortName: req.shortName,
    icon: req.icon,
    canField,
    canFieldGround,
    canFieldUDF,
    groundTeamsFieldable,
    udfTeamsFieldable,
    positionCounts: { GTL: gtl, GTM1: gtm1, GTM2: gtm2, GTM3: gtm3, UDF: udf, GBD: gbd },
    gaps,
    qualifiedMembers,
    color,
  }
}

export interface AircrewCapacity {
  name: string
  shortName: string
  icon: string
  canField: boolean
  teamsFieldable: number
  positionCounts: { MP: number; TMP: number; MS: number; MO: number; AP: number; AOBD: number }
  gaps: string[]
  qualifiedMembers: QualifiedMember[]
  color: TeamColor
}

/** Each aircrew needs 1 pilot (MP/TMP) and 1 scanner/observer (MS/MO). */
export function calculateAircrewCapacity(dataset: Dataset, members: readonly MemberRow[]): AircrewCapacity {
  const req = ES_TEAM_REQUIREMENTS.aircrew
  let mp = 0
  let tmp = 0
  let ms = 0
  let mo = 0
  let ap = 0
  let aobd = 0
  const qualifiedMembers: QualifiedMember[] = []

  for (const m of members) {
    const positions: string[] = []
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      if (q.achvId === req.achvIds.MP) {
        mp++
        positions.push('MP')
      }
      if (q.achvId === req.achvIds.TMP) {
        tmp++
        positions.push('TMP')
      }
      if (q.achvId === req.achvIds.MS) {
        ms++
        positions.push('MS')
      }
      if (q.achvId === req.achvIds.MO) {
        mo++
        positions.push('MO')
      }
      if (q.achvId === req.achvIds.AP) {
        ap++
        positions.push('AP')
      }
      if (q.achvId === req.achvIds.AOBD) {
        aobd++
        positions.push('AOBD')
      }
    }
    if (positions.length > 0) {
      qualifiedMembers.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, positions })
    }
  }

  const pilotTotal = mp + tmp
  const scannerTotal = ms + mo
  const teamsFieldable = Math.min(pilotTotal, scannerTotal)
  const canField = pilotTotal >= 1 && scannerTotal >= 1

  const gaps: string[] = []
  if (pilotTotal < 1) gaps.push('Need 1 pilot (MP/TMP)')
  else if (pilotTotal === 1) gaps.push('Single pilot (SPOF risk)')
  if (scannerTotal < 1) gaps.push('Need 1 scanner (MS/MO)')

  return {
    name: req.name,
    shortName: req.shortName,
    icon: req.icon,
    canField,
    teamsFieldable,
    positionCounts: { MP: mp, TMP: tmp, MS: ms, MO: mo, AP: ap, AOBD: aobd },
    gaps,
    qualifiedMembers,
    color: canField
      ? teamsFieldable >= 2
        ? 'green'
        : 'blue'
      : pilotTotal > 0 || scannerTotal > 0
        ? 'amber'
        : 'red',
  }
}

export interface SuasCapacity {
  name: string
  shortName: string
  icon: string
  canField: boolean
  teamsFieldable: number
  positionCounts: { UASMP: number; UAST: number }
  gaps: string[]
  qualifiedMembers: QualifiedMember[]
  color: TeamColor
}

export function calculateSuasCapacity(dataset: Dataset, members: readonly MemberRow[]): SuasCapacity {
  const req = ES_TEAM_REQUIREMENTS.suas
  let uasmp = 0
  let uast = 0
  const qualifiedMembers: QualifiedMember[] = []

  for (const m of members) {
    const positions: string[] = []
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      if (q.achvId === req.achvIds.UASMP) {
        uasmp++
        positions.push('UASMP')
      }
      if (q.achvId === req.achvIds.UAST) {
        uast++
        positions.push('UAST')
      }
    }
    if (positions.length > 0) {
      qualifiedMembers.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, positions })
    }
  }

  const teamsFieldable = Math.min(uasmp, uast)
  const canField = uasmp >= 1 && uast >= 1

  const gaps: string[] = []
  if (uasmp < 1) gaps.push('Need 1 UASMP')
  if (uast < 1) gaps.push('Need 1 UAST')

  return {
    name: req.name,
    shortName: req.shortName,
    icon: req.icon,
    canField,
    teamsFieldable,
    positionCounts: { UASMP: uasmp, UAST: uast },
    gaps,
    qualifiedMembers,
    color: canField ? 'green' : uasmp > 0 || uast > 0 ? 'amber' : 'red',
  }
}

export interface MissionBaseCapacity {
  name: string
  shortName: string
  icon: string
  isStaffing: true
  qualifiedCount: number
  positionsCovered: number
  totalPositionTypes: number
  hasMinimum: boolean
  positionCounts: Record<string, number>
  gaps: string[]
  qualifiedMembers: QualifiedMember[]
  color: TeamColor
}

export function calculateMissionBaseCapacity(
  dataset: Dataset,
  members: readonly MemberRow[],
): MissionBaseCapacity {
  const req = ES_TEAM_REQUIREMENTS.missionBase
  const positionCounts: Record<string, number> = {}
  for (const pos of req.positions) positionCounts[pos.code] = 0
  const qualifiedMembers: QualifiedMember[] = []

  for (const m of members) {
    const positions: string[] = []
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      const posInfo = req.positions.find(p => p.achvId === q.achvId)
      if (posInfo !== undefined) {
        positionCounts[posInfo.code] = (positionCounts[posInfo.code] ?? 0) + 1
        positions.push(posInfo.code)
      }
    }
    if (positions.length > 0) {
      qualifiedMembers.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, positions })
    }
  }

  const qualifiedCount = qualifiedMembers.length
  const positionsCovered = Object.values(positionCounts).filter(c => c > 0).length
  const totalPositionTypes = req.positions.length
  const hasMinimum = req.minimumPositions.every(code => (positionCounts[code] ?? 0) >= 1)

  const gaps: string[] = []
  for (const code of req.minimumPositions) {
    if ((positionCounts[code] ?? 0) < 1) gaps.push(`Need ${code}`)
  }

  return {
    name: req.name,
    shortName: req.shortName,
    icon: req.icon,
    isStaffing: true,
    qualifiedCount,
    positionsCovered,
    totalPositionTypes,
    hasMinimum,
    positionCounts,
    gaps,
    qualifiedMembers,
    color:
      positionsCovered >= 6 ? 'green' : positionsCovered >= 4 ? 'blue' : positionsCovered >= 2 ? 'amber' : 'red',
  }
}

export interface CommandCapacity {
  name: string
  shortName: string
  icon: string
  isStaffing: true
  qualifiedCount: number
  positionsCovered: number
  totalPositionTypes: number
  hasIC: boolean
  sectionChiefCount: number
  positionCounts: Record<string, number>
  gaps: string[]
  qualifiedMembers: QualifiedMember[]
  color: TeamColor
}

export function calculateCommandCapacity(dataset: Dataset, members: readonly MemberRow[]): CommandCapacity {
  const req = ES_TEAM_REQUIREMENTS.command
  const positionCounts: Record<string, number> = {}
  for (const pos of req.positions) positionCounts[pos.code] = 0
  const qualifiedMembers: QualifiedMember[] = []
  let hasIC = false
  let sectionChiefCount = 0

  for (const m of members) {
    const positions: string[] = []
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      const posInfo = req.positions.find(p => p.achvId === q.achvId)
      if (posInfo !== undefined) {
        positionCounts[posInfo.code] = (positionCounts[posInfo.code] ?? 0) + 1
        positions.push(posInfo.code)
        if (req.icAchvIds.includes(q.achvId)) hasIC = true
        if (req.sectionChiefAchvIds.includes(q.achvId)) sectionChiefCount++
      }
    }
    if (positions.length > 0) {
      qualifiedMembers.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, positions })
    }
  }

  const qualifiedCount = qualifiedMembers.length
  const positionsCovered = Object.values(positionCounts).filter(c => c > 0).length
  const totalPositionTypes = req.positions.length

  const gaps: string[] = []
  if (!hasIC) gaps.push('Need IC')
  if (sectionChiefCount < 2) gaps.push('Limited section chiefs')

  return {
    name: req.name,
    shortName: req.shortName,
    icon: req.icon,
    isStaffing: true,
    qualifiedCount,
    positionsCovered,
    totalPositionTypes,
    hasIC,
    sectionChiefCount,
    positionCounts,
    gaps,
    qualifiedMembers,
    color:
      hasIC && sectionChiefCount >= 3
        ? 'green'
        : hasIC && sectionChiefCount >= 1
          ? 'blue'
          : hasIC || sectionChiefCount > 0
            ? 'amber'
            : 'red',
  }
}

export interface UnitTeams {
  fieldOps: FieldOpsCapacity
  aircrew: AircrewCapacity
  suas: SuasCapacity
  missionBase: MissionBaseCapacity
  command: CommandCapacity
}

/**
 * Only operational qualifications shown in the team sections are counted in
 * the summary; GES and SET are foundational/administrative and tracked
 * separately (v1 ServicesESUnitAnalysisService.html:455-481).
 */
function getDisplayedAchievementIds(): Set<number> {
  const displayed = new Set<number>()
  for (const id of Object.values(ES_TEAM_REQUIREMENTS.fieldOps.achvIds)) displayed.add(id)
  for (const id of Object.values(ES_TEAM_REQUIREMENTS.aircrew.achvIds)) displayed.add(id)
  for (const id of Object.values(ES_TEAM_REQUIREMENTS.suas.achvIds)) displayed.add(id)
  for (const pos of ES_TEAM_REQUIREMENTS.missionBase.positions) displayed.add(pos.achvId)
  for (const pos of ES_TEAM_REQUIREMENTS.command.positions) displayed.add(pos.achvId)
  return displayed
}

export interface ExpiringQual {
  capid: number
  name: string
  rank: string
  qualification: string
  achvId: number
  expiration: Date
  daysUntil: number
  urgency: 'critical' | 'warning' | 'notice'
}

export interface QualificationSummary {
  byStatus: { active: number; training: number; expired: number }
  byFunctionalArea: Record<string, { active: number; training: number; expired: number }>
  expiringWithin90Days: ExpiringQual[]
  missingGES: { capid: number; name: string; rank: string }[]
  healthRatio: number
}

export function calculateQualificationSummary(
  dataset: Dataset,
  members: readonly MemberRow[],
  asOf: Date,
): QualificationSummary {
  const in90Days = new Date(asOf)
  in90Days.setDate(in90Days.getDate() + 90)

  const displayedAchvIds = getDisplayedAchievementIds()

  let activeCount = 0
  let trainingCount = 0
  let expiredCount = 0
  const expiringWithin90Days: ExpiringQual[] = []
  const missingGES: { capid: number; name: string; rank: string }[] = []
  const byFunctionalArea: Record<string, { active: number; training: number; expired: number }> = {}

  for (const m of members) {
    const allQuals = getMemberAllQuals(dataset, m.capid)
    const hasGES = allQuals.some(
      q => q.achvId === ES_DASHBOARD_SPECIAL.GES && q.status.toUpperCase() === 'ACTIVE',
    )
    if (!hasGES) {
      missingGES.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank })
    }

    for (const q of allQuals) {
      if (!displayedAchvIds.has(q.achvId)) continue
      const status = q.status.toUpperCase()
      const achvDef = dataset.esAchievementById.get(q.achvId)
      const functionalArea = achvDef?.functionalArea ?? 'Unknown'
      const bucket = (byFunctionalArea[functionalArea] ??= { active: 0, training: 0, expired: 0 })

      if (status === 'ACTIVE') {
        activeCount++
        bucket.active++
        if (q.expiration !== null && q.expiration >= asOf && q.expiration <= in90Days) {
          const daysUntil = Math.floor((q.expiration.getTime() - asOf.getTime()) / MS_PER_DAY)
          expiringWithin90Days.push({
            capid: m.capid,
            name: `${m.nameFirst} ${m.nameLast}`,
            rank: m.rank,
            qualification: achvDef?.achv ?? String(q.achvId),
            achvId: q.achvId,
            expiration: q.expiration,
            daysUntil,
            urgency: daysUntil <= 30 ? 'critical' : daysUntil <= 60 ? 'warning' : 'notice',
          })
        }
      } else if (status === 'TRAINING') {
        trainingCount++
        bucket.training++
      } else if (status === 'EXPIRED') {
        expiredCount++
        bucket.expired++
      }
    }
  }

  expiringWithin90Days.sort((a, b) => a.daysUntil - b.daysUntil)

  return {
    byStatus: { active: activeCount, training: trainingCount, expired: expiredCount },
    byFunctionalArea,
    expiringWithin90Days,
    missingGES,
    healthRatio:
      activeCount > 0 ? Math.round((activeCount / (activeCount + expiredCount)) * 100) : 0,
  }
}

export interface UnitEvaluator {
  capid: number
  name: string
  rank: string
  canEvaluate: { achvId: number; name: string }[]
}

export interface EvaluatorAvailability {
  available: UnitEvaluator[]
  qualsCovered: number[]
  gaps: string[]
  coverage: number
  evaluatorCount: number
}

/**
 * Members with an active SET (124) can evaluate the active quals they have
 * held 1+ year in an allowed functional area; coverage compares against the
 * unit's active evaluator-eligible quals (v1 :570-646). The ICUT duty-title
 * rule is not applied here, matching v1's unit analysis.
 */
export function calculateEvaluatorAvailability(
  dataset: Dataset,
  members: readonly MemberRow[],
  asOf: Date,
): EvaluatorAvailability {
  const evaluators: UnitEvaluator[] = []
  const qualsCovered = new Set<number>()
  const oneYearAgo = new Date(asOf)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const isEvaluatorEligibleQual = (achvId: number): boolean => {
    if (ES_NO_SKILLS_EVALUATOR_IDS.has(achvId)) return false
    const functionalArea = dataset.esAchievementById.get(achvId)?.functionalArea
    return functionalArea != null && ES_SKILLS_EVALUATOR_ALLOWED_FUNCTIONAL_AREAS.has(functionalArea)
  }

  for (const m of members) {
    const quals = getMemberActiveQuals(dataset, m.capid)
    const hasSET = quals.some(q => q.achvId === ES_ACHIEVEMENT_IDS.SET_ACTUAL)
    if (!hasSET) continue

    const canEvaluate: { achvId: number; name: string }[] = []
    for (const q of quals) {
      if (q.completed === null) continue
      if (q.completed > oneYearAgo) continue
      if (!isEvaluatorEligibleQual(q.achvId)) continue
      canEvaluate.push({
        achvId: q.achvId,
        name: dataset.esAchievementById.get(q.achvId)?.achv ?? String(q.achvId),
      })
      qualsCovered.add(q.achvId)
    }
    if (canEvaluate.length > 0) {
      evaluators.push({ capid: m.capid, name: `${m.nameFirst} ${m.nameLast}`, rank: m.rank, canEvaluate })
    }
  }

  const activeQuals = new Set<number>()
  for (const m of members) {
    for (const q of getMemberActiveQuals(dataset, m.capid)) {
      if (isEvaluatorEligibleQual(q.achvId)) activeQuals.add(q.achvId)
    }
  }

  const gaps: string[] = []
  for (const achvId of activeQuals) {
    if (!qualsCovered.has(achvId)) {
      gaps.push(dataset.esAchievementById.get(achvId)?.achv ?? String(achvId))
    }
  }

  const coverage = activeQuals.size > 0 ? Math.round((qualsCovered.size / activeQuals.size) * 100) : 0

  return {
    available: evaluators,
    qualsCovered: [...qualsCovered],
    gaps,
    coverage,
    evaluatorCount: evaluators.length,
  }
}

export interface SinglePointOfFailure {
  position: string
  positionName: string
  member: string
  capid: number
  impact: string
  severity: 'high' | 'medium'
}

export function identifySinglePointsOfFailure(teams: UnitTeams): SinglePointOfFailure[] {
  const spofs: SinglePointOfFailure[] = []

  if (teams.fieldOps.positionCounts.GTL === 1) {
    const gtl = teams.fieldOps.qualifiedMembers.find(m => m.positions.includes('GTL'))
    if (gtl !== undefined) {
      spofs.push({
        position: 'GTL',
        positionName: 'Ground Team Leader',
        member: gtl.name,
        capid: gtl.capid,
        impact: 'Cannot field any ground teams without GTL',
        severity: 'high',
      })
    }
  }

  const pilotTotal = teams.aircrew.positionCounts.MP + teams.aircrew.positionCounts.TMP
  if (pilotTotal === 1) {
    const pilot = teams.aircrew.qualifiedMembers.find(
      m => m.positions.includes('MP') || m.positions.includes('TMP'),
    )
    if (pilot !== undefined) {
      spofs.push({
        position: 'Pilot',
        positionName: 'Mission Pilot',
        member: pilot.name,
        capid: pilot.capid,
        impact: 'Cannot field any aircrews without pilot',
        severity: 'high',
      })
    }
  }

  const scannerTotal = teams.aircrew.positionCounts.MS + teams.aircrew.positionCounts.MO
  if (scannerTotal === 1) {
    const scanner = teams.aircrew.qualifiedMembers.find(
      m => m.positions.includes('MS') || m.positions.includes('MO'),
    )
    if (scanner !== undefined) {
      spofs.push({
        position: 'Scanner',
        positionName: 'Mission Scanner/Observer',
        member: scanner.name,
        capid: scanner.capid,
        impact: 'Cannot field any aircrews without scanner',
        severity: 'high',
      })
    }
  }

  if (teams.command.hasIC) {
    const icCount =
      (teams.command.positionCounts['IC3'] ?? 0) +
      (teams.command.positionCounts['IC2'] ?? 0) +
      (teams.command.positionCounts['IC1'] ?? 0)
    if (icCount === 1) {
      const ic = teams.command.qualifiedMembers.find(m =>
        m.positions.some(p => p === 'IC3' || p === 'IC2' || p === 'IC1'),
      )
      if (ic !== undefined) {
        spofs.push({
          position: 'IC',
          positionName: 'Incident Commander',
          member: ic.name,
          capid: ic.capid,
          impact: 'Limited command flexibility',
          severity: 'medium',
        })
      }
    }
  }

  return spofs
}

export interface PipelineEntry {
  capid: number
  name: string
  rank: string
  qualification: string
  achvId: number
  position: string
}

export interface TrainingPipeline {
  /** v1 never populated this; kept for shape parity. */
  nearQualification: PipelineEntry[]
  activeTraining: PipelineEntry[]
}

export function calculateTrainingPipeline(dataset: Dataset, members: readonly MemberRow[]): TrainingPipeline {
  const activeTraining: PipelineEntry[] = []
  for (const m of members) {
    for (const q of getMemberAllQuals(dataset, m.capid)) {
      if (q.status.toUpperCase() !== 'TRAINING') continue
      activeTraining.push({
        capid: m.capid,
        name: `${m.nameFirst} ${m.nameLast}`,
        rank: m.rank,
        qualification: dataset.esAchievementById.get(q.achvId)?.achv ?? String(q.achvId),
        achvId: q.achvId,
        position: ES_ACHV_TO_POSITION.get(q.achvId) ?? 'Unknown',
      })
    }
  }
  return { nearQualification: [], activeTraining }
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low'
  area: string
  recommendation: string
  impact: string
}

export function generateRecommendations(
  teams: UnitTeams,
  qualifications: QualificationSummary,
  evaluators: EvaluatorAvailability,
  spofs: readonly SinglePointOfFailure[],
): Recommendation[] {
  const recommendations: Recommendation[] = []

  if (!teams.fieldOps.canField && !teams.aircrew.canField) {
    recommendations.push({
      priority: 'critical',
      area: 'Team Capability',
      recommendation: 'Unit cannot field any operational teams. Prioritize GTL and pilot training.',
      impact: 'Cannot participate in operational missions',
    })
  }

  for (const spof of spofs) {
    if (spof.severity === 'high') {
      recommendations.push({
        priority: 'high',
        area: 'Resilience',
        recommendation: `Train backup ${spof.positionName} - ${spof.member} is single point of failure`,
        impact: spof.impact,
      })
    }
  }

  const criticalExpiring = qualifications.expiringWithin90Days.filter(e => e.urgency === 'critical')
  if (criticalExpiring.length > 0) {
    recommendations.push({
      priority: 'high',
      area: 'Currency',
      recommendation: `${criticalExpiring.length} critical qualification(s) expiring within 30 days`,
      impact: 'May lose team capability if not renewed',
    })
  }

  if (qualifications.missingGES.length > 0) {
    recommendations.push({
      priority: 'medium',
      area: 'Foundation',
      recommendation: `${qualifications.missingGES.length} senior member(s) without GES - required for all ES activities`,
      impact: 'Cannot participate in ES missions',
    })
  }

  if (evaluators.gaps.length > 0) {
    recommendations.push({
      priority: 'medium',
      area: 'Evaluation',
      recommendation: `No evaluators available for ${evaluators.gaps.length} qualification(s)`,
      impact: 'May need external support for qualification sign-offs',
    })
  }

  if (!teams.suas.canField && teams.fieldOps.canField) {
    recommendations.push({
      priority: 'low',
      area: 'Capability Expansion',
      recommendation: 'Consider sUAS training to add aerial reconnaissance capability',
      impact: 'Expands mission options',
    })
  }

  return recommendations
}

export type ReadinessRating = 'excellent' | 'good' | 'fair' | 'needs-attention'

export interface ReadinessComponents {
  teamScore: number
  qualScore: number
  evaluatorScore: number
  riskScore: number
  pipelineScore: number
  teamScores: { fieldOps: number; aircrew: number; suas: number; missionBase: number; command: number }
}

/**
 * Weighted composite (0.35 team / 0.25 qual health / 0.15 evaluator /
 * 0.15 risk / 0.10 pipeline) with team sub-weights 0.30/0.30/0.10/0.15/0.15
 * and the v1 step functions; bands at 80/65/50
 * (v1 ServicesESUnitAnalysisService.html:831-893). Engineering judgment, not
 * from a CAP publication.
 */
export function calculateReadinessScore(
  teams: UnitTeams,
  qualifications: QualificationSummary,
  evaluators: EvaluatorAvailability,
  spofs: readonly SinglePointOfFailure[],
  pipeline: TrainingPipeline,
): { score: number; rating: ReadinessRating; components: ReadinessComponents } {
  const weights = ES_READINESS_WEIGHTS

  const fieldOpsTeams = teams.fieldOps.groundTeamsFieldable + teams.fieldOps.udfTeamsFieldable
  const pilotTotal = teams.aircrew.positionCounts.MP + teams.aircrew.positionCounts.TMP
  const teamScores = {
    fieldOps: teams.fieldOps.canField
      ? fieldOpsTeams >= 2
        ? 100
        : 80
      : teams.fieldOps.positionCounts.GTL > 0 || teams.fieldOps.positionCounts.UDF > 0
        ? 40
        : 0,
    aircrew: teams.aircrew.canField
      ? teams.aircrew.teamsFieldable >= 2
        ? 100
        : 80
      : pilotTotal > 0
        ? 40
        : 0,
    suas: teams.suas.canField ? 100 : 0,
    missionBase: (teams.missionBase.positionsCovered / teams.missionBase.totalPositionTypes) * 100,
    command: teams.command.hasIC ? (teams.command.sectionChiefCount >= 3 ? 100 : 70) : 30,
  }
  const teamScore =
    teamScores.fieldOps * 0.3 +
    teamScores.aircrew * 0.3 +
    teamScores.suas * 0.1 +
    teamScores.missionBase * 0.15 +
    teamScores.command * 0.15

  const qualScore = qualifications.healthRatio
  const evaluatorScore = evaluators.coverage
  const riskScore = Math.max(0, 100 - spofs.length * 25)
  const pipelineScore =
    pipeline.activeTraining.length > 0 ? Math.min(100, 50 + pipeline.activeTraining.length * 10) : 30

  const overallScore = Math.round(
    teamScore * weights.teamCapability +
      qualScore * weights.qualificationHealth +
      evaluatorScore * weights.evaluatorCoverage +
      riskScore * weights.riskMitigation +
      pipelineScore * weights.pipelineStrength,
  )

  const score = Math.max(0, Math.min(100, overallScore))
  const rating: ReadinessRating =
    score >= ES_READINESS_THRESHOLDS.excellent
      ? 'excellent'
      : score >= ES_READINESS_THRESHOLDS.good
        ? 'good'
        : score >= ES_READINESS_THRESHOLDS.fair
          ? 'fair'
          : 'needs-attention'

  return {
    score,
    rating,
    components: {
      teamScore: Math.round(teamScore),
      qualScore,
      evaluatorScore,
      riskScore,
      pipelineScore,
      teamScores,
    },
  }
}

export function generateQuickSummary(teams: UnitTeams): string {
  const summaryParts: string[] = []

  if (teams.fieldOps.canFieldGround) {
    summaryParts.push(
      `${teams.fieldOps.groundTeamsFieldable} ground team${teams.fieldOps.groundTeamsFieldable !== 1 ? 's' : ''}`,
    )
  }
  if (teams.fieldOps.canFieldUDF) {
    summaryParts.push(
      `${teams.fieldOps.udfTeamsFieldable} UDF team${teams.fieldOps.udfTeamsFieldable !== 1 ? 's' : ''}`,
    )
  }
  if (teams.aircrew.canField) {
    summaryParts.push(
      `${teams.aircrew.teamsFieldable} aircrew${teams.aircrew.teamsFieldable !== 1 ? 's' : ''}`,
    )
  }
  if (teams.suas.canField) {
    summaryParts.push('sUAS team')
  }

  if (summaryParts.length === 0) {
    const partialParts: string[] = []
    const gtmTotal =
      teams.fieldOps.positionCounts.GTM1 +
      teams.fieldOps.positionCounts.GTM2 +
      teams.fieldOps.positionCounts.GTM3
    if (teams.fieldOps.positionCounts.GTL > 0 || gtmTotal > 0) partialParts.push('ground')
    if (teams.fieldOps.positionCounts.UDF > 0) partialParts.push('UDF')
    const pilotTotal = teams.aircrew.positionCounts.MP + teams.aircrew.positionCounts.TMP
    const scannerTotal = teams.aircrew.positionCounts.MS + teams.aircrew.positionCounts.MO
    if (pilotTotal > 0 || scannerTotal > 0) partialParts.push('air')
    if (partialParts.length > 0) return `Partial ${partialParts.join('/')} capability`
    return 'No operational teams available'
  }

  return `Can field ${summaryParts.join(', ')}`
}

export interface UnitEsAnalysis {
  orgid: number
  memberCount: number
  teams: UnitTeams
  qualifications: QualificationSummary
  evaluators: EvaluatorAvailability
  pipeline: TrainingPipeline
  risks: {
    singlePointsOfFailure: SinglePointOfFailure[]
    criticalGaps: string[]
    recommendations: Recommendation[]
  }
  readinessScore: number
  readinessRating: ReadinessRating
  readinessComponents: ReadinessComponents
  quickSummary: string
}

/**
 * Main entry point. The caller supplies the member CAPID set (self vs
 * subtree); ineligible members (non-ACTIVE, Patron, Cadet Sponsor) are
 * filtered out here as well, so passing a raw roster is safe.
 */
export function analyzeUnit(
  dataset: Dataset,
  orgid: number,
  memberCapids: ReadonlySet<number>,
  asOf: Date,
): UnitEsAnalysis {
  const members: MemberRow[] = []
  for (const capid of memberCapids) {
    const m = dataset.memberByCapid.get(capid)
    if (m !== undefined && isEligibleEsMember(m)) members.push(m)
  }

  const teams: UnitTeams = {
    fieldOps: calculateFieldOpsCapacity(dataset, members),
    aircrew: calculateAircrewCapacity(dataset, members),
    suas: calculateSuasCapacity(dataset, members),
    missionBase: calculateMissionBaseCapacity(dataset, members),
    command: calculateCommandCapacity(dataset, members),
  }

  if (members.length === 0) {
    // v1 returns a zeroed skeleton for empty units (ServicesESUnitAnalysisService.html:943-966).
    return {
      orgid,
      memberCount: 0,
      teams,
      qualifications: {
        byStatus: { active: 0, training: 0, expired: 0 },
        byFunctionalArea: {},
        expiringWithin90Days: [],
        missingGES: [],
        healthRatio: 0,
      },
      evaluators: { available: [], qualsCovered: [], gaps: [], coverage: 0, evaluatorCount: 0 },
      pipeline: { nearQualification: [], activeTraining: [] },
      risks: { singlePointsOfFailure: [], criticalGaps: [], recommendations: [] },
      readinessScore: 0,
      readinessRating: 'needs-attention',
      readinessComponents: {
        teamScore: 0,
        qualScore: 0,
        evaluatorScore: 0,
        riskScore: 0,
        pipelineScore: 0,
        teamScores: { fieldOps: 0, aircrew: 0, suas: 0, missionBase: 0, command: 0 },
      },
      quickSummary: 'No active members',
    }
  }

  const qualifications = calculateQualificationSummary(dataset, members, asOf)
  const evaluators = calculateEvaluatorAvailability(dataset, members, asOf)
  const pipeline = calculateTrainingPipeline(dataset, members)
  const singlePointsOfFailure = identifySinglePointsOfFailure(teams)

  const criticalGaps: string[] = []
  if (!teams.fieldOps.canField) criticalGaps.push('Cannot field ground/UDF team')
  if (!teams.aircrew.canField) criticalGaps.push('Cannot field aircrew')

  const readiness = calculateReadinessScore(teams, qualifications, evaluators, singlePointsOfFailure, pipeline)
  const recommendations = generateRecommendations(teams, qualifications, evaluators, singlePointsOfFailure)

  return {
    orgid,
    memberCount: members.length,
    teams,
    qualifications,
    evaluators,
    pipeline,
    risks: { singlePointsOfFailure, criticalGaps, recommendations },
    readinessScore: readiness.score,
    readinessRating: readiness.rating,
    readinessComponents: readiness.components,
    quickSummary: generateQuickSummary(teams),
  }
}
