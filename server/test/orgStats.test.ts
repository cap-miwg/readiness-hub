import { describe, expect, it } from 'vitest'
import {
  aggregateByMonth,
  entryMonthsBefore,
  getMetricsForUnit,
  monthIndexOf,
} from '../src/domain/orgStats.js'
import type { Dataset, OrgStatisticRow } from '../src/domain/dataset.js'

const ASOF = new Date(2026, 7, 30)

function totalsRow(orgid: number, cntDate: Date, mbrType: string, quantity: number): OrgStatisticRow {
  return { orgid, region: 'GLR', wing: 'MI', unit: '063', mbrType, cntType: 'TOTAL', quantity, cntDate }
}

/** getMetricsForUnit reads only orgStatistics off the dataset. */
function datasetWith(rows: OrgStatisticRow[]): Dataset {
  return { orgStatistics: rows } as unknown as Dataset
}

describe('monthIndexOf: calendar-month arithmetic across date conventions', () => {
  it('preserves the intended month for UTC-midnight and local-midnight dates', () => {
    // Parse-layer convention: UTC midnight.
    expect(monthIndexOf(new Date('2026-07-31T00:00:00.000Z'))).toBe(2026 * 12 + 6)
    // pg date-column convention: local midnight.
    expect(monthIndexOf(new Date(2026, 6, 31))).toBe(2026 * 12 + 6)
    // Exactly 12 apart across a year.
    expect(
      monthIndexOf(new Date(2026, 6, 31)) - monthIndexOf(new Date(2025, 6, 31)),
    ).toBe(12)
  })
})

describe('entryMonthsBefore: month-key selection, never array position', () => {
  it('finds the calendar month exactly N before the latest data month', () => {
    // 15 contiguous months ending Jul 2026 (mirrors the live Monroe series):
    // entry [length-12] would be Aug 2025, one month late.
    const months = Array.from({ length: 15 }, (_, i) =>
      totalsRow(490, new Date(2025, 4 + i, 28), 'SENIOR', 100 + i),
    )
    const monthly = aggregateByMonth(months)
    const yearAgo = entryMonthsBefore(monthly, 12)
    expect(yearAgo?.date.getMonth()).toBe(6) // July
    expect(yearAgo?.date.getFullYear()).toBe(2025)
  })

  it('returns undefined when that exact month is absent (gap or short series)', () => {
    const monthly = aggregateByMonth([
      totalsRow(490, new Date(2026, 6, 31), 'SENIOR', 28),
      totalsRow(490, new Date(2026, 5, 30), 'SENIOR', 30),
    ])
    expect(entryMonthsBefore(monthly, 12)).toBeUndefined()
    expect(entryMonthsBefore([], 12)).toBeUndefined()
  })
})

describe('getMetricsForUnit summary: the 12-month strength delta alignment', () => {
  it('compares the latest data month against the same calendar month last year', () => {
    // Monroe-shaped fixture: Jul 2025 = 29, Aug 2025 = 28, ..., Jul 2026 = 28.
    // The off-by-one picked Aug 2025 (28) and reported a delta of 0; the
    // calendar-aligned pick is Jul 2025 (29), delta -1.
    const byMonth: [number, number, number][] = [
      [2025, 6, 29],
      [2025, 7, 28],
      [2025, 8, 29],
      [2025, 9, 30],
      [2025, 10, 29],
      [2025, 11, 28],
      [2026, 0, 28],
      [2026, 1, 28],
      [2026, 2, 29],
      [2026, 3, 31],
      [2026, 4, 30],
      [2026, 5, 30],
      [2026, 6, 28],
    ]
    const rows = byMonth.map(([y, m, total]) =>
      totalsRow(490, new Date(y, m, 28), 'SENIOR', total),
    )
    const metrics = getMetricsForUnit(datasetWith(rows), new Set([490]), {}, ASOF)
    expect(metrics?.summary.currentTotal).toBe(28)
    expect(metrics?.summary.yearAgoTotal).toBe(29)
  })

  it('reports yearAgoTotal null when the year-ago month is missing', () => {
    // Eleven months of history only: no Jul 2025 entry exists.
    const rows = Array.from({ length: 11 }, (_, i) =>
      totalsRow(490, new Date(2025, 9 + i, 28), 'SENIOR', 30),
    )
    const metrics = getMetricsForUnit(datasetWith(rows), new Set([490]), {}, ASOF)
    expect(metrics?.summary.yearAgoTotal).toBeNull()
  })
})
