import { describe, expect, it } from 'vitest'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  EMPTY_SOURCES,
  FINDINGS_CAP,
  cadetFindingCountsOf,
  meetingLineOf,
  qualBreakdownOf,
  qualFindingCountsOf,
  rankFindings,
  scopeSearchOf,
  strengthDeltaOf,
  strengthSeriesOf,
} = await import('../src/api/findings.js')
const { announcementActiveOn, announcementCreateSchema, announcementUpdateSchema } = await import(
  '../src/api/announcements.js'
)

import type { FindingSources, CadetFactRow, QualStatusRow } from '../src/api/findings.js'
import type { CadetStateFacts, Jsonified } from '../src/domain/computedTypes.js'
import type { MonthlyEntry, UnitOrgStatsMetrics } from '../src/domain/orgStats.js'

const AS_OF = new Date('2026-08-30T00:00:00Z')

function sources(partial: Partial<FindingSources>): FindingSources {
  return { ...EMPTY_SOURCES, ...partial }
}

describe('rankFindings: the ranked Needs Attention queue', () => {
  it('returns [] cleanly for a healthy scope', () => {
    expect(rankFindings(EMPTY_SOURCES, 104, false)).toEqual([])
  })

  it('ranks action > watch > plan, by magnitude within a category, capped at 5', () => {
    const findings = rankFindings(
      sources({
        expiredQuals: [
          { name: 'GTM2', count: 2 },
          { name: 'UDF', count: 1 },
        ],
        spofPositions: ['Ground Team Leader'],
        membershipsExpiring30: 4,
        cadetsReady: 6,
        tigWithin14: 2,
        seniorsAwaitingApproval: 1,
      }),
      104,
      true,
    )
    expect(findings.map(f => f.id)).toEqual([
      'es-quals-expired',
      'spof-ground-team-leader',
      'memberships-expiring',
      'cadets-ready',
      'tig-within-14',
    ])
    expect(findings.map(f => f.rank)).toEqual([1, 2, 3, 4, 5])
    expect(findings.map(f => f.category)).toEqual(['action', 'action', 'watch', 'plan', 'plan'])
    expect(findings.length).toBeLessThanOrEqual(FINDINGS_CAP)
  })

  it('writes one-sentence counts-not-names copy with a qual breakdown', () => {
    const [first] = rankFindings(
      sources({
        expiredQuals: [
          { name: 'GTM2', count: 2 },
          { name: 'UDF', count: 1 },
        ],
      }),
      104,
      true,
    )
    expect(first?.text).toBe(
      '3 Emergency Services qualifications expired in the last 60 days: 2 GTM2, 1 UDF.',
    )
    // ES-related findings land on the es section, not the top of the page.
    expect(first?.href).toBe('/unit?orgid=104&descendants=1&section=es')
    expect(first?.actionLabel).toBe('Review expirations')
  })

  it('names the SPOF position at rest, never the member (D9)', () => {
    const findings = rankFindings(
      sources({ spofPositions: ['Mission Scanner/Observer'] }),
      104,
      false,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.text).toBe('Mission Scanner/Observer rests on one qualified member.')
    expect(findings[0]?.id).toBe('spof-mission-scanner-observer')
    expect(findings[0]?.href).toBe('/unit?orgid=104&section=es')
  })

  it('sends every ES finding to the es section; other pages keep plain hrefs', () => {
    const byId = new Map(
      rankFindings(
        sources({
          expiredQuals: [{ name: 'GTM2', count: 1 }],
          spofPositions: ['Ground Team Leader'],
          qualsExpiring30: 2,
          expiredMemberships: 1,
          cadetsReady: 1,
        }),
        104,
        false,
      ).map(f => [f.id, f]),
    )
    expect(byId.get('es-quals-expired')?.href).toBe('/unit?orgid=104&section=es')
    expect(byId.get('spof-ground-team-leader')?.href).toBe('/unit?orgid=104&section=es')
    expect(byId.get('es-quals-expiring-30')?.href).toBe('/unit?orgid=104&section=es')
    expect(byId.get('memberships-expired')?.href).toBe(
      '/reports?report=membership-lapse&orgid=104',
    )
    expect(byId.get('cadets-ready')?.href).toBe('/cadets?orgid=104&state=READY')
  })

  it('uses singular grammar for counts of one', () => {
    const byId = new Map(
      rankFindings(
        sources({
          expiredMemberships: 1,
          membershipsExpiring30: 1,
          cadetsReady: 1,
          seniorsAwaitingApproval: 1,
        }),
        7,
        false,
      ).map(f => [f.id, f]),
    )
    expect(byId.get('memberships-expired')?.text).toBe(
      '1 membership has expired while the member is still on the active roster.',
    )
    expect(byId.get('memberships-expiring')?.text).toBe(
      '1 membership expires within 30 days.',
    )
    expect(byId.get('cadets-ready')?.text).toBe(
      '1 cadet is fully ready and awaiting a promotion board.',
    )
    expect(byId.get('seniors-awaiting-approval')?.text).toBe(
      '1 senior member has a completed level awaiting approval.',
    )
  })

  it('deep-links carry the org scope and page filters', () => {
    const byId = new Map(
      rankFindings(
        sources({ cadetsReady: 3, tigWithin14: 2, expiredMemberships: 1 }),
        205,
        true,
      ).map(f => [f.id, f]),
    )
    expect(byId.get('cadets-ready')?.href).toBe('/cadets?orgid=205&descendants=1&state=READY')
    expect(byId.get('tig-within-14')?.href).toBe(
      '/cadets?orgid=205&descendants=1&state=TIME_PENDING',
    )
    expect(byId.get('memberships-expired')?.href).toBe(
      '/reports?report=membership-lapse&orgid=205&descendants=1',
    )
  })

  it('merges the membership bands into one sentence, nearer band leading', () => {
    const both = rankFindings(
      sources({ membershipsExpiring30: 2, membershipsExpiring60: 9 }),
      1,
      false,
    )
    expect(both.map(f => f.id)).toEqual(['memberships-expiring'])
    expect(both[0]?.text).toBe('2 memberships expire within 30 days; 9 more within 60.')

    const solo60 = rankFindings(sources({ membershipsExpiring60: 9 }), 1, false)
    expect(solo60[0]?.text).toBe('9 memberships expire within 60 days.')

    const solo30 = rankFindings(sources({ membershipsExpiring30: 1 }), 1, false)
    expect(solo30[0]?.text).toBe('1 membership expires within 30 days.')
  })
})

