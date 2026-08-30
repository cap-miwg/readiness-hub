-- AttendanceLog mirror tables (D7, owner-approved 2026-08-30), generated from
-- the server/src/ingest/tables.ts registry entries. Same mirror rules as
-- 001_capwatch.sql: no primary or foreign keys (extracts carry duplicate rows),
-- and the ingest swap recreates each table via CREATE TABLE (LIKE ... INCLUDING
-- ALL) staging + rename, so the indexes declared here survive every swap.
--
-- attendance_guests carries ONLY the meeting id: guests are often minors with
-- no membership consent, so names/phones/emails in AttendanceLogGuest.txt are
-- dropped at parse and never stored (counts only, per D7).

CREATE TABLE attendance_meetings (
  attendance_log_id integer,
  orgid integer,
  member_type text,
  start_date date,
  end_date date
);
CREATE INDEX attendance_meetings_orgid_idx ON attendance_meetings (orgid);
CREATE INDEX attendance_meetings_start_date_idx ON attendance_meetings (start_date);

CREATE TABLE attendance_attendees (
  attendance_log_id integer,
  capid integer,
  present boolean,
  excused boolean,
  uniform boolean
);
CREATE INDEX attendance_attendees_log_idx ON attendance_attendees (attendance_log_id);
CREATE INDEX attendance_attendees_capid_idx ON attendance_attendees (capid);

CREATE TABLE attendance_guests (
  attendance_log_id integer
);
CREATE INDEX attendance_guests_log_idx ON attendance_guests (attendance_log_id);
