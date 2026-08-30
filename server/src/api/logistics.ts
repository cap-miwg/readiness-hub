/**
 * Logistics read endpoints: vehicles, equipment, and property in org scope
 * (V2-DESIGN-PLAN.md D8, reversed by owner 2026-08-30). Read-only view; ORMS
 * remains the system of record. Serves facts only: findings-style verdicts
 * belong to the web layer. Assembly is pure (buildLogistics and friends) so
 * server/test/logistics.test.ts covers it without a database.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import {
  EQUIPMENT_ROW_CAP,
  type EquipmentRow,
  type EquipmentStatusCount,
  type EquipmentSummary,
  type LogisticsResponse,
  type PropertyRow,
  type VehicleRow,
  type VehicleSummary,
} from '../shared/logisticsContracts.js'
import { resolveOrgScope } from './orgs.js'
import { daysSince, isoDate, UNASSIGNED_ORGID } from './util.js'

/** Usage window feeding VehicleRow.miles90. */
const USAGE_MILES_WINDOW_DAYS = 90
/** Idle window feeding VehicleSummary.unusedIn60d. */
const UNUSED_WINDOW_DAYS = 60

// --- Pure assembly (unit-tested directly) ---

/**
 * Defensive numeric parse for CAPWATCH free-text figures (TotalMiles,
 * odometer): strip everything but digits; null when nothing parseable
 * remains or the digits overflow a safe integer.
 */
export function parseNumericText(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/[^0-9]/g, '')
  if (digits === '') return null
  const n = Number.parseInt(digits, 10)
  return Number.isSafeInteger(n) ? n : null
}

export interface VehicleFacts {
  /** CAP vehicle number, not a member CAPID. */
  capId: string
  make: string | null
  year: string | null
  type: string | null
  roadable: boolean | null
  odometer: string | null
}

export interface VehicleUsageFact {
  capId: string
  usageDate: Date | string | null
  totalMiles: string | null
}

export interface VehicleMaintFact {
  capId: string
  maintDate: Date | string | null
}

/** Later ISO date wins; null loses to anything. */
function maxIso(current: string | null, candidate: string | null): string | null {
  if (candidate === null) return current
  if (current === null || candidate > current) return candidate
  return current
}

/**
 * Vehicle rows with usage and maintenance joined by CAP vehicle number,
 * sorted not-roadable first (the down vehicle is the fact a transportation
 * officer opens the page for), then by vehicle number.
 */
export function buildVehicleRows(
  vehicles: readonly VehicleFacts[],
  usage: readonly VehicleUsageFact[],
  maintenance: readonly VehicleMaintFact[],
  asOf: Date,
): VehicleRow[] {
  const lastUsed = new Map<string, string | null>()
  const miles90 = new Map<string, number>()
  for (const u of usage) {
    const used = isoDate(u.usageDate)
    lastUsed.set(u.capId, maxIso(lastUsed.get(u.capId) ?? null, used))
    const age = daysSince(u.usageDate, asOf)
    if (age !== null && age >= 0 && age <= USAGE_MILES_WINDOW_DAYS) {
      const miles = parseNumericText(u.totalMiles)
      if (miles !== null) miles90.set(u.capId, (miles90.get(u.capId) ?? 0) + miles)
    }
  }
  const lastMaint = new Map<string, string | null>()
  for (const m of maintenance) {
    lastMaint.set(m.capId, maxIso(lastMaint.get(m.capId) ?? null, isoDate(m.maintDate)))
  }

  const rows: VehicleRow[] = vehicles.map(v => ({
    capId: v.capId,
    make: v.make,
    year: v.year,
    type: v.type,
    roadable: v.roadable,
    odometer: parseNumericText(v.odometer),
    lastUsedOn: lastUsed.get(v.capId) ?? null,
    lastMaintOn: lastMaint.get(v.capId) ?? null,
    miles90: miles90.get(v.capId) ?? 0,
  }))
  rows.sort((a, b) => {
    const aDown = a.roadable === false ? 0 : 1
    const bDown = b.roadable === false ? 0 : 1
    if (aDown !== bDown) return aDown - bDown
    return a.capId.localeCompare(b.capId, undefined, { numeric: true })
  })
  return rows
}

export function buildVehicleSummary(rows: readonly VehicleRow[], asOf: Date): VehicleSummary {
  let roadable = 0
  let downCount = 0
  let unusedIn60d = 0
  for (const row of rows) {
    if (row.roadable === true) roadable++
    if (row.roadable === false) downCount++
    const idle = daysSince(row.lastUsedOn, asOf)
    if (idle === null || idle > UNUSED_WINDOW_DAYS) unusedIn60d++
  }
  return { total: rows.length, roadable, downCount, unusedIn60d }
}

/**
 * Equipment section: the summary covers every row in scope; the served list
 * is capped at EQUIPMENT_ROW_CAP (big units carry thousands of assets).
 */
export function buildEquipmentSection(rows: readonly EquipmentRow[]): {
  equipment: EquipmentRow[]
  equipmentSummary: EquipmentSummary
} {
  const counts = new Map<string, number>()
  let issuedCount = 0
  for (const row of rows) {
    const status = (row.status ?? '').trim()
    counts.set(status, (counts.get(status) ?? 0) + 1)
    if (row.issuedCapid !== null) issuedCount++
  }
  const byStatus: EquipmentStatusCount[] = [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.status.localeCompare(b.status)))
  return {
    equipment: rows.slice(0, EQUIPMENT_ROW_CAP),
    equipmentSummary: { total: rows.length, byStatus, issuedCount },
  }
}

