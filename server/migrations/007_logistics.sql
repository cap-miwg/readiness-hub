-- Logistics mirror tables (V2-DESIGN-PLAN.md D8, reversed by owner 2026-08-30):
-- vehicles, maintenance, usage, equipment, and property. ORMS remains the
-- system of record; the app serves a read-only view. Generated from
-- server/src/ingest/tables.ts under the 001_capwatch.sql mirror rules:
-- no primary keys or foreign keys (extracts carry duplicate rows), and the
-- ingest swap recreates each mirror via CREATE TABLE (LIKE ... INCLUDING ALL)
-- staging + rename, so indexes declared here survive every swap.

-- cap_id in the vehicle tables is the CAP vehicle number, not a member CAPID.
CREATE TABLE vehicles (
  orgid integer,
  cap_id text,
  make text,
  yr_mfgr text,
  veh_type text,
  roadable boolean,
  odometer text
);
CREATE INDEX vehicles_orgid_idx ON vehicles (orgid);

CREATE TABLE vehicles_maintenance (
  cap_id text,
  date_of_maint date
);
CREATE INDEX vehicles_maintenance_cap_id_idx ON vehicles_maintenance (cap_id);

CREATE TABLE vehicles_usage (
  cap_id text,
  usage_date date,
  total_times_used text,
  total_hours_used text,
  total_miles text
);
CREATE INDEX vehicles_usage_cap_id_idx ON vehicles_usage (cap_id);
CREATE INDEX vehicles_usage_usage_date_idx ON vehicles_usage (usage_date);

CREATE TABLE equipment (
  assetcd text,
  noun text,
  make text,
  model text,
  inserv text,
  status text,
  orgid integer,
  issued_capid integer,
  issued_date date
);
CREATE INDEX equipment_orgid_idx ON equipment (orgid);

CREATE TABLE property (
  prop_code text,
  prop_type text,
  city text,
  state text,
  orgid integer
);
CREATE INDEX property_orgid_idx ON property (orgid);
