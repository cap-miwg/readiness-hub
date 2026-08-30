/**
 * Compute step, called by the ingest run with the staging suffix so computed
 * tables participate in the same atomic swap as the mirrors (ingest/run.ts
 * calls runCompute(client, INCOMING_SUFFIX, log) after the mirrors are staged
 * and before the swap transaction; anything named <table><suffix> rides the
 * swap).
 *
 * org_closure is rebuilt AFTER compute inside the swap transaction
 * (ingest/load.ts rebuildOrgClosure), so the subtree is derived here from the
 * staged organizations/members rows with the same buildOrgClosure helper the
 * ingest uses; both produce identical trees from identical inputs.
 *
 * asOf = new Date() is allowed here: compute time is a fact recorded in the
 * output. Read-time flags re-derive from the stored dates via timeSensitive.ts
 * (docs/ARCHITECTURE.md, Compute).
 *
 * Row assembly is factored into pure functions (assembleMemberRow,
 * assembleOrgRows) so the readiness output is testable without a database.
 */

import type pg from 'pg'
import { config } from '../config.js'
import { buildOrgClosure, UNASSIGNED_ORGID } from '../ingest/orgTree.js'
import { buildInsertStatements } from '../ingest/load.js'
import type { CellValue } from '../ingest/parse.js'
import {
  buildDataset,
  type Dataset,
  type DutyPositionRow,
  type MemberRow,
  type OrganizationRow,
} from './dataset.js'
import { loadDatasetInput } from './loadDataset.js'
import { deriveLevelPathMap, processSenior, type PromotionDetails } from './senior.js'
import { processCadet, publicAchievementNumber, type ProcessedCadet } from './cadet.js'
import { buildEsQualifications, type EsQualification } from './es.js'
import { analyzeUnit } from './esUnit.js'
import { classifyMemberType, getMetricsForUnit } from './orgStats.js'
import { DUTY_TO_TRACK_MAP, PROMOTION_RULES, normalizeRank, type LevelId } from './constants/index.js'
import type { RequirementKey } from './constants/cadetConstants.js'
import {
  COMPUTED_MEMBER_COLUMNS,
  COMPUTED_MEMBER_DUTY_COLUMNS,
  COMPUTED_MEMBER_DUTY_TABLE,
  COMPUTED_MEMBER_TABLE,
  COMPUTED_MEMBER_TRACK_COLUMNS,
  COMPUTED_MEMBER_TRACK_TABLE,
  COMPUTED_ORG_COLUMNS,
  COMPUTED_ORG_TABLE,
  type CadetStateFacts,
  type ComputedEsSummary,
  type ComputedMemberDutyRow,
  type ComputedMemberRow,
  type ComputedMemberTrackRow,
  type ComputedOrgRow,
  type ComputedOrgScope,
  type ComputedPromotion,
  type Jsonified,
  type OrgChartMember,
  type OrgChartNode,
} from './computedTypes.js'

export interface ComputeLog {
  info: (msg: string) => void
}

// v1 Index.html:672 approximates a month as 30.44 days for duty-duration
// arithmetic; the promotable_on duty-gap estimate keeps that parity.
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

/** JSONB payloads store Dates as ISO strings; round-trip once at assembly. */
function jsonify<T>(value: T): Jsonified<T> {
  return JSON.parse(JSON.stringify(value)) as Jsonified<T>
}

/**
 * Calendar-date string for a Date that is either UTC midnight (the parse
 * layer's convention) or local midnight (what pg returns for date columns);
 * either way the intended calendar date is preserved.
 */
function isoDate(d: Date): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// --- Org compute context (anchor subtree without org_closure) ---

export interface OrgComputeContext {
  anchorOrgid: number
  /** Real orgids in the anchor subtree (excludes UNASSIGNED_ORGID). */
  subtreeOrgids: ReadonlySet<number>
  /** Ancestor -> descendants including self; the anchor's set includes UNASSIGNED_ORGID. */
  descendants: ReadonlyMap<number, ReadonlySet<number>>
}

/**
 * memberHomeOrgids: the UNFILTERED member home orgids
 * (loadDatasetInput allMemberHomeOrgids), so anchor derivation matches
 * ingest/run.ts deriveOrgTree exactly. dataset.members is already narrowed by
 * the org.member_types include list; deriving the LCA from it would move the
 * anchor when the list is narrowed and drop computed_org rows for orgs the
 * staged org_closure still serves. The dataset.members fallback exists for
 * fixtures that carry no separate raw member set.
 */
export function buildOrgComputeContext(
  dataset: Dataset,
  anchorOverride?: number,
  memberHomeOrgids?: Iterable<number>,
): OrgComputeContext {
  const tree = buildOrgClosure(
    dataset.organizations.map(o => ({ orgid: o.orgid, nextLevel: o.nextLevel })),
    memberHomeOrgids ?? dataset.members.map(m => m.orgid),
    anchorOverride,
  )
  const descendants = new Map<number, Set<number>>()
  for (const row of tree.closureRows) {
    let set = descendants.get(row.ancestorOrgid)
    if (!set) {
      set = new Set()
      descendants.set(row.ancestorOrgid, set)
    }
    set.add(row.descendantOrgid)
  }
  return { anchorOrgid: tree.anchorOrgid, subtreeOrgids: tree.subtreeOrgids, descendants }
}

// --- Cadet state facts ---

