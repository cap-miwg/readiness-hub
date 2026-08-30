import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ROW_CAP } from '../src/shared/logisticsContracts.js'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  buildEquipmentSection,
  buildLogistics,
  buildVehicleRows,
  buildVehicleSummary,
  equipmentFactOf,
  monthKeyBack,
  monthKeyOf,
  parseNumericText,
} = await import('../src/api/logistics.js')

import type { EquipmentFact } from '../src/api/logistics.js'

const ASOF = new Date('2026-08-30T12:00:00Z')

function vehicle(capId: string, roadable: boolean | null, odometer: string | null = null) {
  return { capId, make: 'FORD', year: '2019', type: 'VAN', roadable, odometer }
}

function equipmentFact(overrides: Partial<EquipmentFact> = {}): EquipmentFact {
  return {
    assetCode: 'A-1',
    noun: 'RADIO',
    make: null,
    model: null,
    inService: null,
    status: 'IN USE',
    issuedOn: null,
    issued: false,
    ...overrides,
  }
}

describe('parseNumericText: defensive signed decimal parse', () => {
  it('strips separators and unit suffixes', () => {
    expect(parseNumericText('83,201')).toBe(83201)
    expect(parseNumericText('12345 mi')).toBe(12345)
    expect(parseNumericText(' 42 ')).toBe(42)
  })

  it('parses sign and decimals (ORMS correction rows are negative)', () => {
    expect(parseNumericText('-207')).toBe(-207)
    expect(parseNumericText('-1,234 mi')).toBe(-1234)
    expect(parseNumericText('12.5')).toBe(12.5)
    expect(parseNumericText('1,234.5')).toBe(1234.5)
  })

  it('returns null when nothing parseable remains', () => {
    expect(parseNumericText('N/A')).toBeNull()
    expect(parseNumericText('')).toBeNull()
    expect(parseNumericText(null)).toBeNull()
    expect(parseNumericText(undefined)).toBeNull()
  })

  it('returns null on unsafe-integer overflow', () => {
    expect(parseNumericText('99999999999999999999')).toBeNull()
  })
})

describe('month keys for the monthly usage summaries', () => {
  it('keys a usage date to its calendar month', () => {
    expect(monthKeyOf('2026-08-01')).toBe('2026-08')
    expect(monthKeyOf(null)).toBeNull()
  })

  it('walks calendar months back across a year boundary', () => {
    expect(monthKeyBack(new Date(2026, 7, 30), 0)).toBe('2026-08')
    expect(monthKeyBack(new Date(2026, 7, 30), 2)).toBe('2026-06')
    expect(monthKeyBack(new Date(2026, 0, 15), 2)).toBe('2025-11')
  })
})

