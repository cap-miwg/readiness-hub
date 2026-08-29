# Readiness Hub v2 Architecture

Status: design accepted for the v2 branch. v1 (Apps Script + Google Sheets) remains on `main` and in the `v1.11.0` tag.

## Why v2

v1 proved the product: 148 named users, 3,471 sessions, listed on HUBCAP, adopted as an easier front end to eServices. It also hit the ceiling of its platform:

- No database. CAPWATCH CSVs are stored as 40,000-character text chunks in a Google Sheet and shipped raw (14-20 MB) to every browser, which recomputes everything client side. The dominant page cost is O(members x rows) scans over 60k+ row tables.
- No authorization layer. Any authenticated domain user received the entire Wing dataset and could invoke any server global, including one that returned raw secrets.
- No tests. Several hundred hand-transcribed CAPWATCH IDs guarded by nothing.
- Single-tenant assumptions (Michigan OU regex, hardcoded unit exclusions) blocked the adoption the README courts.

v2 keeps what worked (the domain rules, the six-tab UX, the CAPWATCH-only data contract, the feedback loop) and replaces the platform: a containerized TypeScript service with PostgreSQL, deployable with one `docker compose up` on anything from a laptop to a cloud VM, sized for a unit, a wing, a region, or larger.

## Services

Two containers, one optional profile:

| Service | Image | Role |
|---|---|---|
| `db` | `postgres:16-alpine` | Data store. Volume-backed. Not exposed on the host by default. |
| `app` | multi-stage Node 22 build | Fastify API + ingest pipeline + scheduler, and serves the built React SPA. One origin, no CORS. |
| `web-dev` | Vite dev server | `--profile dev` only, hot reload against the same API. |

`quickstart.sh` wraps the first run: checks Docker, writes `.env` from `.env.example` with a generated session secret, `docker compose up -d`, waits for health, offers `--demo` to seed the synthetic fixture, prints the URL.

## Data flow

```
eServices CAPWATCH API ──(scheduled fetch, Basic auth)──┐
Admin ZIP upload ───────────────────────────────────────┤
CLI (docker compose exec app node dist/cli.js ingest) ──┤
                                                        v
                                             ingest pipeline
                                   (unzip -> parse -> typed load -> compute)
                                                        v
                                                  PostgreSQL
                                                        v
                                              Fastify API (org-scoped)
                                                        v
                                              React SPA (thin client)
```

### Ingest

- One HTTP GET returns one zip: `GET https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw?ORGID=<id>&unitOnly=0`, `Authorization: Basic base64(user:pass)`. No deltas, no pagination. The scheduler honors the NHQ blackout window (00:00-02:30 Central) and defaults to 04:00 America/New_York.
- Files are parsed by **header name**, never by column position, with `csv-parse` (RFC 4180: quoted newlines, quoted commas, CRLF, BOM). Nine years of MIWG positional consumers are one upstream column insert away from breakage; v2 is not.
- Exact-filename table registry (no substring matching). Unknown files are logged and skipped; missing expected files are warnings surfaced in the admin UI.
- Normalization at the boundary: `01/01/1900` dates -> NULL, `'True'/'False'/'1'/'0'` -> boolean, `M/DD/YYYY` -> `date`.
- **Dropped at parse, never stored: `Member.SSN`.** Also not ingested in v2.0: addresses, attendance, safety, logistics tables (registry entries exist, disabled by default).
- Load is transactional: truncate + bulk insert of all tables and all recomputed rollups in one transaction. Readers see the previous dataset until commit. `ingest_runs` records source, `DownLoadDate.txt` value, per-file row counts, and errors; the UI shows extract age (v1 showed sync time, which hid stale data).

### Compute

The v1 readiness rules are the product's hard-won asset. They are ported to pure TypeScript domain modules (`server/src/domain/`) that operate on an indexed in-memory dataset (Maps by CAPID/ORGID/AchvID), then run once per ingest, not once per page view:

- `cadet.ts`: 21-achievement requirement engine, milestone exams, HFZ 180-day rules, TIG from achievement approval date (the Mitchell edge case), honor credit, the six-state promotion readiness machine, public achievement number mapping.
- `senior.ts`: E&T levels with the Level 2 split and legacy `LV2` backfill, track selection, promotion eligibility per corrected `PROMOTION_RULES`.
- `es.ts` / `esUnit.ts`: qualification status and expiry windows, Skills Evaluator derivation, prerequisite trees from `AchvStepAchv` plus the four special cases, team capability, unit readiness composite.
- `orgStats.ts`: recruiting/retention/sustainability from `ORGStatistics`.

Results persist to `computed_member` and `computed_org` tables (typed filter columns + JSONB detail). An `org_closure` table materializes the `Organization.NextLevel` tree so "unit + sub-units" is one indexed join. API reads are index hits, not recomputation.

### Rule corrections carried into v2 (documented in MIGRATION-V1.md)