// Mirrors NON_CONTROLLABLE_KEYS in cadet.ts (module-private): staff checkboxes
// and TIG are excluded from the readiness gate
// (v1 ServicesCadetDataService.html:777-783).
const NON_CONTROLLABLE_KEYS: ReadonlySet<RequirementKey> = new Set([
  'activeParticipation',
  'cadetOath',
  'timeInGrade',
])

export function buildCadetStateFacts(processed: ProcessedCadet): CadetStateFacts {
  const tigEligibleOn = processed.tigCompleteOn !== null ? isoDate(processed.tigCompleteOn) : null
  const reqs = processed.nextRequirements
  if (processed.nextAchievement === null || reqs === null) {
    return {
      spaatzComplete: true,
      reqsReady: false,
      hfzCounted: false,
      hfzValidUntil: null,
      tigEligibleOn,
      hardDone: 0,
      controllableDone: 0,
      controllableTotal: 0,
      stateAtCompute: processed.promotion.state,
    }
  }

  const byKey = new Map(reqs.requirements.map(r => [r.key, r] as const))
  const done = (key: RequirementKey): boolean => byKey.get(key)?.completed === true
  const controllable = reqs.requirements.filter(r => !NON_CONTROLLABLE_KEYS.has(r.key))
  const controllableDone = controllable.filter(r => r.completed).length
  // Mirrors the 3 hard requirement groups in cadet.ts
  // calculatePromotionReadiness (v1 ServicesCadetDataService.html:791-805).
  const hardDone = [
    done('leadershipTest') ||
      done('wrightBrothersLeadershipExam') ||
      done('mitchellLeadershipExam') ||
      done('earhartLeadershipExam') ||
      done('spaatzLeadershipExam'),
    done('physicalFitness') || done('spaatzCFA'),
    done('aerospaceTest') || done('mitchellAerospaceExam') || done('spaatzJOFExam'),
  ].filter(Boolean).length

  return {
    spaatzComplete: false,
    reqsReady: controllableDone === controllable.length,
    hfzCounted: done('physicalFitness') && processed.hfz?.validUntil != null,
    hfzValidUntil: processed.hfzValidUntil !== null ? isoDate(processed.hfzValidUntil) : null,
    tigEligibleOn,
    hardDone,
    controllableDone,
    controllableTotal: controllable.length,
    stateAtCompute: processed.promotion.state,
  }
}

// --- Senior promotable_on ---

/**
 * The date a senior becomes fully promotion-eligible assuming only time
 * remains: the latest of the TIG date, the membership-minimum date, and an
 * estimated duty-months completion date. Null while a non-time requirement
 * (level, missing duty assignment) is outstanding or a required date is
 * unknowable (no RankDate / no Joined).
 */
export function seniorPromotableOn(
  member: MemberRow,
  details: PromotionDetails | null,
  asOf: Date,
): Date | null {
  if (details === null) return null
  const rules = PROMOTION_RULES[normalizeRank(member.rank)]
  if (rules === undefined) return null
  if (!details.isLevelMet) return null
  if (details.eligibleDate === null) return null

  const candidates: number[] = [details.eligibleDate.getTime()]

  if (details.membershipMonthsRequired !== null && !details.isMembershipMet) {
    if (member.joined === null) return null
    const membershipDate = new Date(member.joined)
    membershipDate.setMonth(membershipDate.getMonth() + details.membershipMonthsRequired)
    candidates.push(membershipDate.getTime())
  }

  if (details.dutyReq !== null) {
    if (details.dutyStatusString.startsWith('Missing Assignment')) return null
    if (!details.isDutyMet) {
      const requiredMonths = rules.dutyMonths ?? 0
      const gapMonths = Math.max(0, requiredMonths - details.currentDutyMonths)
      candidates.push(asOf.getTime() + gapMonths * MS_PER_MONTH)
    }
  }

  return new Date(Math.max(...candidates))
}

// --- Per-member assembly ---

export interface AssembledMember {
  member: ComputedMemberRow
  duties: ComputedMemberDutyRow[]
  tracks: ComputedMemberTrackRow[]
}

function esCounts(quals: readonly EsQualification[]): ComputedEsSummary['counts'] {
  const counts = { active: 0, training: 0, expired: 0, missing: 0, notApproved: 0 }
  for (const q of quals) {
    if (q.status === 'Active') counts.active++
    else if (q.status === 'Training') counts.training++
    else if (q.status === 'Expired') counts.expired++
    else if (q.status === 'Missing') counts.missing++
    else counts.notApproved++
  }
  return counts
}

function dutyJunctionRows(dataset: Dataset, capid: number): ComputedMemberDutyRow[] {
  const rows: ComputedMemberDutyRow[] = []
  const push = (d: DutyPositionRow, source: 'senior' | 'cadet'): void => {
    rows.push({
      capid,
      duty: d.duty,
      asst: d.asst,
      heldAtOrgid: d.orgid,
      functArea: d.functArea ?? DUTY_TO_TRACK_MAP[d.duty.toUpperCase().trim()] ?? null,
      lvl: d.lvl,
      source,
    })
  }
  for (const d of dataset.dutiesByCapid.get(capid) ?? []) push(d, 'senior')
  for (const d of dataset.cadetDutiesByCapid.get(capid) ?? []) {
    // v1 drops empty and spreadsheet-artifact cadet duties (ServicesCadetDataService.html:912 parity in cadet.ts).
    if (d.duty === '' || d.duty.toUpperCase().includes('#REF')) continue
    push(d, 'cadet')
  }
  return rows
}

