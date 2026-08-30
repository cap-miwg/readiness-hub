-- CAPWATCH mirror tables, generated from server/src/ingest/tables.ts (the registry
-- is the contract; regenerate rather than hand-edit column lists).
-- No primary keys or foreign keys on mirrors: CAPWATCH extracts carry duplicate
-- rows and org references outside the extract scope (docs/ARCHITECTURE.md, Ingest).
-- The ingest swap recreates each mirror via CREATE TABLE (LIKE ... INCLUDING ALL)
-- staging + rename, so indexes declared here survive through every swap.

CREATE TABLE members (
  capid integer,
  name_last text,
  name_first text,
  name_middle text,
  name_suffix text,
  dob date,
  orgid integer,
  wing text,
  unit text,
  rank text,
  joined date,
  expiration date,
  org_joined date,
  date_mod date,
  type text,
  rank_date date,
  region text,
  mbr_status text
);
CREATE INDEX members_capid_idx ON members (capid);
CREATE INDEX members_orgid_idx ON members (orgid);

CREATE TABLE organizations (
  orgid integer,
  region text,
  wing text,
  unit text,
  next_level integer,
  name text,
  type text,
  date_chartered date,
  status text,
  scope text
);
CREATE INDEX organizations_orgid_idx ON organizations (orgid);

CREATE TABLE mbr_contact (
  capid integer,
  type text,
  priority text,
  contact text,
  do_not_contact boolean
);
CREATE INDEX mbr_contact_capid_idx ON mbr_contact (capid);

CREATE TABLE duty_positions (
  capid integer,
  duty text,
  funct_area text,
  lvl text,
  asst boolean,
  date_mod date,
  orgid integer
);
CREATE INDEX duty_positions_capid_idx ON duty_positions (capid);

CREATE TABLE cadet_duty_positions (
  capid integer,
  duty text,
  funct_area text,
  lvl text,
  asst boolean,
  date_mod date,
  orgid integer
);
CREATE INDEX cadet_duty_positions_capid_idx ON cadet_duty_positions (capid);

CREATE TABLE mbr_achievements (
  capid integer,
  achv_id integer,
  status text,
  originally_accomplished date,
  completed date,
  expiration date,
  auth_date date,
  date_mod date,
  orgid integer
);
CREATE INDEX mbr_achievements_capid_idx ON mbr_achievements (capid);

CREATE TABLE mbr_tasks (
  capid integer,
  task_id integer,
  status text,
  completed date,
  expiration date,
  orgid integer
);
CREATE INDEX mbr_tasks_capid_idx ON mbr_tasks (capid);

CREATE TABLE cadet_achv (
  capid integer,
  cadet_achv_id integer,
  phy_fit_test date,
  lead_lab_date_p date,
  lead_lab_score text,
  ae_date_p date,
  ae_score text,
  ae_mod text,
  ae_test text,
  moral_l_date_p date,
  active_part text,
  other_req text,
  sda_report text,
  date_mod date,
  drill_date date,
  drill_score text,
  lead_curr text,
  cadet_oath text,
  ae_book_value text,
  mile_run text,
  shuttle_run text,
  sit_and_reach text,
  push_ups text,
  curl_ups text,
  hfzid integer,
  staff_service_date date,
  technical_writing_assignment text,
  technical_writing_assignment_date date,
  oral_presentation_date date,
  speech_date date,
  leadership_essay_date date
);
CREATE INDEX cadet_achv_capid_idx ON cadet_achv (capid);

CREATE TABLE cadet_achv_aprs (
  capid integer,
  cadet_achv_id integer,
  status text,
  award_no text,
  date_mod date,
  date_created date
);
CREATE INDEX cadet_achv_aprs_capid_idx ON cadet_achv_aprs (capid);

CREATE TABLE cadet_achv_full_report (
  capid integer,
  achv_name text,
  apr_date date
);
CREATE INDEX cadet_achv_full_report_capid_idx ON cadet_achv_full_report (capid);

CREATE TABLE cadet_activities (
  capid integer,
  type text,
  location text,
  completed date
);
CREATE INDEX cadet_activities_capid_idx ON cadet_activities (capid);

CREATE TABLE cadet_hfz (
  hfzid integer,
  capid integer,
  date_taken date,
  orgid integer,
  is_passed boolean,
  pacer_run text,
  pacer_run_passed boolean,
  mile_run text,
  mile_run_passed boolean,
  curl_up text,
  curl_up_passed boolean,
  push_up text,
  push_up_passed boolean,
  sit_and_reach text,
  sit_and_reach_passed boolean
);
CREATE INDEX cadet_hfz_capid_idx ON cadet_hfz (capid);

CREATE TABLE cadet_rank (
  capid integer,
  rank text,
  rank_date date,
  date_mod date
);
CREATE INDEX cadet_rank_capid_idx ON cadet_rank (capid);

CREATE TABLE cadet_phase (
  capid integer,
  type text,
  completed date
);
CREATE INDEX cadet_phase_capid_idx ON cadet_phase (capid);

CREATE TABLE cadet_awards (
  capid integer,
  award text,
  award_no text,
  completed date
);
CREATE INDEX cadet_awards_capid_idx ON cadet_awards (capid);

