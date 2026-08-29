-- Computed readiness tables, written once per ingest by server/src/domain/compute.ts.
-- Column contract: server/src/domain/computedTypes.ts (regenerate from it rather than
-- hand-editing column lists here).
-- Like the CAPWATCH mirrors, these are recreated each ingest via
-- CREATE TABLE (LIKE ... INCLUDING ALL) staging + atomic rename, so every index
-- declared here survives through every swap (docs/ARCHITECTURE.md, Ingest).

CREATE TABLE computed_member (
  capid integer PRIMARY KEY,
  -- Home ORGID normalized into the anchor subtree: members whose home org is
  -- missing or out-of-tree carry the synthetic UNASSIGNED_ORGID (-1) so
  -- closure joins keep them countable (docs/ARCHITECTURE.md, Org tree anchoring).
  orgid integer,
  name_last text,
  name_first text,
  full_name text,
  rank text,
  member_type text,
  joined date,
  expiration date,
  rank_date date,
  -- Age gates need age only; DOB itself stays in members, admin-gated
  -- (docs/ARCHITECTURE.md, PII posture).
  dob_year integer,
  age_asof_compute integer,
  is_senior_scope boolean,
  is_cadet_scope boolean,
  current_level text,
  level_progress jsonb,
  promotion jsonb,
  promotable_on date,
  tig_eligible_on date,
  next_achv_id integer,
  next_achv_public_number integer,
  cadet_state_facts jsonb,
  tig_complete_on date,
  hfz_valid_until date,
  last_promotion_on date,
  phase text,
  honor_credit boolean,
  es_summary jsonb,
  es_expiring_count integer,
  detail jsonb
);
CREATE INDEX computed_member_orgid_idx ON computed_member (orgid);
CREATE INDEX computed_member_member_type_idx ON computed_member (member_type);
CREATE INDEX computed_member_rank_idx ON computed_member (rank);
CREATE INDEX computed_member_current_level_idx ON computed_member (current_level);
CREATE INDEX computed_member_expiration_idx ON computed_member (expiration);
CREATE INDEX computed_member_promotable_on_idx ON computed_member (promotable_on);
CREATE INDEX computed_member_tig_eligible_on_idx ON computed_member (tig_eligible_on);
CREATE INDEX computed_member_tig_complete_on_idx ON computed_member (tig_complete_on);
CREATE INDEX computed_member_hfz_valid_until_idx ON computed_member (hfz_valid_until);
CREATE INDEX computed_member_next_achv_id_idx ON computed_member (next_achv_id);
CREATE INDEX computed_member_phase_idx ON computed_member (phase);
CREATE INDEX computed_member_es_expiring_idx ON computed_member (es_expiring_count);

CREATE TABLE computed_member_duty (
  capid integer,
  duty text,
  asst boolean,
  held_at_orgid integer,
  funct_area text,
  lvl text,
  source text
);
CREATE INDEX computed_member_duty_capid_idx ON computed_member_duty (capid);
CREATE INDEX computed_member_duty_duty_idx ON computed_member_duty (duty);
CREATE INDEX computed_member_duty_held_at_idx ON computed_member_duty (held_at_orgid);
CREATE INDEX computed_member_duty_funct_area_idx ON computed_member_duty (funct_area);
CREATE INDEX computed_member_duty_source_idx ON computed_member_duty (source);

CREATE TABLE computed_member_track (
  capid integer,
  track text,
  track_level text
);
CREATE INDEX computed_member_track_capid_idx ON computed_member_track (capid);
CREATE INDEX computed_member_track_track_idx ON computed_member_track (track);
CREATE INDEX computed_member_track_level_idx ON computed_member_track (track_level);

-- Two granularities per org because unit ES readiness is a step function over
-- the merged member set and is not additive (docs/ARCHITECTURE.md, Compute).
CREATE TABLE computed_org (
  orgid integer,
  scope text,
  member_count integer,
  senior_count integer,
  cadet_count integer,
  es jsonb,
  org_stats jsonb,
  orgchart jsonb,
  PRIMARY KEY (orgid, scope)
);

-- Defaults for the org-scoping configuration compute and the API both read.
-- v1 hardcoded unit exclusions and member types; v2 makes them app_settings
-- (docs/ARCHITECTURE.md, Org tree anchoring; deltas in MIGRATION-V1.md).
INSERT INTO app_settings (key, value)
VALUES ('org.excluded_units', '["000","999"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('org.member_types', '["CADET","SENIOR","LIFE","FIFTY YEAR"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