export function assembleMemberRow(
  dataset: Dataset,
  member: MemberRow,
  asOf: Date,
  ctx: OrgComputeContext,
  levelPathMap?: ReadonlyMap<LevelId, number>,
): AssembledMember {
  const type = member.type.toUpperCase()
  const isCadetScope = type === 'CADET'
  // Senior surfaces show SENIOR and LIFE types (v1 ServicesDataService.html:314-321).
  const isSeniorScope = type === 'SENIOR' || type === 'LIFE'

  const processedSenior = isSeniorScope ? processSenior(dataset, member, asOf, levelPathMap) : null
  const processedCadet = isCadetScope ? processCadet(dataset, member, asOf) : null

  const esDashboard = buildEsQualifications(
    dataset,
    member,
    { forDashboard: true, forCadet: isCadetScope },
    asOf,
  )
  const esAll = buildEsQualifications(
    dataset,
    member,
    { forDashboard: false, forCadet: isCadetScope },
    asOf,
  )

  const facts = processedCadet !== null ? buildCadetStateFacts(processedCadet) : null

  let promotion: ComputedPromotion | null = null
  if (processedCadet !== null) {
    promotion = { kind: 'cadet', readiness: processedCadet.promotion }
  } else if (processedSenior !== null && processedSenior.promotion !== null) {
    promotion = { kind: 'senior', details: jsonify(processedSenior.promotion) }
  }

  let promotableOn: Date | null = null
  if (processedSenior !== null) {
    promotableOn = seniorPromotableOn(member, processedSenior.promotion, asOf)
  } else if (facts !== null && facts.reqsReady && !facts.spaatzComplete) {
    promotableOn = processedCadet?.tigCompleteOn ?? null
  }

  const rank =
    processedCadet !== null && processedCadet.rank !== null ? processedCadet.rank : member.rank
  const rankDate =
    processedCadet !== null && processedCadet.rankDate !== null
      ? processedCadet.rankDate
      : member.rankDate
  const fullName = `${rank} ${member.nameLast}, ${member.nameFirst}`.trim()

  // Age at compute with 365.25-day years, v1 parity (es.ts checkSpecialPrerequisites).
  const ageAsofCompute =
    member.dob !== null
      ? Math.floor((asOf.getTime() - member.dob.getTime()) / (86_400_000 * 365.25))
      : null
  const dobYear = member.dob !== null ? Number(isoDate(member.dob).slice(0, 4)) : null

  const row: ComputedMemberRow = {
    capid: member.capid,
    orgid: ctx.subtreeOrgids.has(member.orgid) ? member.orgid : UNASSIGNED_ORGID,
    nameLast: member.nameLast,
    nameFirst: member.nameFirst,
    fullName,
    rank,
    memberType: member.type,
    joined: member.joined,
    expiration: member.expiration,
    rankDate,
    dobYear,
    ageAsofCompute,
    isSeniorScope,
    isCadetScope,
    currentLevel:
      processedSenior !== null && processedSenior.currentLevel > 0
        ? `Level ${processedSenior.currentLevel}`
        : null,
    levelProgress: processedSenior !== null ? jsonify(processedSenior.levelsProgress) : null,
    promotion,
    promotableOn,
    tigEligibleOn: processedSenior?.promotion?.eligibleDate ?? null,
    nextAchvId: processedCadet?.nextAchievement ?? null,
    nextAchvPublicNumber:
      processedCadet !== null && processedCadet.nextAchievement !== null
        ? publicAchievementNumber(processedCadet.nextAchievement)
        : null,
    cadetStateFacts: facts,
    tigCompleteOn: processedCadet?.tigCompleteOn ?? null,
    hfzValidUntil: processedCadet?.hfzValidUntil ?? null,
    lastPromotionOn:
      processedCadet !== null ? processedCadet.lastPromotionDate : member.rankDate,
    phase:
      processedCadet !== null && processedCadet.phase > 0 ? String(processedCadet.phase) : null,
    honorCredit: processedCadet !== null ? processedCadet.honorCreditAchievements.length > 0 : null,
    esSummary: { counts: esCounts(esDashboard), qualifications: jsonify(esDashboard) },
    esExpiringCount: esDashboard.filter(q => q.isExpiringSoon).length,
    detail: {
      senior: processedSenior !== null ? jsonify(processedSenior) : null,
      cadet: processedCadet !== null ? jsonify(processedCadet) : null,
      esDashboard: jsonify(esDashboard),
      esAll: jsonify(esAll),
    },
  }

  return {
    member: row,
    duties: dutyJunctionRows(dataset, member.capid),
    tracks: (dataset.specTracksByCapid.get(member.capid) ?? []).map(t => ({
      capid: member.capid,
      track: t.track,
      trackLevel: t.trackLevel,
    })),
  }
}

// --- Org chart (port of v1 Index.html org chart construction) ---
//
// Ported: commander/deputy chain and cadet fixed hierarchy with the vacancy
// display rules by unit type (Index.html:5037-5138, :5122-5213), flight
// officer/enlisted structure (:4914-5034), the additional-members node
// (:5075-5096), and the traditional senior staff structure (:4849-4905).
// The wing-only Chief of Staff layout (:4750-4788) is simplified to the
// traditional structure; duty-holders whose titles match no rendered node
// (Chief of Staff, Historian, Testing Officer, ...) attach under an
// Other Staff node instead of vanishing. Flagged in docs/MIGRATION-V1.md.