CREATE TABLE senior_level (
  capid integer,
  lvl text,
  completed date
);
CREATE INDEX senior_level_capid_idx ON senior_level (capid);

CREATE TABLE senior_awards (
  capid integer,
  award text,
  award_no text,
  completed date
);
CREATE INDEX senior_awards_capid_idx ON senior_awards (capid);

CREATE TABLE spec_track (
  capid integer,
  track text,
  track_level text,
  how_complete text,
  completed date,
  date_mod date
);
CREATE INDEX spec_track_capid_idx ON spec_track (capid);

CREATE TABLE training (
  capid integer,
  type_crs text,
  how_complete text,
  crs_id text,
  completed date
);
CREATE INDEX training_capid_idx ON training (capid);

CREATE TABLE o_flight (
  capid integer,
  wing text,
  unit text,
  syllabus text,
  type text,
  flt_date date
);
CREATE INDEX o_flight_capid_idx ON o_flight (capid);

CREATE TABLE mbr_committee (
  capid integer,
  committee text,
  chair text,
  orgid integer,
  date_assigned date
);
CREATE INDEX mbr_committee_capid_idx ON mbr_committee (capid);

CREATE TABLE org_statistics (
  orgid integer,
  region text,
  wing text,
  unit text,
  mbr_type text,
  cnt_type text,
  quantity integer,
  cnt_date date
);

CREATE TABLE commanders (
  orgid integer,
  capid integer,
  date_asg date,
  name_last text,
  name_first text,
  rank text
);
CREATE INDEX commanders_capid_idx ON commanders (capid);

CREATE TABLE org_contact (
  orgid integer,
  type text,
  priority text,
  contact text
);

CREATE TABLE pl_paths (
  path_id integer,
  path_name text
);

CREATE TABLE pl_groups (
  group_id integer,
  path_id integer,
  group_name text,
  number_of_required_tasks integer,
  awards_extra_credit boolean
);

CREATE TABLE pl_tasks (
  task_id integer,
  task_name text,
  description text
);

CREATE TABLE pl_task_group_assignments (
  task_group_assignment_id integer,
  task_id integer,
  group_id integer
);

CREATE TABLE pl_member_path_credit (
  member_path_credit_id integer,
  path_id integer,
  capid integer,
  status_id integer,
  completed date,
  expiration date,
  extra_credit_earned text
);
CREATE INDEX pl_member_path_credit_capid_idx ON pl_member_path_credit (capid);

CREATE TABLE pl_member_task_credit (
  member_task_credit_id integer,
  task_id integer,
  capid integer,
  status_id integer,
  completed date,
  expiration date
);
CREATE INDEX pl_member_task_credit_capid_idx ON pl_member_task_credit (capid);

CREATE TABLE pl_vol_u_instructors (
  full_name text,
  capid integer,
  region text,
  wing text,
  unit text,
  instructor_type text,
  category text,
  path_name text
);
CREATE INDEX pl_vol_u_instructors_capid_idx ON pl_vol_u_instructors (capid);

CREATE TABLE achievements (
  achv_id integer,
  achv text,
  functional_area text
);

CREATE TABLE tasks (
  task_id integer,
  task_name text,
  functional_area text
);

CREATE TABLE achv_step_tasks (
  achv_step_task_id integer,
  achv_id integer,
  step_id integer,
  task_id integer
);

CREATE TABLE achv_step_achv (
  achv_step_task_id integer,
  achv_id integer,
  step_id integer,
  orig_achv_id integer
);

CREATE TABLE cdt_achv_enum (
  cadet_achv_id integer,
  achv_name text,
  cur_awd_no text,
  rank text
);

-- Derived ingest bookkeeping (not swapped; survives across ingests).

CREATE TABLE ingest_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'aborted')),
  source text NOT NULL CHECK (source IN ('upload', 'fetch', 'cli', 'demo')),
  download_date timestamptz,
  file_stats jsonb,
  error text,
  forced boolean NOT NULL DEFAULT false
);

-- Anchor-subtree transitive closure, rebuilt inside every ingest swap transaction.
-- Includes a synthetic UNASSIGNED_ORGID (-1) node for members whose home orgid
-- falls outside the anchor subtree; no organizations row exists for it.
CREATE TABLE org_closure (
  ancestor_orgid integer NOT NULL,
  descendant_orgid integer NOT NULL,
  depth integer NOT NULL,
  PRIMARY KEY (ancestor_orgid, descendant_orgid)
);
CREATE INDEX org_closure_descendant_idx ON org_closure (descendant_orgid);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Google Workspace adoption sideload (optional, not CAPWATCH).

CREATE TABLE adoption_units (
  unit text,
  roster_count integer,
  total_accounts integer,
  active_users integer,
  recent_login integer,
  gmail_active integer,
  drive_active integer,
  adoption_rate text,
  collection_date date
);

CREATE TABLE adoption_users (
  unit text,
  email text,
  full_name text,
  is_active_user boolean,
  has_recent_login boolean,
  last_login_date date,
  has_gmail_activity boolean,
  has_drive_activity boolean,
  collection_date date
);