export interface LogisticsFacts {
  vehicles: VehicleFacts[]
  usage: VehicleUsageFact[]
  maintenance: VehicleMaintFact[]
  equipment: EquipmentRow[]
  property: PropertyRow[]
}

export function buildLogistics(
  facts: LogisticsFacts,
  asOf: Date,
): Omit<LogisticsResponse, 'orgid' | 'descendants'> {
  const vehicles = buildVehicleRows(facts.vehicles, facts.usage, facts.maintenance, asOf)
  const { equipment, equipmentSummary } = buildEquipmentSection(facts.equipment)
  return {
    // Property alone does not flip recorded: the NOT RECORDED verdict is about
    // whether the unit tracks its fleet/assets in eServices.
    recorded: vehicles.length > 0 || equipmentSummary.total > 0,
    vehicles,
    vehicleSummary: buildVehicleSummary(vehicles, asOf),
    equipment,
    equipmentSummary,
    property: facts.property,
  }
}

// --- Database rows and the handler ---

interface DbVehicleRow {
  cap_id: string | null
  make: string | null
  yr_mfgr: string | null
  veh_type: string | null
  roadable: boolean | null
  odometer: string | null
}

interface DbUsageRow {
  cap_id: string | null
  usage_date: Date | null
  total_miles: string | null
}

interface DbMaintRow {
  cap_id: string | null
  date_of_maint: Date | null
}

interface DbEquipmentRow {
  assetcd: string | null
  noun: string | null
  make: string | null
  model: string | null
  inserv: string | null
  status: string | null
  issued_capid: number | null
  issued_date: Date | null
}

interface DbPropertyRow {
  prop_code: string | null
  prop_type: string | null
  city: string | null
  state: string | null
}

async function handleLogistics(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = await resolveOrgScope(req, reply)
  if (ctx === null) return
  const asOf = new Date()
  const scopeOrgids = ctx.scopeOrgids.filter(id => id !== UNASSIGNED_ORGID)

  const [vehRes, eqRes, propRes] = await Promise.all([
    // Mirrors carry duplicate rows; one row per CAP vehicle number, first wins.
    pool.query<DbVehicleRow>(
      `SELECT DISTINCT ON (cap_id) cap_id, make, yr_mfgr, veh_type, roadable, odometer
       FROM vehicles WHERE orgid = ANY($1::int[]) ORDER BY cap_id`,
      [scopeOrgids],
    ),
    pool.query<DbEquipmentRow>(
      `SELECT assetcd, noun, make, model, inserv, status, issued_capid, issued_date
       FROM equipment WHERE orgid = ANY($1::int[]) ORDER BY noun, assetcd`,
      [scopeOrgids],
    ),
    pool.query<DbPropertyRow>(
      `SELECT prop_code, prop_type, city, state
       FROM property WHERE orgid = ANY($1::int[]) ORDER BY prop_type, prop_code`,
      [scopeOrgids],
    ),
  ])

  const capIds = vehRes.rows.flatMap(r => (r.cap_id !== null && r.cap_id !== '' ? [r.cap_id] : []))
  const [usageRes, maintRes] =
    capIds.length > 0
      ? await Promise.all([
          pool.query<DbUsageRow>(
            'SELECT cap_id, usage_date, total_miles FROM vehicles_usage WHERE cap_id = ANY($1::text[])',
            [capIds],
          ),
          pool.query<DbMaintRow>(
            'SELECT cap_id, date_of_maint FROM vehicles_maintenance WHERE cap_id = ANY($1::text[])',
            [capIds],
          ),
        ])
      : [{ rows: [] as DbUsageRow[] }, { rows: [] as DbMaintRow[] }]

  const facts: LogisticsFacts = {
    vehicles: vehRes.rows.map(r => ({
      capId: r.cap_id ?? '',
      make: r.make,
      year: r.yr_mfgr,
      type: r.veh_type,
      roadable: r.roadable,
      odometer: r.odometer,
    })),
    usage: usageRes.rows.flatMap(r =>
      r.cap_id !== null ? [{ capId: r.cap_id, usageDate: r.usage_date, totalMiles: r.total_miles }] : [],
    ),
    maintenance: maintRes.rows.flatMap(r =>
      r.cap_id !== null ? [{ capId: r.cap_id, maintDate: r.date_of_maint }] : [],
    ),
    equipment: eqRes.rows.map(r => ({
      assetCode: r.assetcd,
      noun: r.noun,
      make: r.make,
      model: r.model,
      inService: r.inserv,
      status: r.status,
      issuedCapid: r.issued_capid,
      issuedOn: isoDate(r.issued_date),
    })),
    property: propRes.rows.map(r => ({
      propCode: r.prop_code,
      propType: r.prop_type,
      city: r.city,
      state: r.state,
    })),
  }

  const body: LogisticsResponse = {
    orgid: ctx.orgid,
    descendants: ctx.descendants,
    ...buildLogistics(facts, asOf),
  }
  reply.send(body)
}

export function registerLogisticsRoutes(app: FastifyInstance): void {
  app.get('/api/orgs/:orgid/logistics', { preHandler: requireAuth }, handleLogistics)
}
