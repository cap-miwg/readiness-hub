import { describe, expect, it } from 'vitest'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  NOT_MATCHED,
  buildMyProgress,
  expandRank,
  expiringQualsOf,
  resolveMemberMatch,
} = await import('../src/api/myProgress.js')

import type { ProgressMemberRow } from '../src/api/myProgress.js'
import type {
  CadetStateFacts,
  ComputedEsSummary,
  ComputedMemberDetail,
  Jsonified,
} from '../src/domain/computedTypes.js'
import type { EsQualification } from '../src/domain/es.js'
import type { ProcessedCadet } from '../src/domain/cadet.js'
import type { PromotionDetails } from '../src/domain/senior.js'

const AS_OF = new Date('2026-08-30T00:00:00Z')

describe('resolveMemberMatch: D11 identity resolution', () => {
  it('matches the CAPID mailbox local part when it is on the roster', () => {
    expect(
      resolveMemberMatch({ localCapid: 507610, localCapidOnRoster: true, emailCapids: [] }),
    ).toBe(507610)
    // Roster wins even if a contact row would also match.
    expect(
      resolveMemberMatch({ localCapid: 507610, localCapidOnRoster: true, emailCapids: [111] }),
    ).toBe(507610)
  })

  it('falls back to a UNIQUE primary-email match', () => {
    expect(
      resolveMemberMatch({ localCapid: null, localCapidOnRoster: false, emailCapids: [222] }),
    ).toBe(222)
    // A numeric local part that is not on the roster still allows the fallback.
    expect(
      resolveMemberMatch({ localCapid: 999999, localCapidOnRoster: false, emailCapids: [222] }),
    ).toBe(222)
  })

  it('returns null on zero or ambiguous matches, never a guess', () => {
    expect(
      resolveMemberMatch({ localCapid: null, localCapidOnRoster: false, emailCapids: [] }),
    ).toBeNull()
    expect(
      resolveMemberMatch({ localCapid: null, localCapidOnRoster: false, emailCapids: [1, 2] }),
    ).toBeNull()
    expect(NOT_MATCHED).toEqual({ matched: false, figures: [] })
  })
})

describe('expandRank: no bare grade abbreviations in prose', () => {
  it('expands the common senior grades and passes unknowns through', () => {
    expect(expandRank('MAJ')).toBe('Major')
    expect(expandRank('Lt Col')).toBe('Lieutenant Colonel')
    expect(expandRank('SMSgt')).toBe('Senior Master Sergeant')
    expect(expandRank('C/CMSgt')).toBe('C/CMSgt')
  })
})

const EMPTY_ES: ComputedEsSummary = {
  counts: { active: 0, training: 0, expired: 0, missing: 0, notApproved: 0 },
  qualifications: [],
}

const EMPTY_DETAIL: ComputedMemberDetail = {
  senior: null,
  cadet: null,
  esDashboard: [],
  esAll: [],
}

function qual(
  name: string,
  status: string,
  expiration: string | null,
): Jsonified<EsQualification> {
  return {
    achvId: 0,
    name,
    functionalArea: null,
    status,
    statusRaw: status,
    completed: null,
    expiration,
    daysTilExpiration: null,
    isExpiringSoon: false,
    isSkillsEvaluator: false,
    originallyAccomplished: null,
    authDate: null,
  } as Jsonified<EsQualification>
}

function promo(partial: Partial<Jsonified<PromotionDetails>>): Jsonified<PromotionDetails> {
  return {
    currentRank: 'CAPT',
    nextRank: 'MAJ',
    rankDate: '2023-01-01',
    tigMonthsCurrent: 40,
    tigMonthsRequired: 48,
    eligibleDate: '2026-12-01',
    isTigMet: false,
    levelRequired: 'Level 3',
    levelCurrent: 'Level 2',
    isLevelMet: false,
    dutyReq: null,
    isDutyMet: true,
    dutyStatusString: '',
    currentDutyMonths: 0,
    membershipMonthsRequired: null,
    membershipMonthsCurrent: 60,
    isMembershipMet: true,
    isEligible: false,
    ...partial,
  }
}

