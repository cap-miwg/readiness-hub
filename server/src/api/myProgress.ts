/**
 * GET /api/me/progress: the personal My Progress card (V2-DESIGN-PLAN.md D11,
 * section 5). Identity resolution: (1) the session email local part parsed as
 * an integer CAPID present on the computed roster, else (2) a unique match
 * against MbrContact PRIMARY EMAIL. Zero or ambiguous matches return
 * matched: false and nothing else; the server never guesses (a wrong guess
 * would show someone else's record).
 *
 * Copy rule: plain English, no bare acronyms without expansion on first use
 * (time in grade, Healthy Fitness Zone, Emergency Services). Time-dependent
 * flags re-derive at request time from stored dates, matching the rest of the
 * API (docs/ARCHITECTURE.md, Compute).
 *
 * Pure shapers (everything above the "DB loaders" divider) are unit-tested in
 * server/test/myProgress.test.ts without a database.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import { deriveCadetState, daysUntil, isExpiringSoon } from '../domain/timeSensitive.js'
import type {
  CadetStateFacts,
  ComputedEsSummary,
  ComputedMemberDetail,
  ComputedPromotion,
  Jsonified,
} from '../domain/computedTypes.js'
import type { LevelsProgress, PromotionDetails } from '../domain/senior.js'
import type {
  MyProgressChecklistItem,
  MyProgressExpiringQual,
  MyProgressFigure,
  MyProgressResponse,
  MyProgressScope,
  SeniorLevelId,
} from '../shared/contracts.js'
import { loadOrgInfo } from './scope.js'
import { capidFromEmail, isoDate, unitLabel, SENIOR_LEVEL_IDS } from './util.js'

// --- Pure: identity matching (D11) ---

export interface MatchInputs {
  /** The email local part parsed as an integer CAPID; null when not numeric. */
  localCapid: number | null
  /** Whether localCapid exists in computed_member. */
  localCapidOnRoster: boolean
  /** Distinct roster capids whose PRIMARY EMAIL equals the session email. */
  emailCapids: readonly number[]
}

/**
 * CAPID mailbox convention first; else a UNIQUE primary-email match; zero or
 * ambiguous matches resolve to null (graceful non-match, never a guess).
 */
export function resolveMemberMatch(inputs: MatchInputs): number | null {
  if (inputs.localCapid !== null && inputs.localCapidOnRoster) return inputs.localCapid
  if (inputs.emailCapids.length === 1) return inputs.emailCapids[0] ?? null
  return null
}

/**
 * Comparison key for the primary-email match: trimmed then lowercased. The
 * MbrContact mirror carries real rows with leading/trailing whitespace, so
 * both sides of the match normalize the same way (SQL: lower(trim(contact))).
 */
export function emailMatchKey(email: string): string {
  return email.trim().toLowerCase()
}

// --- Pure: response shaping ---

/** camelCase mirror of the computed_member columns the card needs. */
export interface ProgressMemberRow {
  capid: number
  orgid: number
  fullName: string
  rank: string
  isSeniorScope: boolean
  isCadetScope: boolean
  levelProgress: Jsonified<LevelsProgress> | null
  promotion: ComputedPromotion | null
  cadetStateFacts: CadetStateFacts | null
  esSummary: ComputedEsSummary
  detail: ComputedMemberDetail
}

/** Grade abbreviation -> plain English, for the no-bare-acronyms rule. */
const RANK_WORDS: Readonly<Record<string, string>> = {
  SM: 'Senior Member',
  FO: 'Flight Officer',
  TFO: 'Technical Flight Officer',
  SFO: 'Senior Flight Officer',
  '2D LT': 'Second Lieutenant',
  '1ST LT': 'First Lieutenant',
  CAPT: 'Captain',
  MAJ: 'Major',
  'LT COL': 'Lieutenant Colonel',
  COL: 'Colonel',
  SSGT: 'Staff Sergeant',
  TSGT: 'Technical Sergeant',
  MSGT: 'Master Sergeant',
  SMSGT: 'Senior Master Sergeant',
  CMSGT: 'Chief Master Sergeant',
}

export function expandRank(rank: string): string {
  return RANK_WORDS[rank.trim().toUpperCase()] ?? rank.trim()
}

const LEVEL_LABELS: Readonly<Record<SeniorLevelId, string>> = {
  L1: 'Level 1',
  L2P1: 'Level 2 Part 1',
  L2P2: 'Level 2 Part 2',
  L3: 'Level 3',
  L4: 'Level 4',
  L5: 'Level 5',
}

