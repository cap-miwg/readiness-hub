import { describe, expect, it } from 'vitest'
import type { ReportData } from '../src/reports/types.js'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  buildMonthly,
  buildParticipation,
  buildQuiet,
  isQuietRow,
  monthKeysBack,
  participationWindows,
  quietCountsOf,
  quietMembersOf,
  rateOf,
} = await import('../src/api/participation.js')

import type { QuietScanRow } from '../src/api/participation.js'
const { generateParticipationSummaryReport, generateQuietMembersReport } = await import(
  '../src/reports/generators.js'
)
const { emptyReportData } = await import('../src/reports/types.js')

const ASOF = new Date(2026, 7, 30)

describe('participation window math', () => {
  it('produces 12 trailing month keys, oldest first, ending at asOf', () => {
    const keys = monthKeysBack(ASOF, 12)
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('2025-09')
    expect(keys[11]).toBe('2026-08')
    expect(keys).toContain('2026-01')
  })

  it('anchors the 12-month window to the first day of the oldest month', () => {
    const w = participationWindows(ASOF)
    expect(w.monthsStart.getFullYear()).toBe(2025)
    expect(w.monthsStart.getMonth()).toBe(8)
    expect(w.monthsStart.getDate()).toBe(1)
  })

  it('computes present/rows rates and refuses to divide by zero', () => {
    expect(rateOf(30, 40)).toBe(0.75)
    expect(rateOf(1, 3)).toBe(0.333)
    expect(rateOf(0, 10)).toBe(0)
    expect(rateOf(0, 0)).toBeNull()
    expect(rateOf(5, 0)).toBeNull()
  })
})

describe('monthly rate math from synthetic aggregate rows', () => {
  const keys = monthKeysBack(ASOF, 12)
  const agg = [
    { month: '2026-08', meetings: 3, attendeeRows: 40, presentRows: 30 },
    { month: '2026-07', meetings: 2, attendeeRows: 20, presentRows: 20 },
    // A future-dated data-entry error lands outside the key set and is dropped.
    { month: '2027-01', meetings: 1, attendeeRows: 5, presentRows: 5 },
  ]
  const guests = [{ month: '2026-08', guests: 5 }]

  it('merges meetings, rates, and guests into the trailing month series', () => {
    const monthly = buildMonthly(keys, agg, guests)
    expect(monthly).toHaveLength(12)
    const aug = monthly[11]
    expect(aug).toEqual({ month: '2026-08', meetings: 3, avgAttendanceRate: 0.75, guests: 5 })
    const jul = monthly[10]
    expect(jul).toEqual({ month: '2026-07', meetings: 2, avgAttendanceRate: 1, guests: 0 })
    expect(monthly.map(m => m.month)).not.toContain('2027-01')
  })

  it('renders months without data as zero meetings with a null rate', () => {
    const monthly = buildMonthly(keys, agg, guests)
    const jan = monthly.find(m => m.month === '2026-01')
    expect(jan).toEqual({ month: '2026-01', meetings: 0, avgAttendanceRate: null, guests: 0 })
  })
})

// d60 for ASOF (2026-08-30) is 2026-07-01 (participationWindows).
const D60 = participationWindows(ASOF).d60

function scanRow(over: Partial<QuietScanRow> = {}): QuietScanRow {
  return {
    capid: 11,
    fullName: 'C/Amn Quiet, Q',
    orgid: 200,
    joined: '2024-01-15',
    unitLastMeetingOn: '2026-08-20',
    lastPresentOn: null,
    present60: 0,
    excused60: 0,
    rows90: 0,
    present90: 0,
    ...over,
  }
}

describe('isQuietRow: the 60-day quiet rule', () => {
  it('marks quiet only when the unit logged inside the window', () => {
    expect(isQuietRow(scanRow(), D60)).toBe(true)
    // The unit logged in the 12-month span but stopped before the window:
    // its roster must not flood the quiet count.
    expect(isQuietRow(scanRow({ unitLastMeetingOn: '2026-05-12' }), D60)).toBe(false)
    expect(isQuietRow(scanRow({ unitLastMeetingOn: null }), D60)).toBe(false)
    // Boundary: a meeting exactly on the window start counts as in-window.
    expect(isQuietRow(scanRow({ unitLastMeetingOn: '2026-07-01' }), D60)).toBe(true)
  })

  it('counts EXCUSED at an in-window meeting as engaged', () => {
    expect(isQuietRow(scanRow({ excused60: 1 }), D60)).toBe(false)
    expect(isQuietRow(scanRow({ present60: 1 }), D60)).toBe(false)
    expect(isQuietRow(scanRow({ present60: 0, excused60: 0 }), D60)).toBe(true)
  })

  it('excludes members who joined inside the window', () => {
    expect(isQuietRow(scanRow({ joined: '2026-08-10' }), D60)).toBe(false)
    // Boundary: joined exactly on the window start is inside it.
    expect(isQuietRow(scanRow({ joined: '2026-07-01' }), D60)).toBe(false)
    expect(isQuietRow(scanRow({ joined: '2026-06-30' }), D60)).toBe(true)
    // No joined date on record: cannot be excluded on that basis.
    expect(isQuietRow(scanRow({ joined: null }), D60)).toBe(true)
  })
})