describe('scopeSearchOf and qualBreakdownOf', () => {
  it('builds the org scope search string', () => {
    expect(scopeSearchOf(104, false)).toBe('?orgid=104')
    expect(scopeSearchOf(104, true)).toBe('?orgid=104&descendants=1')
  })

  it('shows the top three qual kinds and folds the rest', () => {
    expect(
      qualBreakdownOf([
        { name: 'GTM2', count: 2 },
        { name: 'UDF', count: 1 },
      ]),
    ).toBe('2 GTM2, 1 UDF')
    expect(
      qualBreakdownOf([
        { name: 'GTM3', count: 1 },
        { name: 'GTM2', count: 4 },
        { name: 'UDF', count: 2 },
        { name: 'MS', count: 1 },
        { name: 'MRO', count: 1 },
      ]),
    ).toBe('4 GTM2, 2 UDF, 1 GTM3, and 2 more')
  })
})

describe('qualFindingCountsOf: counts on a deduped (capid, qual) basis', () => {
  const q = (
    capid: number,
    name: string,
    status: string,
    expiration: string | null,
  ): QualStatusRow => ({ capid, name, status, expiration })

  it('suppresses an Expired row when the member also holds a Training row', () => {
    // The cadet basis in es_summary is not deduped: a cadet re-training a
    // lapsed qual carries both rows and must not count as an expiration.
    const counts = qualFindingCountsOf(
      [
        q(11, 'GTM3 - Ground Team Member Level 3', 'Expired', '2026-07-15'),
        q(11, 'GTM3 - Ground Team Member Level 3', 'Training', null),
      ],
      AS_OF,
    )
    expect(counts.expiredQuals).toEqual([])
  })

  it('suppresses Expired under Active, and counts duplicate Expired rows once', () => {
    const counts = qualFindingCountsOf(
      [
        q(11, 'MRO', 'Expired', '2026-07-15'),
        q(11, 'MRO', 'Active', '2027-01-01'),
        q(12, 'UDF', 'Expired', '2026-07-20'),
        q(12, 'UDF', 'Expired', '2026-07-20'),
        q(13, 'UDF', 'Expired', '2026-08-01'),
      ],
      AS_OF,
    )
    expect(counts.expiredQuals).toEqual([{ name: 'UDF', count: 2 }])
  })

  it('windows expirations to the trailing 60 days of the injected day', () => {
    const counts = qualFindingCountsOf(
      [
        q(1, 'GTM2', 'Expired', '2026-08-29'), // yesterday: in window
        q(2, 'GTM2', 'Expired', '2026-07-01'), // 60 days back: in window
        q(3, 'GTM2', 'Expired', '2026-06-30'), // 61 days back: out
        q(4, 'GTM2', 'Expired', '2026-08-30'), // today: not yet expired-in-past
      ],
      AS_OF,
    )
    expect(counts.expiredQuals).toEqual([{ name: 'GTM2', count: 2 }])
  })

  it('counts expiring-30 from Active best rows only, deduped per member', () => {
    const counts = qualFindingCountsOf(
      [
        q(1, 'GTM1', 'Active', '2026-09-10'), // in 30
        q(1, 'GTM1', 'Training', null), // suppressed under Active
        q(2, 'GTM1', 'Active', '2026-10-15'), // beyond 30
        q(3, 'MS', 'Training', '2026-09-05'), // Training never counts here
        q(4, 'MS', 'Active', '2026-09-29'), // day 30: in window
      ],
      AS_OF,
    )
    expect(counts.qualsExpiring30).toBe(2)
    expect(counts.expiredQuals).toEqual([])
  })
})