describe('buildVehicleRows', () => {
  it('sorts not-roadable vehicles first, then by vehicle number', () => {
    const rows = buildVehicleRows(
      [vehicle('30', true), vehicle('9', false), vehicle('2', true), vehicle('10', false)],
      [],
      [],
      ASOF,
    )
    expect(rows.map(r => r.capId)).toEqual(['9', '10', '2', '30'])
    expect(rows.map(r => r.roadable)).toEqual([false, false, true, true])
  })

  it('keeps roadable-unknown vehicles out of the down group', () => {
    const rows = buildVehicleRows([vehicle('1', null), vehicle('2', false)], [], [], ASOF)
    expect(rows.map(r => r.capId)).toEqual(['2', '1'])
  })

  it('sums miles90 from parseable usage inside the 90-day window only', () => {
    const rows = buildVehicleRows(
      [vehicle('7', true)],
      [
        { capId: '7', usageDate: '2026-08-01', totalMiles: '1,200' }, // in window
        { capId: '7', usageDate: '2026-07-01', totalMiles: '300 mi' }, // in window
        { capId: '7', usageDate: '2026-08-01', totalMiles: 'N/A' }, // unparseable: skipped
        { capId: '7', usageDate: '2026-05-01', totalMiles: '9999' }, // older than 90d
        { capId: '7', usageDate: null, totalMiles: '50' }, // undated: skipped
      ],
      [],
      ASOF,
    )
    expect(rows[0]?.miles90).toBe(1500)
  })

  it('nets negative correction rows and clamps the miles90 sum at zero', () => {
    const rows = buildVehicleRows(
      [vehicle('7', true), vehicle('8', true)],
      [
        { capId: '7', usageDate: '2026-08-01', totalMiles: '500' },
        { capId: '7', usageDate: '2026-07-01', totalMiles: '-207' }, // correction
        // Vehicle 8: the correction outweighs the usage; clamp, never negative.
        { capId: '8', usageDate: '2026-08-01', totalMiles: '100' },
        { capId: '8', usageDate: '2026-07-01', totalMiles: '-991' },
      ],
      [],
      ASOF,
    )
    expect(rows.find(r => r.capId === '7')?.miles90).toBe(293)
    expect(rows.find(r => r.capId === '8')?.miles90).toBe(0)
  })

  it('serves lastUsedOn as the usage MONTH and joins maintenance dates', () => {
    const rows = buildVehicleRows(
      [vehicle('7', true, '83,201 mi'), vehicle('8', true, 'unknown')],
      [
        // Monthly summary rows, dated the 1st; the latest month wins.
        { capId: '7', usageDate: '2026-08-01', totalMiles: '10' },
        { capId: '7', usageDate: '2026-06-01', totalMiles: '10' },
      ],
      [
        { capId: '7', maintDate: '2026-03-04' },
        { capId: '7', maintDate: '2026-07-01' },
      ],
      ASOF,
    )
    expect(rows[0]?.odometer).toBe(83201)
    expect(rows[0]?.lastUsedOn).toBe('2026-08')
    expect(rows[0]?.lastMaintOn).toBe('2026-07-01')
    expect(rows[1]?.odometer).toBeNull()
    expect(rows[1]?.lastUsedOn).toBeNull()
    expect(rows[1]?.lastMaintOn).toBeNull()
    expect(rows[1]?.miles90).toBe(0)
  })
})

describe('buildVehicleSummary', () => {
  it('treats a usage row as covering its whole month for the idle count', () => {
    const rows = buildVehicleRows(
      [vehicle('1', true), vehicle('2', false), vehicle('3', true), vehicle('4', null)],
      [
        // asOf is 2026-08-30: months 2026-06..2026-08 count as used.
        { capId: '1', usageDate: '2026-06-01', totalMiles: '10' }, // in the 3-month band
        { capId: '3', usageDate: '2026-05-01', totalMiles: '10' }, // one month too old
        // '2' and '4' have no usage at all: idle.
      ],
      [],
      ASOF,
    )
    expect(buildVehicleSummary(rows, ASOF)).toEqual({
      total: 4,
      roadable: 2,
      downCount: 1,
      unusedIn60d: 3,
    })
  })

  it('counts a current-month usage row as used even on day one of the month', () => {
    const rows = buildVehicleRows(
      [vehicle('1', true)],
      [{ capId: '1', usageDate: '2026-08-01', totalMiles: '5' }],
      [],
      new Date(2026, 7, 1),
    )
    expect(buildVehicleSummary(rows, new Date(2026, 7, 1)).unusedIn60d).toBe(0)
  })
})

describe('equipmentFactOf: the issued flag without the CAPID', () => {
  const dbRow = {
    assetcd: 'A-1',
    noun: 'RADIO',
    make: null,
    model: null,
    inserv: null,
    status: 'Issued',
    issued_date: null,
  }

  it('treats issued_capid = 0 (the ORMS unissued sentinel) as not issued', () => {
    expect(equipmentFactOf({ ...dbRow, issued_capid: 0 }).issued).toBe(false)
    expect(equipmentFactOf({ ...dbRow, issued_capid: null }).issued).toBe(false)
    expect(equipmentFactOf({ ...dbRow, issued_capid: 123456 }).issued).toBe(true)
  })

  it('never carries the CAPID out of the mapper', () => {
    const fact = equipmentFactOf({ ...dbRow, issued_capid: 123456 })
    expect(fact).not.toHaveProperty('issuedCapid')
    expect(fact).not.toHaveProperty('issued_capid')
  })
})