describe('quietCountsOf and quietMembersOf over scan rows', () => {
  const rows: QuietScanRow[] = [
    scanRow({ capid: 1, orgid: 200 }), // quiet
    scanRow({ capid: 2, orgid: 200, excused60: 2 }), // engaged by excusal
    scanRow({ capid: 3, orgid: 200, joined: '2026-08-01' }), // recent joiner
    scanRow({ capid: 4, orgid: 300, unitLastMeetingOn: '2026-04-01' }), // stale unit
    scanRow({
      capid: 5,
      orgid: 200,
      fullName: 'SM Older, O',
      lastPresentOn: new Date(2026, 4, 12),
      rows90: 4,
      present90: 1,
    }), // quiet, with history
  ]

  it('counts per unit with all three rules applied', () => {
    expect(quietCountsOf(rows, D60)).toEqual([{ orgid: 200, quietCount: 2 }])
  })

  it('names the quiet members, never-present first', () => {
    const named = quietMembersOf(rows, D60)
    expect(named.map(r => r.capid)).toEqual([1, 5])
    expect(named[1]).toMatchObject({ fullName: 'SM Older, O', rows90: 4, present90: 1 })
  })
})

describe('quiet-member payload gating (D9)', () => {
  it('carries names only when the named slice was loaded (single-unit scope)', () => {
    const quiet = buildQuiet(
      [],
      [
        {
          capid: 11,
          fullName: 'C/Amn Quiet, Q',
          orgid: 200,
          lastPresentOn: new Date(2026, 5, 15),
          rows90: 2,
          present90: 0,
        },
      ],
    )
    expect(quiet.count).toBe(1)
    expect(quiet.members).toEqual([
      { capid: 11, fullName: 'C/Amn Quiet, Q', lastPresentOn: '2026-06-15' },
    ])
  })

  it('sums per-unit counts and omits the members key above single-unit scope', () => {
    const quiet = buildQuiet(
      [
        { orgid: 200, quietCount: 3 },
        { orgid: 300, quietCount: 2 },
      ],
      null,
    )
    expect(quiet).toEqual({ count: 5 })
    expect(quiet).not.toHaveProperty('members')
  })
})

describe('buildParticipation', () => {
  it('reports recorded=false with a neutral all-zero body when nothing is logged', () => {
    const body = buildParticipation(ASOF, {
      unitAggs: [],
      monthlyAgg: [],
      monthlyGuests: [],
      quietCounts: [],
      quietNamed: null,
    })
    expect(body.recorded).toBe(false)
    expect(body.monthly).toHaveLength(12)
    for (const m of body.monthly) {
      expect(m.meetings).toBe(0)
      expect(m.avgAttendanceRate).toBeNull()
      expect(m.guests).toBe(0)
    }
    expect(body.last90).toEqual({ meetings: 0, avgRate: null, guests: 0 })
    expect(body.quietMembers).toEqual({ count: 0 })
    expect(body.quietMembers).not.toHaveProperty('members')
  })

  it('sums the 90-day window across the logging units in scope', () => {
    const body = buildParticipation(ASOF, {
      unitAggs: [
        { orgid: 200, meetings90: 4, attendeeRows90: 40, presentRows90: 30, guests90: 2 },
        { orgid: 300, meetings90: 2, attendeeRows90: 10, presentRows90: 5, guests90: 1 },
      ],
      monthlyAgg: [],
      monthlyGuests: [],
      quietCounts: [
        { orgid: 200, quietCount: 3 },
        { orgid: 300, quietCount: 1 },
      ],
      quietNamed: null,
    })
    expect(body.recorded).toBe(true)
    expect(body.last90).toEqual({ meetings: 6, avgRate: 0.7, guests: 3 })
    expect(body.quietMembers).toEqual({ count: 4 })
  })
})

// --- Report generators ---

const ORGS = new Map([
  [
    100,
    {
      orgid: 100,
      region: 'GLR',
      wing: 'MI',
      unit: '001',
      nextLevel: null,
      name: 'Michigan Wing',
      type: 'WING',
      scope: 'WING',
    },
  ],
  [
    200,
    {
      orgid: 200,
      region: 'GLR',
      wing: 'MI',
      unit: '205',
      nextLevel: 100,
      name: 'Test Composite Squadron',
      type: 'COMPOSITE SQUADRON',
      scope: 'UNIT',
    },
  ],
  [
    300,
    {
      orgid: 300,
      region: 'GLR',
      wing: 'MI',
      unit: '310',
      nextLevel: 100,
      name: 'Other Composite Squadron',
      type: 'COMPOSITE SQUADRON',
      scope: 'UNIT',
    },
  ],
])