const COMMANDER_EXCLUDE = ['DEPUTY', 'CADET', 'VICE', 'ADVISOR'] as const

// Officer ranks: C/2d Lt through C/Col (v1 Index.html:4940).
const CADET_OFFICER_RANKS: ReadonlySet<string> = new Set([
  'C/2DLT',
  'C/1STLT',
  'C/CAPT',
  'C/MAJ',
  'C/LTCOL',
  'C/COL',
])

interface FindOptions {
  exclude?: readonly string[]
  cadet?: boolean
}

function chartDisplay(member: MemberRow, asst: boolean): string {
  return `${member.rank} ${member.nameLast}, ${member.nameFirst}${asst ? ' (A)' : ''}`.trim()
}

function memberOnlyEntry(member: MemberRow): OrgChartMember {
  return { capid: member.capid, display: chartDisplay(member, false), asst: false }
}

function sortMembers(members: OrgChartMember[]): OrgChartMember[] {
  return members.sort((a, b) => a.display.localeCompare(b.display))
}

function node(
  id: string,
  title: string,
  type: 'senior' | 'cadet',
  members: OrgChartMember[],
  children: OrgChartNode[] = [],
): OrgChartNode {
  return { id, title, type, members, vacant: false, children }
}

function finalizeVacancy(n: OrgChartNode): boolean {
  let hasMembers = n.members.length > 0
  for (const child of n.children) {
    if (finalizeVacancy(child)) hasMembers = true
  }
  n.vacant = !hasMembers
  return hasMembers
}