describe('buildEquipmentSection', () => {
  it('caps the served list while the summary covers every row', () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      equipmentFact({
        assetCode: `A-${i}`,
        status: i % 5 === 0 ? 'IN REPAIR' : 'IN USE',
        issued: i % 2 === 0,
      }),
    )
    const { equipment, equipmentSummary } = buildEquipmentSection(rows)
    expect(equipment).toHaveLength(EQUIPMENT_ROW_CAP)
    expect(equipmentSummary.total).toBe(250)
    expect(equipmentSummary.issuedCount).toBe(125)
    expect(equipmentSummary.byStatus).toEqual([
      { status: 'IN USE', count: 200 },
      { status: 'IN REPAIR', count: 50 },
    ])
  })

  it('counts only real (> 0) CAPIDs as issued via the mapper', () => {
    const dbRow = {
      assetcd: 'A-1',
      noun: 'RADIO',
      make: null,
      model: null,
      inserv: null,
      status: 'Issued',
      issued_date: null,
    }
    const { equipmentSummary } = buildEquipmentSection([
      equipmentFactOf({ ...dbRow, issued_capid: 0 }),
      equipmentFactOf({ ...dbRow, issued_capid: 0 }),
      equipmentFactOf({ ...dbRow, issued_capid: 507610 }),
    ])
    expect(equipmentSummary.total).toBe(3)
    expect(equipmentSummary.issuedCount).toBe(1)
  })

  it('serves no member identifiers on any equipment row', () => {
    const { equipment } = buildEquipmentSection([
      equipmentFact({ issued: true, issuedOn: '2026-07-29' }),
    ])
    expect(equipment).toHaveLength(1)
    const row = equipment[0] as Record<string, unknown>
    expect(row).not.toHaveProperty('issuedCapid')
    expect(row).not.toHaveProperty('issued')
    expect(row['issuedOn']).toBe('2026-07-29')
  })

  it('groups blank statuses under the empty string and sorts ties by status', () => {
    const rows = [
      equipmentFact({ status: null }),
      equipmentFact({ status: '  ' }),
      equipmentFact({ status: 'STORED' }),
      equipmentFact({ status: 'ISSUED' }),
    ]
    const { equipmentSummary } = buildEquipmentSection(rows)
    expect(equipmentSummary.byStatus).toEqual([
      { status: '', count: 2 },
      { status: 'ISSUED', count: 1 },
      { status: 'STORED', count: 1 },
    ])
  })
})

describe('buildLogistics', () => {
  const EMPTY = { vehicles: [], usage: [], maintenance: [], equipment: [], property: [] }

  it('reports recorded=false with empty sections when the scope tracks nothing', () => {
    const body = buildLogistics(
      { ...EMPTY, property: [{ propCode: 'P1', propType: 'LAND', city: 'MONROE', state: 'MI' }] },
      ASOF,
    )
    // Property alone does not flip recorded (fleet/asset tracking verdict).
    expect(body.recorded).toBe(false)
    expect(body.vehicles).toEqual([])
    expect(body.vehicleSummary).toEqual({ total: 0, roadable: 0, downCount: 0, unusedIn60d: 0 })
    expect(body.equipment).toEqual([])
    expect(body.equipmentSummary).toEqual({ total: 0, byStatus: [], issuedCount: 0 })
    expect(body.property).toHaveLength(1)
  })

  it('reports recorded=true when vehicles exist', () => {
    const body = buildLogistics({ ...EMPTY, vehicles: [vehicle('1', true)] }, ASOF)
    expect(body.recorded).toBe(true)
    expect(body.vehicleSummary.total).toBe(1)
  })

  it('reports recorded=true when only equipment exists', () => {
    const body = buildLogistics({ ...EMPTY, equipment: [equipmentFact()] }, ASOF)
    expect(body.recorded).toBe(true)
    expect(body.equipmentSummary.total).toBe(1)
  })
})