/** First level in path order that is not complete: the one being worked. */
function workingLevelOf(
  progress: Jsonified<LevelsProgress> | null,
): { id: SeniorLevelId; label: string; tasksLeft: number; pendingApproval: boolean } | null {
  if (progress === null) return null
  for (const id of SENIOR_LEVEL_IDS) {
    const level = progress[id]
    if (level === undefined || level.status === 'completed') continue
    return {
      id,
      label: LEVEL_LABELS[id],
      tasksLeft: Math.max(0, level.totalReq - level.totalComp),
      pendingApproval: level.approvalStatus === 'pending',
    }
  }
  return null
}

/** Active Emergency Services quals expiring within 90 days, soonest first. */
export function expiringQualsOf(
  esSummary: ComputedEsSummary,
  asOf: Date,
): MyProgressExpiringQual[] {
  return esSummary.qualifications
    .filter(q => q.status === 'Active' && isExpiringSoon(q.expiration, asOf, 90))
    .map(q => ({
      qualification: q.name,
      expiration: isoDate(q.expiration),
      daysUntil: daysUntil(q.expiration, asOf),
    }))
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
}

function qualFigure(expiring: readonly MyProgressExpiringQual[]): MyProgressFigure {
  const soonest = expiring[0]
  const figure: MyProgressFigure = {
    label: 'Qualifications expiring in 90 days',
    value: String(expiring.length),
  }
  if (soonest !== undefined && soonest.expiration !== null) {
    figure.caption = `${soonest.qualification}, expires ${soonest.expiration}`
  }
  return figure
}

function seniorShape(
  row: ProgressMemberRow,
  asOf: Date,
): Pick<MyProgressResponse, 'nextAction' | 'figures' | 'checklist'> {
  const promo =
    row.promotion !== null && row.promotion.kind === 'senior' ? row.promotion.details : null
  const working = workingLevelOf(row.levelProgress)
  const figures: MyProgressFigure[] = []
  let nextAction: string
  let checklist: MyProgressChecklistItem[] | undefined

  if (promo === null) {
    nextAction =
      'Your grade has no duty-performance promotion requirement on record; advancement past it is by special appointment. Keep your specialty track and Education and Training level moving.'
  } else {
    const next = expandRank(promo.nextRank)
    const tigDays = daysUntil(promo.eligibleDate, asOf)

    if (promo.isTigMet) {
      figures.push({ label: `Time in grade for ${next}`, value: 'Met' })
    } else if (tigDays !== null && tigDays >= 0) {
      figures.push({ label: `Days to time in grade, ${next}`, value: String(tigDays) })
    }

    checklist = [
      {
        label: `Time in grade toward ${next}`,
        done: promo.isTigMet,
        detail: `${promo.tigMonthsCurrent} of ${promo.tigMonthsRequired} months`,
      },
      {
        label: `Complete ${promo.levelRequired}`,
        done: promo.isLevelMet,
        detail: `Current: ${promo.levelCurrent}`,
      },
    ]
    if (promo.dutyReq !== null) {
      checklist.push({
        label: `Duty requirement: ${promo.dutyReq}`,
        done: promo.isDutyMet,
        detail: promo.dutyStatusString || null,
      })
    }
    if (promo.membershipMonthsRequired !== null) {
      checklist.push({
        label: 'Membership time',
        done: promo.isMembershipMet,
        detail: `${promo.membershipMonthsCurrent} of ${promo.membershipMonthsRequired} months`,
      })
    }

    if (promo.isEligible) {
      nextAction = `You meet every recorded requirement for promotion to ${next}. Talk with your commander about submitting it.`
    } else {
      const remaining: string[] = []
      if (!promo.isTigMet) {
        remaining.push(
          tigDays !== null && tigDays >= 0
            ? `time in grade is met in ${tigDays} ${tigDays === 1 ? 'day' : 'days'}`
            : 'time in grade is not yet met',
        )
      }
      if (!promo.isLevelMet) {
        remaining.push(`complete ${promo.levelRequired} (you are at ${promo.levelCurrent})`)
      }
      if (!promo.isDutyMet && promo.dutyReq !== null) {
        remaining.push(`meet the duty requirement: ${promo.dutyReq}`)
      }
      if (!promo.isMembershipMet && promo.membershipMonthsRequired !== null) {
        remaining.push(
          `${Math.max(0, promo.membershipMonthsRequired - promo.membershipMonthsCurrent)} more months of membership`,
        )
      }
      nextAction =
        remaining.length > 0
          ? `Your next promotion is to ${next}. Remaining: ${remaining.join('; ')}.`
          : `Your next promotion is to ${next}.`
    }
  }

  if (working !== null) {
    figures.push({
      label: `Tasks left in ${working.label}`,
      value: String(working.tasksLeft),
      ...(working.pendingApproval ? { caption: 'Awaiting approval' } : {}),
    })
  }

  const expiring = expiringQualsOf(row.esSummary, asOf)
  figures.push(qualFigure(expiring))

  const result: Pick<MyProgressResponse, 'nextAction' | 'figures' | 'checklist'> = {
    nextAction,
    figures: figures.slice(0, 3),
  }
  if (checklist !== undefined) result.checklist = checklist
  return result
}