// The active-window predicate runs against a day string injected once per
// request from app-local time (api/util.ts isoDate), never the database's
// CURRENT_DATE, so a UTC database session cannot shift the boundary.
describe('announcementActiveOn: injected-day boundaries', () => {
  const window = { archived: false, startsAt: '2026-09-01', endsAt: '2026-09-30' }

  it('is inclusive on both ends of the window', () => {
    expect(announcementActiveOn(window, '2026-08-31')).toBe(false)
    expect(announcementActiveOn(window, '2026-09-01')).toBe(true)
    expect(announcementActiveOn(window, '2026-09-30')).toBe(true)
    expect(announcementActiveOn(window, '2026-10-01')).toBe(false)
  })

  it('treats null bounds as unbounded and archived as always inactive', () => {
    expect(announcementActiveOn({ archived: false, startsAt: null, endsAt: null }, '2026-01-01')).toBe(true)
    expect(announcementActiveOn({ archived: false, startsAt: null, endsAt: '2026-09-30' }, '2026-09-30')).toBe(true)
    expect(announcementActiveOn({ archived: false, startsAt: '2026-09-01', endsAt: null }, '2026-08-31')).toBe(false)
    expect(announcementActiveOn({ ...window, archived: true }, '2026-09-15')).toBe(false)
  })
})