Faithful port first, with the independently verified corrections applied and cited in code:

- `PROMOTION_RULES` per CAPR 35-5 (22 Nov 2016), Figures 2/8/9/10: Capt->Maj 4 years (was 36 months), Maj->Lt Col 5 years (was 48), SM->2d Lt requires 6 months membership (was 0), SFO->Capt 30 months (was 0), Lt Col->Col removed (special appointment, not duty-performance), MSgt duty labeled "Squadron/Flight NCO".
- Everything else ports byte-faithfully from v1 constants (copied, not retyped), including thresholds that remain `[unverified]` against publications; those keep their v1 values and gain source comments.

## Database

PostgreSQL 16. Plain SQL migrations run idempotently at app boot (no manual step). Two groups of tables:

1. **CAPWATCH mirrors** (typed, keyed): `members`, `organizations`, `mbr_contact`, `duty_positions`, `cadet_duty_positions`, `mbr_achievements`, `mbr_tasks`, `cadet_achv`, `cadet_achv_aprs`, `cadet_activities`, `cadet_hfz`, `cadet_rank`, `cadet_phase`, `cadet_awards`, `senior_level`, `senior_awards`, `spec_track`, `training`, `o_flight`, `mbr_committee`, `org_statistics`, `commanders`, `org_contact`, plus the config tables (`pl_paths`, `pl_groups`, `pl_tasks`, `pl_task_group_assignments`, `pl_member_path_credit`, `pl_member_task_credit`, `pl_vol_u_instructors`, `achievements`, `tasks`, `achv_step_tasks`, `achv_step_achv`, `cdt_achv_enum`). Indexed on CAPID, ORGID, and the join keys the domain layer uses.
2. **Derived**: `ingest_runs`, `org_closure`, `computed_member`, `computed_org`, `app_settings`, `sessions`.

## AuthN / AuthZ

- **Authentication: Google Workspace OIDC** (authorization code flow). The `hd` claim must match `ALLOWED_DOMAINS` (e.g. `miwg.cap.gov`); ID token verified against Google JWKS. Members already signed into their Wing Google account pass straight through: the v1 "seamless" experience, minus the multiple-account confusion (the domain check produces a clear error page instead of a blank screen).
- Sessions: httpOnly signed cookies, server-side session table, 7-day sliding expiry.
- `AUTH_MODE=dev` for local work and demos: a user picker, no Google dependency, never enabled by the production compose file.
- **Authorization, v2.0:** two roles. `viewer` (any authenticated allowed-domain user) sees readiness data, as in v1. `admin` (`ADMIN_EMAILS`) additionally gets ingest, settings, logs. No endpoint returns secrets; eServices credentials are env-only and write-only from the UI.
- Roadmap (v2.x, not in scope): per-unit data scoping driven by a CAPID<->email mapping. The schema keeps `ORGID` on every row so this lands without a migration.

## API

REST under `/api`, session-authenticated, org-scoped by query params (`orgid`, `descendants`):

`/api/me`, `/api/meta`, `/api/orgs` (tree), `/api/orgs/:orgid/overview`, `/es`, `/seniors`, `/cadets`, `/orgchart`, `/adoption`, `/api/members/:capid`, `/api/reports` + `/api/reports/:id`, and `/api/admin/*` (ingest upload, eServices fetch, run history). OpenAPI schema served at `/api/docs` in dev.

## Frontend

React 18 + TypeScript + Vite + Tailwind (built, pinned, no CDN scripts, no runtime Babel). React Router with the six v1 tabs as routes; filter state in the URL so views are shareable. TanStack Query for data. Chart.js for charts, Lucide icons, jsPDF for report export. The v1 look stays recognizable; the port is a cleanup (design tokens, consistent components), not a redesign. Unit selector defaults to the viewer's unit when resolvable, else prompts (v1 defaulted to the numerically lowest unit).

## Testing and CI

- Vitest unit tests over the domain layer: mapping invariants (public achievement number bijection, pioneer map keys, ES constant collisions), promotion rule table asserted against CAPR 35-5 figures, HFZ/TIG/honor-credit cases, ES prerequisite tree cases.
- Golden tests over the committed synthetic fixture (`seed/`): full ingest -> compute -> API snapshot.
- GitHub Actions: typecheck, lint, test, Docker build on every push to v2.

## Deployment targets

`docker compose up` is the contract. Anything that runs Docker: a unit laptop, a wing VM, any cloud. The compose file is the reference deployment; a `DEPLOYMENT.md` covers TLS termination (reverse proxy), backups (pg_dump cron), and upgrade (pull + up, migrations run on boot).

## PII posture

The database holds what the app renders (cadet DOB for age gates, parent/guardian email for the cadet profile) behind authentication. SSN is dropped at the parse boundary and never stored. Address/attendance tables are not ingested by default. `DoNotContact` is honored by any future outbound feature. Operators are told plainly in the README what member data this system holds and that the deployment must stay behind auth.