export function buildOrgChart(
  dataset: Dataset,
  org: OrganizationRow,
  dutyOrgids: ReadonlySet<number>,
  scopeMembers: readonly MemberRow[],
): OrgChartNode {
  const duties: DutyPositionRow[] = []
  for (const list of dataset.dutiesByCapid.values()) {
    for (const d of list) if (dutyOrgids.has(d.orgid)) duties.push(d)
  }
  const cadetDuties: DutyPositionRow[] = []
  for (const list of dataset.cadetDutiesByCapid.values()) {
    for (const d of list) {
      if (!dutyOrgids.has(d.orgid)) continue
      if (d.duty === '' || d.duty.toUpperCase().includes('#REF')) continue
      cadetDuties.push(d)
    }
  }

  const findByTitles = (titles: readonly string[], options: FindOptions = {}): OrgChartMember[] => {
    const source = options.cadet === true ? cadetDuties : duties
    const upperTitles = titles.map(t => t.toUpperCase())
    const upperExclude = (options.exclude ?? []).map(e => e.toUpperCase())
    const out: OrgChartMember[] = []
    for (const d of source) {
      const dutyUpper = d.duty.toUpperCase()
      if (!upperTitles.some(t => dutyUpper.includes(t))) continue
      if (upperExclude.some(w => dutyUpper.includes(w))) continue
      const member = dataset.memberByCapid.get(d.capid)
      if (member === undefined) continue
      out.push({ capid: member.capid, display: chartDisplay(member, d.asst), asst: d.asst })
    }
    return sortMembers(out)
  }

  const typeUpper = org.type.toUpperCase()
  const isWing = typeUpper.includes('WING')
  const isGroup = typeUpper.includes('GROUP')
  const isComposite = typeUpper.includes('COMPOSITE')
  const isCadetUnit = typeUpper.includes('CADET')
  const isSeniorUnit =
    typeUpper.includes('SENIOR') || (!isComposite && !isCadetUnit && !isGroup && !isWing)
  // Vacancy display rules by unit type (v1 Index.html:5127-5138): composite
  // squadrons and groups never show a vacant Deputy Commander; cadet units,
  // senior units, and groups never show vacant DC for Seniors/Cadets; groups
  // never show a vacant cadet chain.
  const restrictDeputyVacant = isComposite || isGroup
  const restrictDeputySpecialVacant = isCadetUnit || isSeniorUnit || isGroup
  const allowVacantCadetChain = !isGroup

  // Commander scoped strictly to the home unit (v1 Index.html:4686-4701).
  const commanderMembers = sortMembers(
    duties
      .filter(d => d.orgid === org.orgid)
      .filter(d => {
        const dutyUpper = d.duty.toUpperCase()
        if (!dutyUpper.includes('COMMANDER')) return false
        return !COMMANDER_EXCLUDE.some(w => dutyUpper.includes(w))
      })
      .flatMap(d => {
        const member = dataset.memberByCapid.get(d.capid)
        if (member === undefined) return []
        return [{ capid: member.capid, display: chartDisplay(member, d.asst), asst: d.asst }]
      }),
  )

  const deputyMembers = findByTitles(['DEPUTY COMMANDER'], {
    exclude: ['FOR SENIORS', 'FOR CADETS'],
  })
  const deputySeniorsMembers = findByTitles(['DEPUTY COMMANDER FOR SENIORS'])
  const deputyCadetsMembers = findByTitles(['DEPUTY COMMANDER FOR CADETS'])

  const deputyNode =
    deputyMembers.length > 0 || !restrictDeputyVacant
      ? node('deputy', 'Deputy Commander', 'senior', deputyMembers)
      : null
  const deputySeniorsNode =
    deputySeniorsMembers.length > 0 || !restrictDeputySpecialVacant
      ? node('cds', 'Deputy Commander for Seniors', 'senior', deputySeniorsMembers)
      : null
  const deputyCadetsNode =
    deputyCadetsMembers.length > 0 || !restrictDeputySpecialVacant
      ? node('cdc', 'Deputy Commander for Cadets', 'senior', deputyCadetsMembers)
      : null

  // Flight members: active home-unit cadets without a non-flight cadet duty,
  // split officers from NCOs/airmen (v1 Index.html:4919-4973).
  const flightMembersRaw = (dataset.membersByOrgid.get(org.orgid) ?? []).filter(m => {
    if (m.type.toUpperCase() !== 'CADET') return false
    if (m.mbrStatus.toUpperCase() !== 'ACTIVE') return false
    const memberCadetDuties = dataset.cadetDutiesByCapid.get(m.capid) ?? []
    const hasNonFlightDuty = memberCadetDuties.some(d => {
      const dutyUpper = d.duty.toUpperCase()
      if (d.duty === '' || dutyUpper.includes('#REF')) return false
      return !dutyUpper.includes('FLIGHT') && !dutyUpper.includes('ELEMENT')
    })
    return !hasNonFlightDuty
  })
  const isOfficerRank = (rank: string): boolean =>
    CADET_OFFICER_RANKS.has(rank.toUpperCase().replaceAll('.', '').trim())
  const flightOfficers = sortMembers(
    flightMembersRaw.filter(m => isOfficerRank(m.rank)).map(memberOnlyEntry),
  )
  const flightEnlisted = sortMembers(
    flightMembersRaw.filter(m => !isOfficerRank(m.rank)).map(memberOnlyEntry),
  )
  const flightCommanders = findByTitles(['CADET FLIGHT COMMANDER'], { cadet: true })
  const flightSergeants = findByTitles(['CADET FLIGHT SERGEANT'], { cadet: true })

  const flightOfficersNode = node('flight_officers', 'Flight Member Officers', 'cadet', flightOfficers)
  const flightEnlistedNode = node('flight_enlisted', 'Flight Member Airmen', 'cadet', flightEnlisted)

  // Flight leadership branching (v1 Index.html:4975-5034).
  const flightStructure: OrgChartNode[] = []
  if (flightCommanders.length > 0) {
    const flightCmdrChildren: OrgChartNode[] = []
    if (flightOfficers.length > 0) flightCmdrChildren.push(flightOfficersNode)
    if (flightSergeants.length > 0) {
      flightCmdrChildren.push(
        node(
          'flight_sgt',
          'Flight Sergeants',
          'cadet',
          flightSergeants,
          flightEnlisted.length > 0 ? [flightEnlistedNode] : [],
        ),
      )
    } else if (flightEnlisted.length > 0) {
      flightCmdrChildren.push(flightEnlistedNode)
    }
    flightStructure.push(
      node('flight_cmdr', 'Flight Commanders', 'cadet', flightCommanders, flightCmdrChildren),
    )
  } else if (flightSergeants.length > 0) {
    flightStructure.push(
      node(
        'flight_sgt',
        'Flight Sergeants',
        'cadet',
        flightSergeants,
        flightEnlisted.length > 0 ? [flightEnlistedNode] : [],
      ),
    )
    if (flightOfficers.length > 0) flightStructure.push(flightOfficersNode)
  } else {
    if (flightOfficers.length > 0) flightStructure.push(flightOfficersNode)
    if (flightEnlisted.length > 0) flightStructure.push(flightEnlistedNode)
  }

  // Cadet fixed hierarchy (v1 Index.html:5037-5073).
  const cadetOrgChildren: OrgChartNode[] = [
    node('c_first', 'C/First Sergeant', 'cadet', findByTitles(['CADET FIRST SERGEANT'], { cadet: true })),
    node(
      'c_dep_ops',
      'C/Dep Cmdr Operations',
      'cadet',
      findByTitles(['CADET DEPUTY COMMANDER FOR OPERATIONS'], { cadet: true }),
      flightStructure,
    ),
    node(
      'c_dep_sup',
      'C/Dep Cmdr Support',
      'cadet',
      findByTitles(['CADET DEPUTY COMMANDER FOR SUPPORT'], { cadet: true }),
      [
        node('c_admin', 'C/Admin', 'cadet', findByTitles(['CADET ADMINISTRATIVE'], { cadet: true })),
        node('c_pa', 'C/PA', 'cadet', findByTitles(['CADET PUBLIC AFFAIRS'], { cadet: true })),
        node('c_comm', 'C/Communications', 'cadet', findByTitles(['CADET COMMUNICATIONS'], { cadet: true })),
        node('c_supply', 'C/Supply', 'cadet', findByTitles(['CADET SUPPLY'], { cadet: true })),
        node('c_safety', 'C/Safety', 'cadet', findByTitles(['CADET SAFETY'], { cadet: true })),
      ],
    ),
  ]
  const cadetCommanderNode = node(
    'ccmdr',
    'Cadet Commander',
    'cadet',
    findByTitles(['CADET COMMANDER'], { cadet: true }),
    cadetOrgChildren,
  )
  const cadetChainHasMembers = finalizeVacancy(cadetCommanderNode)
  const includeCadetChain = cadetChainHasMembers || allowVacantCadetChain

  // Traditional senior staff structure (v1 Index.html:4849-4905).
  const staffNodes: OrgChartNode[] = [
    node(
      'ops',
      'Operations',
      'senior',
      findByTitles(['DIRECTOR OF OPERATIONS', 'OPERATIONS OFFICER'], { exclude: ['DEPUTY', 'CADET'] }),
      [
        node(
          'staneval',
          'Standardization/Evaluation',
          'senior',
          findByTitles(['STANDARDIZATION/EVALUATION OFFICER', 'STANDARDIZATION AND EVALUATION OFFICER']),
        ),
        node(
          'es',
          'Emergency Services',
          'senior',
          findByTitles(['DIRECTOR OF EMERGENCY SERVICES', 'EMERGENCY SERVICES OFFICER', 'DISASTER RELIEF OFFICER']),
          [
            node('sar', 'Search and Rescue', 'senior', findByTitles(['SEARCH AND RESCUE OFFICER'])),
            node('es_training', 'Emergency Services Training', 'senior', findByTitles(['EMERGENCY SERVICES TRAINING OFFICER'])),
            node('disaster', 'Disaster Preparedness', 'senior', findByTitles(['DISASTER PREPAREDNESS OFFICER'])),
            node('homeland', 'Homeland Security', 'senior', findByTitles(['HOMELAND SECURITY OFFICER'])),
          ],
        ),
        node('alerting', 'Alerting', 'senior', findByTitles(['ALERTING OFFICER'])),
      ],
    ),
    node(
      'log',
      'Logistics',
      'senior',
      findByTitles(['DIRECTOR OF LOGISTICS', 'LOGISTICS OFFICER']),
      [
        node('supply', 'Supply', 'senior', findByTitles(['SUPPLY OFFICER'], { exclude: ['CADET'] })),
        node('transport', 'Transportation', 'senior', findByTitles(['TRANSPORTATION OFFICER'])),
        node('maint', 'Maintenance', 'senior', findByTitles(['MAINTENANCE OFFICER'])),
      ],
    ),
    node(
      'comm',
      'Communications',
      'senior',
      findByTitles([
        'DIRECTOR OF COMMUNICATIONS',
        'COMMUNICATIONS OFFICER',
        'COMMUNICATIONS ENGINEERING OFFICER',
        'COMMUNICATIONS LICENSING OFFICER',
        'COMMUNICATIONS TRAINING OFFICER',
        'CIS OFFICER',
      ]),
    ),
    node(
      'pd',
      'Education and Training',
      'senior',
      findByTitles(['DIRECTOR OF EDUCATION AND TRAINING', 'EDUCATION AND TRAINING OFFICER', 'PROFESSIONAL DEVELOPMENT OFFICER']),
    ),
    node('personnel', 'Personnel', 'senior', findByTitles(['PERSONNEL OFFICER'])),
    node('recruiting', 'Recruiting', 'senior', findByTitles(['DIRECTOR OF RECRUITING', 'RECRUITING OFFICER'])),
    node(
      'it',
      'Information Technology',
      'senior',
      findByTitles(['DIRECTOR OF IT', 'INFORMATION TECHNOLOGIES OFFICER']),
      [node('websec', 'Web Security', 'senior', findByTitles(['WEB SECURITY ADMIN']))],
    ),
    node('cp', 'Cadet Programs', 'senior', findByTitles(['DIRECTOR OF CADET PROGRAMS', 'CADET PROGRAMS DEVELOPMENT OFFICER']), [
      node('act', 'Activities', 'senior', findByTitles(['ACTIVITIES OFFICER'])),
      node('fitness', 'Fitness', 'senior', findByTitles(['FITNESS OFFICER'])),
      node('lead', 'Leadership', 'senior', findByTitles(['LEADERSHIP OFFICER'])),
    ]),
    node('ae', 'Aerospace Education', 'senior', findByTitles(['DIRECTOR OF AEROSPACE EDUCATION', 'AEROSPACE EDUCATION OFFICER', 'CYBER EDUCATION OFFICER'])),
    node('legal', 'Legal', 'senior', findByTitles(['LEGAL OFFICER'])),
    node('safety', 'Safety', 'senior', findByTitles(['DIRECTOR OF SAFETY', 'SAFETY OFFICER'], { exclude: ['CADET'] })),
    node('ig', 'Inspector General', 'senior', findByTitles(['INSPECTOR GENERAL'])),
    node('nco', 'NCO Advisor', 'senior', findByTitles(['NCO ADVISOR', 'GROUP NCO'])),
    node('chaplain', 'Chaplain', 'senior', findByTitles(['CHAPLAIN', 'WING CHAPLAIN COORDINATOR']), [
      node('cdi', 'Character Development', 'senior', findByTitles(['CHARACTER DEVELOPMENT INSTRUCTOR'])),
    ]),
    node('pa', 'Public Affairs', 'senior', findByTitles(['PUBLIC AFFAIRS OFFICER', 'DIRECTOR OF PUBLIC AFFAIRS'], { exclude: ['CADET'] })),
    node('admin', 'Administration', 'senior', findByTitles(['ADMINISTRATIVE OFFICER', 'DIRECTOR OF ADMINISTRATION'], { exclude: ['CADET'] })),
    node('finance', 'Finance', 'senior', findByTitles(['FINANCE OFFICER', 'DIRECTOR OF FINANCE'])),
  ]

  // Additional members: in-scope active seniors holding no duty assignment
  // (v1 Index.html:5075-5096); v1 renders the node only when non-empty.
  const assignedCapids = new Set<number>()
  for (const d of duties) assignedCapids.add(d.capid)
  for (const d of cadetDuties) assignedCapids.add(d.capid)
  const unassignedSeniors = sortMembers(
    scopeMembers
      .filter(m => {
        const t = m.type.toUpperCase()
        return (
          (t === 'SENIOR' || t === 'LIFE') &&
          m.mbrStatus.toUpperCase() === 'ACTIVE' &&
          !assignedCapids.has(m.capid)
        )
      })
      .map(memberOnlyEntry),
  )

  const rootChildren: OrgChartNode[] = []
  if (deputyNode !== null) rootChildren.push(deputyNode)
  if (deputySeniorsNode !== null) rootChildren.push(deputySeniorsNode)
  if (deputyCadetsNode !== null) rootChildren.push(deputyCadetsNode)

  // Cadet commander attaches under DC-Cadets, else Deputy, else the root
  // (v1 Index.html:5199-5206).
  if (includeCadetChain) {
    if (deputyCadetsNode !== null) deputyCadetsNode.children.push(cadetCommanderNode)
    else if (deputyNode !== null) deputyNode.children.push(cadetCommanderNode)
    else rootChildren.push(cadetCommanderNode)
  }

  rootChildren.push(...staffNodes)

  // Safety net for duty titles the fixed structure does not model (the v1
  // wing Chief-of-Staff chain, Senior Enlisted Leader, advisors, Testing
  // Officer, Historian, Health Services, Plans and Programs, sUAS Officer,
  // Counterdrug, Development/Diversity, ...): any in-scope active senior who
  // holds a duty but landed in no rendered node attaches under Other Staff
  // with the duty title shown, so no duty-holder vanishes from the chart.
  // Additional Members below catches only the duty-less.
  const placedCapids = new Set<number>()
  const collectPlaced = (n: OrgChartNode): void => {
    for (const m of n.members) if (m.capid !== null) placedCapids.add(m.capid)
    for (const child of n.children) collectPlaced(child)
  }
  for (const m of commanderMembers) if (m.capid !== null) placedCapids.add(m.capid)
  for (const child of rootChildren) collectPlaced(child)
  const otherStaff = sortMembers(
    scopeMembers
      .filter(m => {
        const t = m.type.toUpperCase()
        return (
          (t === 'SENIOR' || t === 'LIFE') &&
          m.mbrStatus.toUpperCase() === 'ACTIVE' &&
          assignedCapids.has(m.capid) &&
          !placedCapids.has(m.capid)
        )
      })
      .map(m => {
        const titles = [
          ...duties.filter(d => d.capid === m.capid),
          ...cadetDuties.filter(d => d.capid === m.capid),
        ].map(d => `${d.duty}${d.asst ? ' (A)' : ''}`)
        return {
          capid: m.capid,
          display: `${chartDisplay(m, false)} (${[...new Set(titles)].join(', ')})`,
          asst: false,
        }
      }),
  )
  if (otherStaff.length > 0) {
    rootChildren.push(node('other_staff', 'Other Staff', 'senior', otherStaff))
  }

  if (unassignedSeniors.length > 0) {
    rootChildren.push(
      node('additional_members', `Additional Members (${unassignedSeniors.length})`, 'senior', unassignedSeniors),
    )
  }

  const root = node('commander', 'Commander', 'senior', commanderMembers, rootChildren)
  finalizeVacancy(root)
  return root
}

