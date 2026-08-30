/**
 * Shared logistics API contracts between server and web. Same rules as
 * contracts.ts: no server-only imports, types and plain constants only.
 *
 * The logistics module is a read-only view (V2-DESIGN-PLAN.md D8, reversed by
 * owner 2026-08-30); ORMS remains the system of record. The server serves
 * facts; findings-style verdicts (ACTION/WATCH/PLAN, NOT RECORDED) belong to
 * the web layer.
 */

/**
 * Equipment list rows served per response (big units carry thousands of
 * assets). equipmentSummary always covers ALL rows in scope, not just the
 * served page.
 */
export const EQUIPMENT_ROW_CAP = 200

export interface VehicleRow {
  /** CAP vehicle number (the vehicle tables' cap_id), not a member CAPID. */
  capId: string
  make: string | null
  /** Model year as reported (yr_mfgr), served verbatim. */
  year: string | null
  /** Vehicle type (veh_type), e.g. van/sedan, served verbatim. */
  type: string | null
  roadable: boolean | null
  /** Odometer reading, digits parsed defensively; null when unparseable. */
  odometer: number | null
  /** Most recent usage_date on record, ISO yyyy-mm-dd. */
  lastUsedOn: string | null
  /** Most recent date_of_maint on record, ISO yyyy-mm-dd. */
  lastMaintOn: string | null
  /** Sum of parseable usage TotalMiles over the 90 days before the request. */
  miles90: number
}

export interface VehicleSummary {
  total: number
  /** Vehicles explicitly marked roadable. */
  roadable: number
  /** Vehicles explicitly marked not roadable. */
  downCount: number
  /** Vehicles with no usage recorded in the 60 days before the request. */
  unusedIn60d: number
}

export interface EquipmentStatusCount {
  /** Trimmed status value; '' groups rows whose status is blank/unrecorded. */
  status: string
  count: number
}

export interface EquipmentSummary {
  /** All equipment rows in scope (the served list is capped separately). */
  total: number
  /** Sorted by count descending, then status ascending. */
  byStatus: EquipmentStatusCount[]
  /** Rows carrying an issued-to member CAPID. */
  issuedCount: number
}

export interface EquipmentRow {
  assetCode: string | null
  noun: string | null
  make: string | null
  model: string | null
  /** In-service value (inserv), served verbatim. */
  inService: string | null
  status: string | null
  issuedCapid: number | null
  issuedOn: string | null
}

export interface PropertyRow {
  propCode: string | null
  propType: string | null
  city: string | null
  state: string | null
}

export interface LogisticsResponse {
  orgid: number
  descendants: boolean
  /**
   * False when the scope has no vehicles and no equipment rows: the web
   * renders the neutral NOT RECORDED state, never a red verdict.
   */
  recorded: boolean
  /** Sorted not-roadable first, then by CAP vehicle number. */
  vehicles: VehicleRow[]
  vehicleSummary: VehicleSummary
  /** Capped at EQUIPMENT_ROW_CAP rows; equipmentSummary.total is the full count. */
  equipment: EquipmentRow[]
  equipmentSummary: EquipmentSummary
  property: PropertyRow[]
}