function fixtureData(over: Partial<ReportData> = {}): ReportData {
  return emptyReportData({
    asOf: ASOF,
    orgid: 100,
    descendants: true,
    scopeOrgids: new Set([100, 200, 300]),
    orgs: ORGS,
    ...over,
  })
}

describe('participation summary report', () => {
  it('rates recorded units and renders the rest as the neutral Not recorded state', () => {
    const data = fixtureData({
      participation: {
        units: [
          {
            orgid: 200,
            meetings90: 6,
            attendeeRows90: 40,
            presentRows90: 30,
            guests90: 4,
            quietCount: 3,
          },
        ],
        quietMembers: null,
      },
    })
    const result = generateParticipationSummaryReport(data)
    expect(result.rows).toHaveLength(3)
    const first = result.rows[0] as Record<string, unknown>
    expect(first['unit']).toBe('GLR-MI-205')
    expect(first['status']).toBe('Recorded')
    expect(first['meetings']).toBe(6)
    expect(first['avgRate']).toBe(75)
    expect(first['guests']).toBe(4)
    expect(first['quiet']).toBe(3)
    for (const row of result.rows.slice(1) as Record<string, unknown>[]) {
      expect(row['status']).toBe('Not recorded')
      expect(row['meetings']).toBeNull()
      expect(row['avgRate']).toBeNull()
      expect(row['guests']).toBeNull()
      expect(row['quiet']).toBeNull()
    }
    expect(result.meta?.['unitsInScope']).toBe(3)
    expect(result.meta?.['unitsRecorded']).toBe(1)
    expect(result.meta?.['quietTotal']).toBe(3)
  })

  it('handles the nothing-recorded scope without inventing figures', () => {
    const result = generateParticipationSummaryReport(fixtureData())
    expect(result.rows).toHaveLength(3)
    for (const row of result.rows as Record<string, unknown>[]) {
      expect(row['status']).toBe('Not recorded')
      expect(row['avgRate']).toBeNull()
    }
    expect(result.meta?.['unitsRecorded']).toBe(0)
    expect(result.meta?.['meetings90']).toBe(0)
  })
})

describe('quiet members report name gating by scope (D9)', () => {
  it('names members only when the single-unit named slice is present', () => {
    const data = fixtureData({
      orgid: 200,
      descendants: false,
      scopeOrgids: new Set([200]),
      participation: {
        units: [
          {
            orgid: 200,
            meetings90: 6,
            attendeeRows90: 40,
            presentRows90: 30,
            guests90: 0,
            quietCount: 2,
          },
        ],
        quietMembers: [
          {
            capid: 12,
            fullName: 'SM Older, O',
            orgid: 200,
            lastPresentOn: new Date(2026, 4, 12),
            rows90: 4,
            present90: 1,
          },
          {
            capid: 11,
            fullName: 'C/Amn Quiet, Q',
            orgid: 200,
            lastPresentOn: null,
            rows90: 0,
            present90: 0,
          },
        ],
      },
    })
    const result = generateQuietMembersReport(data)
    expect(result.meta?.['view']).toBe('members')
    expect(result.rows).toHaveLength(2)
    // Never-present sorts first; the 61-90 day attendee keeps a real rate.
    const first = result.rows[0] as Record<string, unknown>
    expect(first['capid']).toBe(11)
    expect(first['name']).toBe('C/Amn Quiet, Q')
    expect(first['lastPresent']).toBeNull()
    expect(first['rate90']).toBeNull()
    const second = result.rows[1] as Record<string, unknown>
    expect(second['capid']).toBe(12)
    expect(second['lastPresent']).toBe('2026-05-12')
    expect(second['rate90']).toBe(25)
  })

  it('falls back to per-unit counts with no names anywhere at wider scope', () => {
    const data = fixtureData({
      participation: {
        units: [
          {
            orgid: 200,
            meetings90: 6,
            attendeeRows90: 40,
            presentRows90: 30,
            guests90: 0,
            quietCount: 3,
          },
        ],
        quietMembers: null,
      },
    })
    const result = generateQuietMembersReport(data)
    expect(result.meta?.['view']).toBe('unit-summary')
    expect(result.columns.map(c => c.key)).not.toContain('name')
    expect(result.rows).toHaveLength(3)
    const first = result.rows[0] as Record<string, unknown>
    expect(first['unit']).toBe('GLR-MI-205')
    expect(first['quiet']).toBe(3)
    for (const row of result.rows as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty('name')
      expect(row).not.toHaveProperty('capid')
    }
    expect(result.meta?.['quietTotal']).toBe(3)
  })
})
