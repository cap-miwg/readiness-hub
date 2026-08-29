/**
 * Pure helpers shared by the report generators: date shaping, unit naming,
 * the v1 training index (Cadet Protection / TLC status from Training.txt),
 * and request-time senior promotion recomputation through the domain layer.
 */

import { getPromotionDetails, type LevelProgress, type LevelsProgress, type PromotionDetails, type SeniorDutyBase } from '../domain/senior.js'
import type { MemberRow } from '../domain/dataset.js'
import { LEVELS, MODERATED_LOOKUP, normalizeTaskName, type LevelId } from '../domain/constants/index.js'
import type {
  JsonLevelsProgress,
  OrgInfo,
  ReportMember,
  TrainingSlice,
} from './types.js'

export const DAY_MS = 24 * 60 * 60 * 1000

export function reviveDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Local-date ISO string; pg date columns come back as local-midnight Dates. */
export function isoDate(d: Date | null | undefined): string | null {
  if (d === null || d === undefined) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysSince(date: Date | null, asOf: Date): number | null {
  if (date === null) return null
  return Math.floor((asOf.getTime() - date.getTime()) / DAY_MS)
}

export function daysUntilCeil(date: Date | null, asOf: Date): number | null {
  if (date === null) return null
  return Math.ceil((date.getTime() - asOf.getTime()) / DAY_MS)
}

export function memberName(m: ReportMember): string {
  return `${m.nameLast}, ${m.nameFirst}`
}

const padUnit = (val: string): string => {
  const stripped = val.replace(/^0+/, '')
  return (stripped !== '' ? stripped : '0').padStart(3, '0')
}

/** GLR-MI-205 display form (v1 ServicesDataService.html buildUnitName). */
export function unitDisplayName(orgs: ReadonlyMap<number, OrgInfo>, orgid: number): string {
  if (orgid === -1) return 'Unassigned'
  const org = orgs.get(orgid)
  if (org === undefined) return 'Unknown'
  return `${org.region}-${org.wing}-${padUnit(org.unit !== '' ? org.unit : '000')}`
}

export interface UnitInfo {
  unitNum: string
  unitType: string
}

export function unitInfoOf(orgs: ReadonlyMap<number, OrgInfo>, orgid: number): UnitInfo {
  const org = orgs.get(orgid)
  return {
    unitNum: org !== undefined && org.unit !== '' ? padUnit(org.unit) : '',
    unitType: (org?.type ?? '').toUpperCase(),
  }
}

// --- Training.txt index: Cadet Protection and TLC (v1 Index.html:832-882) ---

export interface TlcRecord {
  date: Date
  label: string
}

export interface TrainingEntry {
  basic: Date | null
  advanced: Date | null
  tlc: TlcRecord | null
}

/**
 * Course-name classification verbatim from v1 Index.html:840-856. The mirror
 * stores Completed only (no DateMod fallback; Training.txt DateMod is not an
 * allowlisted column in ingest/tables.ts), so undated rows do not count.
 */
export function buildTrainingIndex(rows: readonly TrainingSlice[]): Map<number, TrainingEntry> {
  const raw = new Map<number, { basic: Date[]; advanced: Date[]; tlc: TlcRecord[] }>()
  for (const record of rows) {
    const courseKey = record.typeCrs.replace(/\s+/g, ' ').trim().toLowerCase()
    let courseType: 'basic' | 'advanced' | null = null
    if (courseKey === 'cadet protection - basic course') courseType = 'basic'
    if (courseKey === 'cadet protection - cadet course') courseType = 'basic'
    if (courseKey === 'cadet protection - advanced course') courseType = 'advanced'
    if (courseKey === 'cppt') courseType = 'basic'
    const isTlc = /\btlc\b/.test(courseKey) || courseKey.includes('training leaders of cadets')
    let tlcLabel: string | null = null
    if (isTlc) {
      if (courseKey.includes('on-demand') || courseKey.includes('on demand')) tlcLabel = 'TLC On-Demand'
      else if (courseKey.includes('basic')) tlcLabel = 'TLC Basic'
      else if (courseKey.includes('intermediate')) tlcLabel = 'TLC Intermediate'
      else if (courseKey.includes('advanced')) tlcLabel = 'TLC Advanced'
      else tlcLabel = 'TLC'
    }
    if (courseType === null && tlcLabel === null) continue
    if (record.completed === null) continue
    let entry = raw.get(record.capid)
    if (entry === undefined) {
      entry = { basic: [], advanced: [], tlc: [] }
      raw.set(record.capid, entry)
    }
    if (courseType !== null) entry[courseType].push(record.completed)
    if (tlcLabel !== null) entry.tlc.push({ date: record.completed, label: tlcLabel })
  }

  const out = new Map<number, TrainingEntry>()
  for (const [capid, entry] of raw) {
    const latest = (dates: Date[]): Date | null =>
      dates.length === 0 ? null : dates.reduce((a, b) => (b > a ? b : a))
    const latestTlc =
      entry.tlc.length === 0 ? null : entry.tlc.reduce((a, b) => (b.date > a.date ? b : a))
    out.set(capid, { basic: latest(entry.basic), advanced: latest(entry.advanced), tlc: latestTlc })
  }
  return out
}

/** CP renewal 365 days, due-soon 60 days (v1 Index.html:759-762 CADET_PROTECTION_CONFIG). */
export const CADET_PROTECTION_CONFIG = { renewalDays: 365, dueSoonDays: 60 } as const

/** TLC renewal 36 months, warning and grace 365 days (v1 Index.html:764-768 TLC_CONFIG). */
export const TLC_CONFIG = { renewalMonths: 36, warningDays: 365, graceDays: 365 } as const

export type CpCourseStatus = 'current' | 'due-soon' | 'overdue' | 'missing' | 'eligible' | 'not-required'

export interface CpCourse {
  id: 'basic' | 'advanced'
  label: string
  required: boolean
  eligible: boolean
  lastCompleted: Date | null
  expirationDate: Date | null
  daysRemaining: number | null
  daysText: string
  status: CpCourseStatus
  statusLabel: string
}

export interface CpStatus {
  age: number | null
  basic: CpCourse
  advanced: CpCourse
  requiredCourses: CpCourse[]
  isCompliant: boolean
  basicEligibleUnstarted: boolean
}

const CP_STATUS_LABELS: Record<CpCourseStatus, string> = {
  current: 'Current',
  'due-soon': 'Due soon',
  overdue: 'Overdue',
  missing: 'Missing',
  eligible: 'Eligible',
  'not-required': 'Not required',
}

function buildCpCourse(
  id: 'basic' | 'advanced',
  label: string,
  lastCompleted: Date | null,
  required: boolean,
  eligible: boolean,
  asOf: Date,
): CpCourse {
  let status: CpCourseStatus = 'not-required'
  let expirationDate: Date | null = null
  let daysRemaining: number | null = null
  if (lastCompleted !== null) {
    expirationDate = new Date(lastCompleted)
    expirationDate.setDate(expirationDate.getDate() + CADET_PROTECTION_CONFIG.renewalDays)
    daysRemaining = daysUntilCeil(expirationDate, asOf)
  }
  if (required) {
    if (lastCompleted === null) status = 'missing'
    else if (daysRemaining !== null && daysRemaining < 0) status = 'overdue'
    else if (daysRemaining !== null && daysRemaining <= CADET_PROTECTION_CONFIG.dueSoonDays)
      status = 'due-soon'
    else status = 'current'
  } else if (eligible) {
    status = 'eligible'
  }
  const daysText =
    daysRemaining === null
      ? 'N/A'
      : daysRemaining >= 0
        ? `${daysRemaining} days remaining`
        : `${Math.abs(daysRemaining)} days overdue`
  return {
    id,
    label,
    required,
    eligible,
    lastCompleted,
    expirationDate,
    daysRemaining,
    daysText,
    status,
    statusLabel: CP_STATUS_LABELS[status],
  }
}

/** Commander-tier duties that shift the CP requirement to the Advanced course (v1 Index.html:899-927). */
export function isAdvancedCpDuty(
  dutyName: string,
  heldAtOrgid: number,
  orgs: ReadonlyMap<number, OrgInfo>,
): boolean {
  const name = dutyName.toUpperCase().replace(/\s+/g, ' ').trim()
  if (name === '') return false
  const commanderTitles = new Set([
    'COMMANDER',
    'SQUADRON COMMANDER',
    'GROUP COMMANDER',
    'WING COMMANDER',
    'REGION COMMANDER',
    'UNIT COMMANDER',
  ])
  const heldType = unitInfoOf(orgs, heldAtOrgid).unitType
  const isGroupOrHigher =
    heldType.includes('GROUP') ||
    heldType.includes('WING') ||
    heldType.includes('REGION') ||
    heldType.includes('NATIONAL')
  return (
    commanderTitles.has(name) ||
    (name.includes('DEPUTY COMMANDER') && isGroupOrHigher) ||
    (name.includes('DEPUTY COMMANDER') && name.includes('CADET')) ||
    (name.includes('DIRECTOR') && name.includes('CADET PROGRAM')) ||
    name.includes('CHIEF OF STAFF') ||
    name.includes('LEGAL OFFICER') ||
    name.includes('INSPECTOR GENERAL')
  )
}

/**
 * Cadet Protection compliance, port of v1 Index.html:884-1082. Age is the
 * compute-time 365.25-day age (age gates need only age; exact DOB stays
 * admin-gated per docs/ARCHITECTURE.md, PII posture).
 */
export function getCadetProtectionStatus(
  member: ReportMember,
  training: ReadonlyMap<number, TrainingEntry>,
  advancedRequired: boolean,
  asOf: Date,
): CpStatus {
  const age = member.ageAsofCompute
  const isCadet = member.isCadetScope
  const isSenior = member.isSeniorScope
  const basicRequired = isSenior || (isCadet && age !== null && age >= 18)
  const basicEligible = isCadet && age !== null && age >= 17
  const completion = training.get(member.capid)
  const effectiveBasicRequired = basicRequired && !advancedRequired
  const effectiveBasicEligible = basicEligible && !advancedRequired

  const basicLabel = isCadet ? 'Cadet Protection - Cadet Course' : 'Cadet Protection - Basic Course'
  const basic = buildCpCourse(
    'basic',
    basicLabel,
    completion?.basic ?? null,
    effectiveBasicRequired,
    effectiveBasicEligible,
    asOf,
  )
  const advanced = buildCpCourse(
    'advanced',
    'Cadet Protection - Advanced Course',
    completion?.advanced ?? null,
    advancedRequired,
    advancedRequired,
    asOf,
  )
  const requiredCourses = [basic, advanced].filter(c => c.required)
  const isCompliant =
    requiredCourses.length === 0
      ? true
      : requiredCourses.every(c => c.status === 'current' || c.status === 'due-soon')
  return {
    age,
    basic,
    advanced,
    requiredCourses,
    isCompliant,
    basicEligibleUnstarted:
      requiredCourses.length === 0 && effectiveBasicEligible && basic.lastCompleted === null,
  }
}

export type TlcStatusKey = 'current' | 'due-soon' | 'expired'

export interface TlcStatus {
  course: string
  completed: Date
  expirationDate: Date
  daysRemaining: number
  daysText: string
  status: TlcStatusKey
  statusLabel: string
}

/** TLC currency, port of v1 Index.html:1084-1124; null past the 1-year grace. */
export function getTlcStatus(
  capid: number,
  training: ReadonlyMap<number, TrainingEntry>,
  asOf: Date,
): TlcStatus | null {
  const tlcRecord = training.get(capid)?.tlc ?? null
  if (tlcRecord === null) return null
  const expirationDate = new Date(tlcRecord.date)
  expirationDate.setMonth(expirationDate.getMonth() + TLC_CONFIG.renewalMonths)
  const daysRemaining = daysUntilCeil(expirationDate, asOf)
  if (daysRemaining === null || daysRemaining < -TLC_CONFIG.graceDays) return null
  let status: TlcStatusKey = 'current'
  if (daysRemaining < 0) status = 'expired'
  else if (daysRemaining <= TLC_CONFIG.warningDays) status = 'due-soon'
  const labels: Record<TlcStatusKey, string> = {
    current: 'Current',
    'due-soon': 'Due soon',
    expired: 'Expired',
  }
  return {
    course: tlcRecord.label,
    completed: tlcRecord.date,
    expirationDate,
    daysRemaining,
    daysText:
      daysRemaining >= 0
        ? `${daysRemaining} days remaining`
        : `${Math.abs(daysRemaining)} days overdue`,
    status,
    statusLabel: labels[status],
  }
}

/**
 * Whether a PL task is one of the level's moderated (instructor-led) modules,
 * with the loose name matching v1 used when catalog and PDF names vary
 * (v1 Index.html:1497-1504).
 */
export function isModeratedTaskForLevel(levelId: LevelId, taskName: string): boolean {
  const normalized = normalizeTaskName(taskName)
  const allowed = MODERATED_LOOKUP.get(levelId)
  if (allowed === undefined || allowed.size === 0) return false
  if (allowed.has(normalized)) return true
  return [...allowed].some(entry => normalized.includes(entry) || entry.includes(normalized))
}

// --- Request-time senior promotion recomputation ---

export function reviveLevelsProgress(lp: JsonLevelsProgress | null | undefined): LevelsProgress {
  const out = {} as LevelsProgress
  for (const def of LEVELS) {
    const p = lp?.[def.id]
    const fallback: LevelProgress = {
      percent: 0,
      status: 'not-started',
      approvalStatus: null,
      date: null,
      pathId: null,
      totalReq: 0,
      totalComp: 0,
      legacy: false,
    }
    out[def.id] = p !== undefined ? { ...p, date: reviveDate(p.date) } : fallback
  }
  return out
}

/**
 * Re-run getPromotionDetails against the corrected PROMOTION_RULES with
 * request-time now, from the stored detail->senior payload. Time gates (TIG,
 * duty months, membership months) move with asOf; level status only changes
 * at ingest.
 */
export function promotionDetailsNow(m: ReportMember, asOf: Date): PromotionDetails | null {
  if (!m.isSeniorScope) return null
  const memberRow: MemberRow = {
    capid: m.capid,
    nameLast: m.nameLast,
    nameFirst: m.nameFirst,
    nameMiddle: null,
    nameSuffix: null,
    dob: null,
    orgid: m.orgid,
    wing: '',
    unit: '',
    rank: m.rank,
    joined: m.joined,
    expiration: m.expiration,
    orgJoined: null,
    dateMod: null,
    type: m.memberType,
    rankDate: m.rankDate,
    region: '',
    mbrStatus: 'ACTIVE',
  }
  const duties: SeniorDutyBase[] = (m.seniorDuties ?? []).map(d => ({
    name: d.name,
    isAsst: d.isAsst,
    date: reviveDate(d.date),
    orgString: d.orgString,
    displayName: d.displayName,
  }))
  const progress = reviveLevelsProgress(m.levelProgress)
  const currentLevel =
    m.seniorCurrentLevelNum ??
    (m.currentLevel !== null ? Number.parseInt(m.currentLevel.replace('Level ', ''), 10) || 0 : 0)
  return getPromotionDetails(memberRow, duties, progress, currentLevel, asOf)
}