// --- Per-org assembly ---

function activeIncluded(members: readonly MemberRow[]): MemberRow[] {
  return members.filter(m => m.mbrStatus.toUpperCase() === 'ACTIVE')
}

function orgRow(
  dataset: Dataset,
  org: OrganizationRow,
  scope: ComputedOrgScope,
  scopeMembers: readonly MemberRow[],
  scopeOrgids: ReadonlySet<number>,
  asOf: Date,
): ComputedOrgRow {
  const active = activeIncluded(scopeMembers)
  let seniorCount = 0
  let cadetCount = 0
  for (const m of active) {
    const category = classifyMemberType(m.type)
    if (category === 'senior') seniorCount++
    else if (category === 'cadet') cadetCount++
  }
  const capids = new Set(active.map(m => m.capid))
  const metrics = getMetricsForUnit(dataset, scopeOrgids, {}, asOf)
  return {
    orgid: org.orgid,
    scope,
    memberCount: active.length,
    seniorCount,
    cadetCount,
    es: jsonify(analyzeUnit(dataset, org.orgid, capids, asOf)),
    orgStats: metrics !== null ? jsonify(metrics) : null,
    orgchart: buildOrgChart(dataset, org, scopeOrgids, scopeMembers),
  }
}

export function assembleOrgRows(
  dataset: Dataset,
  ctx: OrgComputeContext,
  asOf: Date,
): ComputedOrgRow[] {
  const unassignedMembers = dataset.members.filter(m => !ctx.subtreeOrgids.has(m.orgid))
  const rows: ComputedOrgRow[] = []

  for (const orgid of ctx.subtreeOrgids) {
    const org = dataset.orgByOrgid.get(orgid)
    if (org === undefined) continue

    const selfMembers = dataset.membersByOrgid.get(orgid) ?? []
    const selfOrgids = new Set([orgid])
    rows.push(orgRow(dataset, org, 'self', selfMembers, selfOrgids, asOf))

    const descendantSet = ctx.descendants.get(orgid) ?? selfOrgids
    const subtreeOrgids = new Set<number>()
    const subtreeMembers: MemberRow[] = []
    for (const descendant of descendantSet) {
      if (descendant === UNASSIGNED_ORGID) {
        // Only the anchor's descendant set carries the synthetic node; its
        // subtree row keeps out-of-tree members countable.
        subtreeMembers.push(...unassignedMembers)
        continue
      }
      subtreeOrgids.add(descendant)
      subtreeMembers.push(...(dataset.membersByOrgid.get(descendant) ?? []))
    }
    rows.push(orgRow(dataset, org, 'subtree', subtreeMembers, subtreeOrgids, asOf))
  }

  return rows
}