function cadetShape(
  row: ProgressMemberRow,
  asOf: Date,
): Pick<MyProgressResponse, 'nextAction' | 'figures' | 'checklist'> {
  const facts = row.cadetStateFacts
  const cadet = row.detail.cadet
  const nextName = cadet?.nextAchievementName ?? 'your next achievement'
  const figures: MyProgressFigure[] = []
  let nextAction: string

  if (facts === null) {
    return {
      nextAction: 'Your cadet record has no promotion data in the current extract yet.',
      figures: [],
    }
  }

  const state = deriveCadetState(facts, asOf)
  const tigDays = daysUntil(facts.tigEligibleOn, asOf)
  // Same degradation rule as timeSensitive.deriveCadetState: a lapsed HFZ
  // window removes one controllable completion at read time.
  const hfzDaysLeft = daysUntil(facts.hfzValidUntil, asOf)
  const hfzExpired = facts.hfzCounted && (hfzDaysLeft === null || hfzDaysLeft < 0)
  const controllableDone = Math.max(0, facts.controllableDone - (hfzExpired ? 1 : 0))

  switch (state) {
    case 'SPAATZ_COMPLETE':
      nextAction = 'You have earned the Spaatz Award, the final cadet milestone. Congratulations.'
      break
    case 'READY':
      nextAction = `You are ready to promote to ${nextName}. Ask your chain of command about the next promotion board.`
      break
    case 'TIME_PENDING':
      nextAction =
        tigDays !== null && tigDays >= 0
          ? `Every requirement in your control for ${nextName} is complete. Time in grade is met in ${tigDays} ${tigDays === 1 ? 'day' : 'days'}.`
          : `Every requirement in your control for ${nextName} is complete. Only time in grade remains.`
      break
    default: {
      const firstPending = cadet?.nextRequirements?.pending?.[0]?.label
      const progress = `${controllableDone} of ${facts.controllableTotal} requirements in your control for ${nextName} are complete.`
      nextAction =
        firstPending !== undefined
          ? `${progress} ${firstPending} is a good next step.`
          : progress
    }
  }

  if (state !== 'SPAATZ_COMPLETE') {
    if (tigDays !== null && tigDays > 0) {
      figures.push({ label: 'Days to time in grade', value: String(tigDays) })
    } else if (facts.tigEligibleOn !== null) {
      figures.push({ label: 'Time in grade', value: 'Met' })
    }
    figures.push({
      label: 'Requirements complete',
      value: `${controllableDone} of ${facts.controllableTotal}`,
    })
    if (facts.hfzValidUntil !== null) {
      const hfzDays = daysUntil(facts.hfzValidUntil, asOf)
      figures.push({
        label: 'Days of fitness credit remaining',
        value: String(Math.max(0, hfzDays ?? 0)),
        caption: `Healthy Fitness Zone valid through ${facts.hfzValidUntil}`,
      })
    } else {
      figures.push({ label: 'Healthy Fitness Zone credit', value: 'Not recorded' })
    }
  }

  const checklist: MyProgressChecklistItem[] | undefined = cadet?.nextRequirements?.requirements.map(
    r => ({
      label: r.label,
      done: r.completed,
      detail: r.value,
    }),
  )

  const result: Pick<MyProgressResponse, 'nextAction' | 'figures' | 'checklist'> = {
    nextAction,
    figures: figures.slice(0, 3),
  }
  if (checklist !== undefined && checklist.length > 0) result.checklist = checklist
  return result
}