function facts(partial: Partial<CadetStateFacts>): CadetStateFacts {
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

function factRow(
  f: CadetStateFacts,
  tigCompleteOn: string | null = null,
  hfzValidUntil: string | null = null,
): CadetFactRow {
  return { facts: f, tigCompleteOn, hfzValidUntil }
}

describe('cadetFindingCountsOf: cadet-fact findings in one pass', () => {
  it('counts READY cadets and TIME_PENDING cadets eligible within 14 days', () => {
    const rows: CadetFactRow[] = [
      factRow(facts({ reqsReady: true, tigEligibleOn: '2026-08-01' })), // READY
      factRow(facts({ reqsReady: true, tigEligibleOn: '2026-09-10' })), // 11 days out
      factRow(facts({ reqsReady: true, tigEligibleOn: '2026-10-15' })), // too far
      factRow(facts({ reqsReady: false, tigEligibleOn: '2026-09-01' })), // not reqs-ready
    ]
    const counts = cadetFindingCountsOf(rows, AS_OF)
    expect(counts.cadetsReady).toBe(1)
    expect(counts.tigWithin14).toBe(1)
  })

  it('flags the HFZ-before-TIG collision only when the TIG date is still ahead', () => {
    const rows: CadetFactRow[] = [
      // Window closes 15 Sep, time in grade completes 1 Oct: collision.
      factRow(facts({}), '2026-10-01', '2026-09-15'),
      // TIG already complete: no collision left to flag.
      factRow(facts({}), '2026-08-01', '2026-07-01'),
      // Window outlives the TIG date: healthy.
      factRow(facts({}), '2026-10-01', '2026-12-01'),
      // No HFZ window recorded: nothing to compare.
      factRow(facts({}), '2026-10-01', null),
    ]
    expect(cadetFindingCountsOf(rows, AS_OF).hfzBeforeTig).toBe(1)
  })

  it('degrades a lapsed HFZ window out of READY at read time', () => {
    const rows: CadetFactRow[] = [
      factRow(
        facts({
          reqsReady: true,
          tigEligibleOn: '2026-08-01',
          hfzCounted: true,
          hfzValidUntil: '2026-08-15', // lapsed before asOf
          hardDone: 3,
          controllableDone: 5,
        }),
      ),
    ]
    expect(cadetFindingCountsOf(rows, AS_OF).cadetsReady).toBe(0)
  })
})

describe('meetingLineOf: the masthead meeting line', () => {
  it('composes day, time, and description', () => {
    expect(
      meetingLineOf([
        {
          meetDay: 'Thursday',
          meetTime: '18:30',
          descr: 'Riverside Armory',
          activityDate: null,
        },
      ]),
    ).toBe('Meets Thursdays 18:30, Riverside Armory')
  })

  it('normalizes shouting caps and already-plural days', () => {
    expect(
      meetingLineOf([{ meetDay: 'THURSDAY', meetTime: '', descr: null, activityDate: null }]),
    ).toBe('Meets Thursdays')
    expect(
      meetingLineOf([{ meetDay: 'Tuesdays', meetTime: '19:00', descr: null, activityDate: null }]),
    ).toBe('Meets Tuesdays 19:00')
  })

  it('handles time-only rows and returns null when nothing is recorded', () => {
    expect(
      meetingLineOf([{ meetDay: null, meetTime: '19:00', descr: null, activityDate: null }]),
    ).toBe('Meets at 19:00')
    expect(meetingLineOf([])).toBeNull()
    expect(
      meetingLineOf([{ meetDay: '', meetTime: '', descr: 'note', activityDate: null }]),
    ).toBeNull()
  })

  it('prefers the recurring row over one-off activity rows', () => {
    expect(
      meetingLineOf([
        { meetDay: 'Saturday', meetTime: '09:00', descr: 'SAREX', activityDate: '2026-09-12' },
        { meetDay: 'Thursday', meetTime: '18:30', descr: null, activityDate: null },
      ]),
    ).toBe('Meets Thursdays 18:30')
  })
})

function monthEntry(dateIso: string, combinedTotal: number): Jsonified<MonthlyEntry> {
  const bucket = { total: 0, new: 0, renew: 0, rejoin: 0 }
  return {
    date: dateIso,
    label: dateIso.slice(0, 7),
    senior: { ...bucket },
    cadet: { ...bucket },
    cadetSponsor: { ...bucket },
    patron: { ...bucket },
    combined: { ...bucket, total: combinedTotal },
    all: { ...bucket, total: combinedTotal },
  }
}

function orgStatsWith(
  months: Jsonified<MonthlyEntry>[],
  currentTotal: number,
  yearAgoTotal: number | null,
): Jsonified<UnitOrgStatsMetrics> {
  return {
    monthlyData: months,
    metrics: {
      recruiting: null,
      retention: null,
      growth: null,
      seasonality: null,
      volatility: null,
      sustainability: null,
    },
    summary: { currentTotal, yearAgoTotal, dataPointCount: months.length, memberBreakdown: null },
  }
}

describe('strength series and delta for the figure strip', () => {
  it('maps the last 12 months to sparkline points, oldest first', () => {
    const months = Array.from({ length: 14 }, (_, i) =>
      monthEntry(`2025-${String(((i + 6) % 12) + 1).padStart(2, '0')}-01T00:00:00.000Z`, 50 + i),
    )
    const series = strengthSeriesOf(orgStatsWith(months, 63, 50))
    expect(series).toHaveLength(12)
    expect(series[0]?.total).toBe(52)
    expect(series[11]?.total).toBe(63)
    expect(series[0]?.month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('computes the 12-month delta and degrades to null without history', () => {
    expect(strengthDeltaOf(orgStatsWith([], 64, 59))).toBe(5)
    expect(strengthDeltaOf(orgStatsWith([], 64, null))).toBeNull()
    expect(strengthDeltaOf(null)).toBeNull()
    expect(strengthSeriesOf(null)).toEqual([])
  })
})

// Announcement input validation lives here with the rest of the core-redesign
// server coverage: the schemas are pure zod and need no database.
describe('announcement validation (fixed schema, plain text body)', () => {
  const valid = { title: '  Maintenance window  ', body: 'Saturday 06:00 to 07:00.\nBrief outage.' }

  it('accepts a minimal announcement and trims the title', () => {
    const parsed = announcementCreateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.title).toBe('Maintenance window')
      expect(parsed.data.startsAt).toBeUndefined()
    }
  })

  it('accepts explicit null dates and a well-ordered window', () => {
    expect(
      announcementCreateSchema.safeParse({ ...valid, startsAt: null, endsAt: null }).success,
    ).toBe(true)
    expect(
      announcementCreateSchema.safeParse({
        ...valid,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      }).success,
    ).toBe(true)
  })

  it('rejects over-length, empty, and misordered input', () => {
    expect(
      announcementCreateSchema.safeParse({ ...valid, title: 'x'.repeat(121) }).success,
    ).toBe(false)
    expect(
      announcementCreateSchema.safeParse({ ...valid, body: 'x'.repeat(2001) }).success,
    ).toBe(false)
    expect(announcementCreateSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false)
    expect(
      announcementCreateSchema.safeParse({
        ...valid,
        startsAt: '2026-09-30',
        endsAt: '2026-09-01',
      }).success,
    ).toBe(false)
    expect(
      announcementCreateSchema.safeParse({ ...valid, startsAt: 'Sept 1' }).success,
    ).toBe(false)
  })

  it('is strict: unknown keys are rejected, archived only exists on update', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, html: '<b>' }).success).toBe(false)
    expect(announcementCreateSchema.safeParse({ ...valid, archived: true }).success).toBe(false)
    const updated = announcementUpdateSchema.safeParse({ ...valid, archived: true })
    expect(updated.success).toBe(true)
    if (updated.success) expect(updated.data.archived).toBe(true)
  })
})