function seniorRow(partial: Partial<ProgressMemberRow>): ProgressMemberRow {
  return {
    capid: 507610,
    orgid: 2045,
    fullName: 'Capt Morales, Jordan',
    rank: 'Capt',
    isSeniorScope: true,
    isCadetScope: false,
    levelProgress: null,
    promotion: { kind: 'senior', details: promo({}) },
    cadetStateFacts: null,
    esSummary: EMPTY_ES,
    detail: EMPTY_DETAIL,
    ...partial,
  }
}

describe('buildMyProgress: senior card', () => {
  it('writes a plain-English next action with the expanded grade and remaining items', () => {
    const res = buildMyProgress(seniorRow({}), 'GLR-MI-104', AS_OF)
    expect(res.matched).toBe(true)
    expect(res.member?.scope).toBe('senior')
    expect(res.member?.unitLabel).toBe('GLR-MI-104')
    expect(res.nextAction).toBe(
      'Your next promotion is to Major. Remaining: time in grade is met in 93 days; complete Level 3 (you are at Level 2).',
    )
    // 2026-08-30 -> 2026-12-01 is 93 days.
    expect(res.figures[0]).toEqual({ label: 'Days to time in grade, Major', value: '93' })
    expect(res.checklist).toEqual([
      {
        label: 'Time in grade toward Major',
        done: false,
        detail: '40 of 48 months',
      },
      { label: 'Complete Level 3', done: false, detail: 'Current: Level 2' },
    ])
  })

  it('celebrates full eligibility and marks met time in grade', () => {
    const res = buildMyProgress(
      seniorRow({
        promotion: {
          kind: 'senior',
          details: promo({ isTigMet: true, isLevelMet: true, isEligible: true }),
        },
      }),
      null,
      AS_OF,
    )
    expect(res.nextAction).toBe(
      'You meet every recorded requirement for promotion to Major. Talk with your commander about submitting it.',
    )
    expect(res.figures[0]).toEqual({ label: 'Time in grade for Major', value: 'Met' })
  })

  it('degrades gracefully when the grade has no promotion rule', () => {
    const res = buildMyProgress(seniorRow({ promotion: null }), null, AS_OF)
    expect(res.nextAction).toContain('no duty-performance promotion requirement')
    expect(res.checklist).toBeUndefined()
  })

  it('surfaces expiring qualifications with the soonest as the caption', () => {
    const es: ComputedEsSummary = {
      counts: { active: 2, training: 0, expired: 0, missing: 0, notApproved: 0 },
      qualifications: [
        qual('GTM3', 'Active', '2026-11-12'),
        qual('UDF', 'Active', '2026-09-15'),
        qual('GES', 'Active', '2028-01-01'),
        qual('GTL', 'Expired', '2026-08-01'),
      ],
    }
    const res = buildMyProgress(seniorRow({ esSummary: es }), null, AS_OF)
    expect(res.expiringQuals).toEqual([
      { qualification: 'UDF', expiration: '2026-09-15', daysUntil: 16 },
      { qualification: 'GTM3', expiration: '2026-11-12', daysUntil: 74 },
    ])
    const qualsFigure = res.figures.find(f => f.label === 'Qualifications expiring in 90 days')
    expect(qualsFigure?.value).toBe('2')
    expect(qualsFigure?.caption).toBe('UDF, expires 2026-09-15')
    expect(expiringQualsOf(es, AS_OF)).toHaveLength(2)
  })
})

function cadetFacts(partial: Partial<CadetStateFacts>): CadetStateFacts {
  return {
    spaatzComplete: false,
    reqsReady: false,
    hfzCounted: false,
    hfzValidUntil: null,
    tigEligibleOn: null,
    hardDone: 0,
    controllableDone: 0,
    controllableTotal: 5,
    stateAtCompute: 'NOT_STARTED',
    ...partial,
  }
}