// --- Staging and the entry point ---

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function dateCell(d: Date | null): CellValue {
  return d !== null ? isoDate(d) : null
}

function jsonCell(value: unknown): CellValue {
  return value !== null && value !== undefined ? JSON.stringify(value) : null
}

function memberValues(r: ComputedMemberRow): CellValue[] {
  return [
    r.capid,
    r.orgid,
    r.nameLast,
    r.nameFirst,
    r.fullName,
    r.rank,
    r.memberType,
    dateCell(r.joined),
    dateCell(r.expiration),
    dateCell(r.rankDate),
    r.dobYear,
    r.ageAsofCompute,
    r.isSeniorScope,
    r.isCadetScope,
    r.currentLevel,
    jsonCell(r.levelProgress),
    jsonCell(r.promotion),
    dateCell(r.promotableOn),
    dateCell(r.tigEligibleOn),
    r.nextAchvId,
    r.nextAchvPublicNumber,
    jsonCell(r.cadetStateFacts),
    dateCell(r.tigCompleteOn),
    dateCell(r.hfzValidUntil),
    dateCell(r.lastPromotionOn),
    r.phase,
    r.honorCredit,
    jsonCell(r.esSummary),
    r.esExpiringCount,
    jsonCell(r.detail),
  ]
}

function dutyValues(r: ComputedMemberDutyRow): CellValue[] {
  return [r.capid, r.duty, r.asst, r.heldAtOrgid, r.functArea, r.lvl, r.source]
}