/** Full response for a matched member; pure over the row + resolved unit label. */
export function buildMyProgress(
  row: ProgressMemberRow,
  memberUnitLabel: string | null,
  asOf: Date,
): MyProgressResponse {
  const scope: MyProgressScope = row.isCadetScope
    ? 'cadet'
    : row.isSeniorScope
      ? 'senior'
      : 'other'

  const base: MyProgressResponse = {
    matched: true,
    member: {
      capid: row.capid,
      fullName: row.fullName,
      rank: row.rank,
      orgid: row.orgid,
      unitLabel: memberUnitLabel,
      scope,
    },
    figures: [],
  }

  if (scope === 'cadet') {
    Object.assign(base, cadetShape(row, asOf))
  } else if (scope === 'senior') {
    Object.assign(base, seniorShape(row, asOf))
  } else {
    base.nextAction =
      'Your membership type has no promotion track in this app. Emergency Services qualifications still appear below when you hold any.'
  }

  const expiring = expiringQualsOf(row.esSummary, asOf)
  if (expiring.length > 0) base.expiringQuals = expiring
  return base
}

export const NOT_MATCHED: MyProgressResponse = { matched: false, figures: [] }

// --- DB loaders ---

interface DbProgressRow {
  capid: number
  orgid: number
  full_name: string
  rank: string
  is_senior_scope: boolean
  is_cadet_scope: boolean
  level_progress: unknown
  promotion: unknown
  cadet_state_facts: unknown
  es_summary: unknown
  detail: unknown
}

const PROGRESS_SELECT = `SELECT capid, orgid, full_name, rank, is_senior_scope, is_cadet_scope,
        level_progress, promotion, cadet_state_facts, es_summary, detail
 FROM computed_member`

function progressRowOf(r: DbProgressRow): ProgressMemberRow {
  return {
    capid: r.capid,
    orgid: r.orgid,
    fullName: r.full_name,
    rank: r.rank,
    isSeniorScope: r.is_senior_scope,
    isCadetScope: r.is_cadet_scope,
    levelProgress: (r.level_progress as Jsonified<LevelsProgress> | null) ?? null,
    promotion: (r.promotion as ComputedPromotion | null) ?? null,
    cadetStateFacts: (r.cadet_state_facts as CadetStateFacts | null) ?? null,
    esSummary: (r.es_summary as ComputedEsSummary | null) ?? {
      counts: { active: 0, training: 0, expired: 0, missing: 0, notApproved: 0 },
      qualifications: [],
    },
    detail: r.detail as ComputedMemberDetail,
  }
}

/** D11 resolution against the live tables; null = no confident match. */
async function resolveCapidFor(email: string): Promise<number | null> {
  const localCapid = capidFromEmail(email)
  let localCapidOnRoster = false
  if (localCapid !== null) {
    const res = await pool.query<{ capid: number }>(
      'SELECT capid FROM computed_member WHERE capid = $1',
      [localCapid],
    )
    localCapidOnRoster = res.rows.length > 0
  }
  let emailCapids: number[] = []
  if (localCapid === null || !localCapidOnRoster) {
    const res = await pool.query<{ capid: number }>(
      `SELECT DISTINCT m.capid
       FROM mbr_contact c
       JOIN computed_member m ON m.capid = c.capid
       WHERE upper(c.type) = 'EMAIL' AND upper(c.priority) = 'PRIMARY'
         AND lower(trim(c.contact)) = $1`,
      [emailMatchKey(email)],
    )
    emailCapids = res.rows.map(r => r.capid)
  }
  return resolveMemberMatch({ localCapid, localCapidOnRoster, emailCapids })
}

// --- Route ---

async function handleMyProgress(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = req.rhSession
  if (session === undefined) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }
  const capid = await resolveCapidFor(session.email)
  if (capid === null) {
    reply.send(NOT_MATCHED)
    return
  }
  const res = await pool.query<DbProgressRow>(`${PROGRESS_SELECT} WHERE capid = $1`, [capid])
  const dbRow = res.rows[0]
  if (dbRow === undefined) {
    reply.send(NOT_MATCHED)
    return
  }
  const row = progressRowOf(dbRow)
  const info = await loadOrgInfo([row.orgid])
  const orgInfo = info.get(row.orgid)
  const label = orgInfo ? unitLabel(orgInfo.region, orgInfo.wing, orgInfo.unit) : null
  reply.send(buildMyProgress(row, label, new Date()))
}

export function registerMyProgressRoutes(app: FastifyInstance): void {
  app.get('/api/me/progress', { preHandler: requireAuth }, handleMyProgress)
}