function cadetDetail(
  nextAchievementName: string,
  requirements: { label: string; completed: boolean; value: string | null }[],
): ComputedMemberDetail {
  const pending = requirements.filter(r => !r.completed)
  const cadet = {
    nextAchievementName,
    nextRequirements: {
      achievementId: 5,
      requirements,
      completed: requirements.filter(r => r.completed),
      pending,
      completionPercent: 0,
    },
  } as unknown as Jsonified<ProcessedCadet>
  return { ...EMPTY_DETAIL, cadet }
}

function cadetRow(partial: Partial<ProgressMemberRow>): ProgressMemberRow {
  return {
    capid: 700001,
    orgid: 2045,
    fullName: 'C/SSgt Doe, Alex',
    rank: 'C/SSgt',
    isSeniorScope: false,
    isCadetScope: true,
    levelProgress: null,
    promotion: null,
    cadetStateFacts: cadetFacts({}),
    esSummary: EMPTY_ES,
    detail: EMPTY_DETAIL,
    ...partial,
  }
}

describe('buildMyProgress: cadet card', () => {
  it('READY: points at the promotion board', () => {
    const res = buildMyProgress(
      cadetRow({
        cadetStateFacts: cadetFacts({ reqsReady: true, tigEligibleOn: '2026-08-01' }),
        detail: cadetDetail('Wright Brothers', []),
      }),
      'GLR-MI-104',
      AS_OF,
    )
    expect(res.member?.scope).toBe('cadet')
    expect(res.nextAction).toBe(
      'You are ready to promote to Wright Brothers. Ask your chain of command about the next promotion board.',
    )
  })

  it('TIME_PENDING: names the days remaining and expands nothing cryptic', () => {
    const res = buildMyProgress(
      cadetRow({
        cadetStateFacts: cadetFacts({
          reqsReady: true,
          tigEligibleOn: '2026-09-10',
          controllableDone: 5,
        }),
        detail: cadetDetail('Wright Brothers', []),
      }),
      null,
      AS_OF,
    )
    expect(res.nextAction).toBe(
      'Every requirement in your control for Wright Brothers is complete. Time in grade is met in 11 days.',
    )
    expect(res.figures[0]).toEqual({ label: 'Days to time in grade', value: '11' })
    expect(res.figures[1]).toEqual({ label: 'Requirements complete', value: '5 of 5' })
    // No HFZ window recorded renders the neutral NOT RECORDED state.
    expect(res.figures[2]).toEqual({
      label: 'Healthy Fitness Zone credit',
      value: 'Not recorded',
    })
  })

  it('IN_PROGRESS: suggests the first pending requirement and maps the checklist', () => {
    const res = buildMyProgress(
      cadetRow({
        cadetStateFacts: cadetFacts({
          controllableDone: 2,
          controllableTotal: 5,
          hardDone: 1,
          tigEligibleOn: '2026-10-01',
          hfzCounted: true,
          hfzValidUntil: '2026-10-15',
        }),
        detail: cadetDetail('Wright Brothers', [
          { label: 'Leadership Test', completed: true, value: 'Passed' },
          { label: 'Aerospace Test', completed: false, value: 'Not passed' },
        ]),
      }),
      null,
      AS_OF,
    )
    expect(res.nextAction).toBe(
      '2 of 5 requirements in your control for Wright Brothers are complete. Aerospace Test is a good next step.',
    )
    expect(res.checklist).toEqual([
      { label: 'Leadership Test', done: true, detail: 'Passed' },
      { label: 'Aerospace Test', done: false, detail: 'Not passed' },
    ])
    const hfzFigure = res.figures.find(f => f.label === 'Days of fitness credit remaining')
    expect(hfzFigure?.value).toBe('46')
    expect(hfzFigure?.caption).toBe('Healthy Fitness Zone valid through 2026-10-15')
  })

  it('SPAATZ_COMPLETE: congratulates and shows no countdown figures', () => {
    const res = buildMyProgress(
      cadetRow({ cadetStateFacts: cadetFacts({ spaatzComplete: true }) }),
      null,
      AS_OF,
    )
    expect(res.nextAction).toContain('Spaatz Award')
    expect(res.figures).toEqual([])
  })
})
