import { describe, expect, it } from 'vitest'
import type { EquipmentRow } from '../src/shared/logisticsContracts.js'
import { EQUIPMENT_ROW_CAP } from '../src/shared/logisticsContracts.js'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  buildEquipmentSection,
  buildLogistics,
  buildVehicleRows,
  buildVehicleSummary,
  parseNumericText,
} = await import('../src/api/logistics.js')

const ASOF = new Date('2026-08-30T12:00:00Z')

function vehicle(capId: string, roadable: boolean | null, odometer: string | null = null) {
  return { capId, make: 'FORD', year: '2019', type: 'VAN', roadable, odometer }
}

function equipmentRow(overrides: Partial<EquipmentRow> = {}): EquipmentRow {
  return {
    assetCode: 'A-1',
    noun: 'RADIO',
    make: null,
    model: null,
    inService: null,
    status: 'IN USE',
    issuedCapid: null,
    issuedOn: null,
    ...overrides,
  }
}

describe('parseNumericText: defensive digits-only parse', () => {
  it('strips separators and unit suffixes', () => {
    expect(parseNumericText('83,201')).toBe(83201)
    expect(parseNumericText('12345 mi')).toBe(12345)
    expect(parseNumericText(' 42 ')).toBe(42)
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
        { capId: '7', usageDate: '2026-07-15', totalMiles: '300 mi' }, // in window
        { capId: '7', usageDate: '2026-08-20', totalMiles: 'N/A' }, // unparseable: skipped
        { capId: '7', usageDate: '2026-05-01', totalMiles: '9999' }, // older than 90d
        { capId: '7', usageDate: null, totalMiles: '50' }, // undated: skipped
      ],
      [],
      ASOF,
    )
    expect(rows[0]?.miles90).toBe(1500)
  })

  it('parses the odometer defensively and joins last-used/last-maintained dates', () => {
    const rows = buildVehicleRows(
      [vehicle('7', true, '83,201 mi'), vehicle('8', true, 'unknown')],
      [
        { capId: '7', usageDate: '2026-08-01', totalMiles: '10' },
        { capId: '7', usageDate: '2026-08-15', totalMiles: '10' },
        { capId: '7', usageDate: '2026-06-02', totalMiles: '10' },
      ],
      [
        { capId: '7', maintDate: '2026-03-04' },
        { capId: '7', maintDate: '2026-07-01' },
      ],
      ASOF,
    )
    expect(rows[0]?.odometer).toBe(83201)
    expect(rows[0]?.lastUsedOn).toBe('2026-08-15')
    expect(rows[0]?.lastMaintOn).toBe('2026-07-01')
    expect(rows[1]?.odometer).toBeNull()
    expect(rows[1]?.lastUsedOn).toBeNull()
    expect(rows[1]?.lastMaintOn).toBeNull()
    expect(rows[1]?.miles90).toBe(0)
  })
})

describe('buildVehicleSummary', () => {
  it('counts roadable, down, and 60-day-idle vehicles', () => {
    const rows = buildVehicleRows(
      [vehicle('1', true), vehicle('2', false), vehicle('3', true), vehicle('4', null)],
      [
        { capId: '1', usageDate: '2026-08-25', totalMiles: '10' }, // recent
        { capId: '3', usageDate: '2026-05-01', totalMiles: '10' }, // idle > 60d
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
})

describe('buildEquipmentSection', () => {
  it('caps the served list while the summary covers every row', () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      equipmentRow({
        assetCode: `A-${i}`,
        status: i % 5 === 0 ? 'IN REPAIR' : 'IN USE',
        issuedCapid: i % 2 === 0 ? 100000 + i : null,
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

  it('groups blank statuses under the empty string and sorts ties by status', () => {
    const rows = [
      equipmentRow({ status: null }),
      equipmentRow({ status: '  ' }),
      equipmentRow({ status: 'STORED' }),
      equipmentRow({ status: 'ISSUED' }),
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
    const body = buildLogistics({ ...EMPTY, equipment: [equipmentRow()] }, ASOF)
    expect(body.recorded).toBe(true)
    expect(body.equipmentSummary.total).toBe(1)
  })
})
