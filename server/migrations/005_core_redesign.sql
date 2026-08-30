-- v2 redesign core tables (docs/design/V2-DESIGN-PLAN.md, D6/D11 and section 5).
--
-- org_meetings is a CAPWATCH mirror (registered in server/src/ingest/tables.ts
-- as OrgMeetings.txt, the one new 2.0 ingest per D6): like every mirror it is
-- recreated each ingest via CREATE TABLE (LIKE ... INCLUDING ALL) staging +
-- atomic rename, so the index declared here survives every swap.

CREATE TABLE org_meetings (
  orgid integer,
  meet_time text,
  meet_day text,
  activity_date date,
  descr text
);
CREATE INDEX org_meetings_orgid_idx ON org_meetings (orgid);

-- Admin-authored announcements (V2-DESIGN-PLAN.md section 5): fixed schema,
-- plain-text body (rendered as text, never HTML), served to every authed user,
-- written only behind requireAdmin + CSRF with audit_log rows. Not a mirror;
-- survives across ingests like feedback/audit_log.

CREATE TABLE announcements (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  author_email text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  starts_at date,
  ends_at date,
  archived boolean NOT NULL DEFAULT false
);
CREATE INDEX announcements_created_at_idx ON announcements (created_at);