function trackValues(r: ComputedMemberTrackRow): CellValue[] {
  return [r.capid, r.track, r.trackLevel]
}

function orgValues(r: ComputedOrgRow): CellValue[] {
  return [
    r.orgid,
    r.scope,
    r.memberCount,
    r.seniorCount,
    r.cadetCount,
    jsonCell(r.es),
    jsonCell(r.orgStats),
    jsonCell(r.orgchart),
  ]
}

/** Same staging pattern as ingest/load.ts loadParsedTable: recreate <table><suffix> and bulk-insert. */
async function stageComputedTable(
  client: pg.PoolClient,
  table: string,
  suffix: string,
  columns: readonly string[],
  rows: readonly (readonly CellValue[])[],
): Promise<void> {
  const staged = `${table}${suffix}`
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(staged)}`)
  await client.query(`CREATE TABLE ${quoteIdent(staged)} (LIKE ${quoteIdent(table)} INCLUDING ALL)`)
  for (const stmt of buildInsertStatements(staged, columns, rows)) {
    await client.query(stmt.sql, stmt.params)
  }
}

export async function runCompute(
  client: pg.PoolClient,
  suffix: string,
  log: ComputeLog,
): Promise<void> {
  if (suffix === '') {
    throw new Error('compute: suffix must be non-empty; computed tables stage and swap, never write live')
  }

  const loaded = await loadDatasetInput(client, suffix)
  const dataset = buildDataset(loaded.input)
  const asOf = new Date()
  const ctx = buildOrgComputeContext(dataset, config.ANCHOR_ORGID, loaded.allMemberHomeOrgids)
  const levelPathMap = deriveLevelPathMap(dataset.plPaths)

  const memberRows: CellValue[][] = []
  const dutyRows: CellValue[][] = []
  const trackRows: CellValue[][] = []
  const seenCapids = new Set<number>()
  for (const member of dataset.members) {
    if (member.mbrStatus.toUpperCase() !== 'ACTIVE') continue
    if (seenCapids.has(member.capid)) continue
    seenCapids.add(member.capid)
    const assembled = assembleMemberRow(dataset, member, asOf, ctx, levelPathMap)
    memberRows.push(memberValues(assembled.member))
    for (const duty of assembled.duties) dutyRows.push(dutyValues(duty))
    for (const track of assembled.tracks) trackRows.push(trackValues(track))
  }

  const orgRows = assembleOrgRows(dataset, ctx, asOf)

  await stageComputedTable(client, COMPUTED_MEMBER_TABLE, suffix, COMPUTED_MEMBER_COLUMNS, memberRows)
  await stageComputedTable(client, COMPUTED_MEMBER_DUTY_TABLE, suffix, COMPUTED_MEMBER_DUTY_COLUMNS, dutyRows)
  await stageComputedTable(client, COMPUTED_MEMBER_TRACK_TABLE, suffix, COMPUTED_MEMBER_TRACK_COLUMNS, trackRows)
  await stageComputedTable(client, COMPUTED_ORG_TABLE, suffix, COMPUTED_ORG_COLUMNS, orgRows.map(orgValues))

  log.info(
    `compute: staged ${memberRows.length} members (${dutyRows.length} duties, ${trackRows.length} tracks), ` +
      `${orgRows.length} org rows across ${ctx.subtreeOrgids.size} orgs (anchor ${ctx.anchorOrgid}), asOf ${asOf.toISOString()}`,
  )
}
