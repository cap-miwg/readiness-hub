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
  /** Odometer reading, parsed defensively; null when unparseable. */
  odometer: number | null
  /**
   * Most recent usage MONTH on record as 'yyyy-mm' (vehicles_usage rows are
   * monthly summaries dated the 1st, so day precision would be a lie). The
   * web renders the month, e.g. 'Jul 2026'.
   */
  lastUsedOn: string | null
  /** Most recent date_of_maint on record, ISO yyyy-mm-dd. */
  lastMaintOn: string | null
  /**
   * Signed sum of parseable usage TotalMiles over the 90 days before the
   * request (negative correction rows subtract), clamped at >= 0.
   */
  miles90: number
}

export interface VehicleSummary {
  total: number
  /** Vehicles explicitly marked roadable. */
  roadable: number
  /** Vehicles explicitly marked not roadable. */
  downCount: number
  /**
   * Vehicles with no usage row covering the current or previous two calendar
   * months. Usage rows are monthly summaries, so a row dated the 1st covers
   * its whole month; the 3-month band matches the 60-day intent plus the
   * reporting lag.
   */
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
  /**
   * Rows issued to a real member CAPID (> 0; ORMS writes 0 as the unissued
   * sentinel). The CAPID itself is never served (D9: counts, not members).
   */
  issuedCount: number
}

/** No issued-to CAPID here by design: member identifiers stay server-side. */
export interface EquipmentRow {
  assetCode: string | null
  noun: string | null
  make: string | null
  model: string | null
  /** In-service value (inserv), served verbatim. */
  inService: string | null
  status: string | null
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
