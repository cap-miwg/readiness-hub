# Readiness Hub v2 Architecture

Status: implementation contract for the v2 branch, revised after a four-lens adversarial design review (data, security, fidelity, ops). v1 (Apps Script + Google Sheets) remains on `main` and in the `v1.11.0` tag.

## Why v2

v1 proved the product: 148 named users, 3,471 sessions, listed on HUBCAP, adopted as an easier front end to eServices. It also hit the ceiling of its platform:

- No database. CAPWATCH CSVs are stored as 40,000-character text chunks in a Google Sheet and shipped raw (14-20 MB) to every browser, which recomputes everything client side. The dominant page cost is O(members x rows) scans over 60k+ row tables.
- No authorization layer. Any authenticated domain user received the entire Wing dataset and could invoke any server global, including one that returned raw secrets.
- No tests. Several hundred hand-transcribed CAPWATCH IDs guarded by nothing.
- Single-tenant assumptions (Michigan OU regex, hardcoded unit exclusions) blocked the adoption the README courts.

v2 keeps what worked (the domain rules, the six-tab UX, the CAPWATCH-only data contract, the in-app feedback loop) and replaces the platform: a containerized TypeScript service with PostgreSQL, deployable with one `docker compose up` on anything from a laptop to a cloud VM. Tested at wing scale; region scale is a stated goal, not yet validated.

## Services

| Service | Image | Role |
|---|---|---|
| `db` | `postgres:16-alpine` | Data store. Volume-backed. Not exposed on the host. |
| `app` | multi-stage Node 22 build, non-root, read-only rootfs | Fastify API + ingest pipeline + scheduler, serves the built React SPA. One origin. |
| `web-dev` | Vite dev server | dev profile only, hot reload against the same API. |

`quickstart.sh` wraps the first run: checks Docker, writes `.env` from `env.example` with generated `SESSION_SECRET` and `DB_PASSWORD` (openssl rand), `docker compose up -d`, waits for health, offers `--demo` to seed the synthetic fixture, prints the URL. The app refuses to start in non-dev mode with a placeholder `SESSION_SECRET`.

## Ingest

Sources, all serialized behind one Postgres advisory lock (scheduler, admin upload, CLI can never run concurrently):

1. Scheduled eServices fetch: `GET https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw?ORGID=<id>&unitOnly=0`, Basic auth from env. Cron default 04:00 America/New_York; NHQ blocks downloads 00:00-02:30 Central. Failure classification: 401/403 stops retries and raises a persistent alert (credentials, lapsed annual attestation, or a charter number in the ORGID slot; eServices returns 403 for all three); 5xx/timeout retries bounded, outside the blackout window.
2. Admin ZIP upload (`/api/admin/ingest`).
3. CLI: `docker compose exec app node dist/cli.js ingest <zip>` or `fetch`.

Pipeline:

- **ZIP guards:** 250 MB request cap, entry-count cap, per-entry and total expanded-size caps; only exact registry filenames are extracted; the raw ZIP lives in memory only and is never written to disk (it contains the SSN column).
- **Parse by header name, never position** (`csv-parse`, RFC 4180: quoted newlines, CRLF, BOM). Nine years of positional consumers are one upstream column insert away from breakage; v2 is not.
- **Registry = per-file column allowlist with target types.** Every registered table declares exactly which columns are stored and as what type. Unknown or newly appearing upstream columns are dropped and logged, never stored. `Member.txt` drops `SSN`, `Gender`, `Profession`, `EducationLevel`, `Citizen`, `Ethnicity` at parse. Unregistered files are logged and skipped.
- **Normalization is schema-driven, not value-sniffed:** declared date columns parse `M/D/YYYY` (and `01/01/1900` -> NULL, the CAPWATCH null sentinel); declared boolean columns map `'True'/'False'/'1'/'0'`; IDs (CAPID, ORGID, AchvID, TaskID, StatusID, PathID, GroupID, CadetAchvID, HFZID) are INTEGER everywhere.
- **Load = staging + atomic rename, not TRUNCATE** (TRUNCATE takes ACCESS EXCLUSIVE and blocks every reader for the whole load). Rows bulk-insert into `<table>__incoming`; compute writes `computed_*__incoming`; a final sub-second transaction drops the old tables and renames. Readers genuinely see the previous dataset until the swap.
- **Sanity gates before swap:** required tables (everything a surface renders) must be present and non-empty or the run aborts; a >40% row-count shrink on `members`, `mbr_tasks`, or `mbr_achievements` versus the previous run aborts unless forced.
- `ingest_runs` records source, `DownLoadDate.txt` value, per-file row and dropped-column counts, and sanitized errors (file/line/reason, never raw row content). A run left in `running` state at boot is marked failed. `/healthz` exposes extract age so a free uptime monitor can alert on staleness.

### Org tree anchoring

A wing-scope extract's `Organization.txt` is not wing-scoped (the 2026-08 MIWG extract carries 1,452 org rows nationally). Ingest derives an **anchor org**: the lowest common ancestor (via `NextLevel`, with cycle guards) of all member home ORGIDs, overridable by config. `org_closure` and `/api/orgs` cover only the anchor subtree. There is no hard FK from members to organizations; members whose ORGID is missing or out-of-tree attach to a synthetic "Unassigned" node so they stay countable. Unit exclusions (default: unit numbers `000`, `999`) and the member-type include list (default: `CADET`, `SENIOR`, `LIFE`, `FIFTY YEAR`) are `app_settings` configuration, applied consistently in compute and the org tree; deltas from v1's hardcoded `000`/`004` exclusion are documented in MIGRATION-V1.md.

## Compute

The v1 readiness rules port to pure TypeScript domain modules (`server/src/domain/`) operating on an indexed in-memory dataset (Maps keyed by integer CAPID/ORGID/AchvID). They run **once per ingest**, writing:

- `computed_member`: one row per member; typed columns for single-valued filters and for every **date the UI's time-dependent flags derive from** (membership expiration, TIG-complete date, qual expirations, turns-18/21, HFZ-valid-until, next-achievement state); JSONB detail for drill-downs.
- `computed_member_duty` (CAPID, duty, asst, held_at_orgid, funct_area) and `computed_member_track`: junctions for the multi-valued Senior Dashboard filters, with Functional Area materialized from the `DUTY_TO_TRACK_MAP` derivation.
- `computed_org` at **two granularities per org** (`scope` = `self` | `subtree`), because unit ES readiness is a step function over the merged member set and is not additive: the Sub-Units toggle reads the subtree row, the Mode C comparison table reads descendants' self rows.

**Time-dependent flags are evaluated at read time** from the stored dates (in SQL predicates or a thin per-row pass at serialization), never frozen at ingest: promotion readiness states, expiring-qual windows (90/180/730 day), 120-days-since-promotion, approaching 18/21, and the QUA fiscal-year window all use request-time `now()`. A stalled ingest ages the data banner; it does not freeze time. Domain functions take an explicit `asOf` parameter, which is what makes them testable.

### Type discipline (the port's biggest trap)

v1 compares everything as strings (`StatusID === "8"`, `Asst === "1"`, AchvID `'124'`). v2's canonical types are integers and booleans. The port therefore has **one audited conversion layer**: `server/src/domain/constants/` re-exports the mechanically extracted `v1-constants.json` (evaluated from v1 source in Node, never hand-retyped) as typed TS constants with integer keys, and every ported comparison uses the typed form. Fixture tests assert expected **nonzero** values (N Skills Evaluators, specific level fractions, M assistants), not self-blessed snapshots, so a systemic type mismatch cannot pass green.

### Rule corrections carried into v2 (each cited in code, listed in MIGRATION-V1.md)

- `PROMOTION_RULES` per CAPR 35-5 (22 Nov 2016) Figures 2/8/9/10: Capt->Maj 4 years (v1: 36 months), Maj->Lt Col 5 years (v1: 48), SM->2d Lt requires 6 months as a member (v1: 0), SFO->Capt 30 months (v1: 0), Lt Col->Col row removed (special appointment under CAPR 35-5 section 3.2, not duty-performance), MSgt duty requirement labeled "Squadron/Flight NCO" (Figure 9 wording).
- Everything else ports faithfully, including thresholds that remain unverified against publications; those keep v1 values and gain source comments.

## Database

PostgreSQL 16. Plain SQL migrations, journaled in `schema_migrations`, applied at boot under a Postgres advisory lock (concurrent boots and the CLI cannot double-apply). Forward-only; recovery runbook in DEPLOYMENT.md.

1. **CAPWATCH mirrors** (typed, allowlisted columns): `members`, `organizations`, `mbr_contact`, `duty_positions`, `cadet_duty_positions`, `mbr_achievements`, `mbr_tasks`, `cadet_achv`, `cadet_achv_aprs`, `cadet_achv_full_report` (the AprDate fallback source for sentinel-dated approvals), `cadet_activities`, `cadet_hfz`, `cadet_rank`, `cadet_phase`, `cadet_awards`, `senior_level`, `senior_awards`, `spec_track`, `training`, `o_flight`, `mbr_committee`, `org_statistics`, `commanders`, `org_contact`, and config tables `pl_paths`, `pl_groups`, `pl_tasks`, `pl_task_group_assignments`, `pl_member_path_credit`, `pl_member_task_credit`, `pl_vol_u_instructors`, `achievements`, `tasks`, `achv_step_tasks`, `achv_step_achv`, `cdt_achv_enum`. Native row-level org columns keep their real semantics (`held_at_orgid` on duty tables); **org scoping always joins through `members.orgid`** (most member-scoped tables carry no ORGID at all).
2. **Derived:** `ingest_runs`, `org_closure`, `computed_member`, `computed_member_duty`, `computed_member_track`, `computed_org`, `adoption_units`, `adoption_users` (optional sideload, below), `app_settings`, `sessions`, `audit_log`, `feedback`.

## AuthN / AuthZ

- **Authentication: Google Workspace OIDC** via `openid-client`: authorization code flow with PKCE and `state`; validate `iss`, `aud` (this client ID), `exp`, signature against Google JWKS; the **`hd` claim from the verified ID token** (not the request hint) must be in `ALLOWED_DOMAINS`. Consumer accounts without `hd` fail closed to a clear error page (v1's multi-account confusion becomes a readable message).
- Sessions: httpOnly `SameSite=Lax` cookies (`Secure` when BASE_URL is https), server-side session table, 7-day sliding / 30-day absolute expiry, logout endpoint, admin revoke-all.
- **CSRF:** all non-GET routes verify `Origin`/`Sec-Fetch-Site` against the deployment origin; admin mutations additionally require a custom header the SPA always sends. A test asserts a cross-origin form POST to `/api/admin/ingest` is rejected.
- `AUTH_MODE=dev` (local work, demos): user picker, no Google dependency. **Fail-closed:** refuses to start when `NODE_ENV=production`; renders a persistent banner; refuses non-demo ingest unless `DEV_ALLOW_REAL_INGEST=true` is set explicitly.
- **Roles, v2.0:** `viewer` (any authenticated allowed-domain user) sees readiness data wing-wide, as v1 deliberately did. `admin` (`ADMIN_EMAILS`) additionally gets ingest, settings, audit and run history. **Cadet DOB and parent/guardian contact render only for admins in v2.0**; viewers see computed age (all age gates need only age). No endpoint returns secrets. eServices credentials are env-only in v2.0 (no UI write).
- Audit: `audit_log` rows for every auth event and every `/api/admin/*` mutation; lightweight access log (user, route, org params, timestamp) with a retention window. No member data in log content.
- Roadmap (v2.x): per-unit scoping from a CAPID<->email mapping. Schema-ready today because scoping joins through `members.orgid`.

## API

REST under `/api`, session-authenticated, org-scoped by `orgid` + `descendants` query params:

`/api/me`, `/api/meta` (includes app version; the SPA prompts reload on mismatch), `/api/orgs` (anchor-subtree tree), `/api/orgs/:orgid/overview`, `/es`, `/seniors`, `/cadets`, `/orgchart`, `/adoption`, `/api/members/:capid`, `/api/reports` + `/api/reports/:id`, `POST /api/feedback`, `/api/admin/*` (ingest upload + fetch trigger, runs, settings, audit). List endpoints serve single-valued filters from `computed_member` columns and multi-valued filters (duty, track, functional area) by joining the computed junctions; both are indexed reads.

Feedback: per-user and global rate limits, title/body length caps, Markdown neutralization. Stored in the `feedback` table always; mirrored to a GitHub issue only when a fine-grained `GITHUB_TOKEN` (issues:write, one repo) is configured. The v1 chatbot webhook is dropped (MIGRATION-V1.md).

## Google adoption (optional sideload)

v1's Workspace adoption view is fed by two CSVs an Apps Script generates from the Admin SDK; they are not CAPWATCH and most wings will never have them. v2 treats them as an **optional second ingest source**: `POST /api/admin/ingest/adoption` accepts the two CSVs (documented contract in CAPWATCH.md), the Unit Overview section renders only when data exists. Adoption rates recompose from summed numerators/denominators, never averaged percentages.

## Frontend

React 18 + TypeScript + Vite + Tailwind (built, pinned, no CDN scripts, no runtime Babel). React Router with the six v1 tabs as routes; filter state in the URL so views are shareable. TanStack Query. Chart.js, Lucide icons, jsPDF + autotable for report export, `html-to-image` for the Org Chart PNG/PDF export (v1 parity). The v1 look stays recognizable; the port is a cleanup, not a redesign. Unit selector defaults to the viewer's unit when the email local part resolves to a member CAPID (a Workspace convention documented as such), else prompts. Hashed assets ship `Cache-Control: immutable`; `index.html` ships `no-store`.

## Testing and CI

- Vitest over the domain layer: mapping invariants (public achievement number bijection, pioneer keys, ES constant collisions), the promotion rule table asserted against CAPR 35-5 figures, TIG/HFZ/honor-credit cases with explicit `asOf` dates, ES prerequisite tree cases.
- Golden fixture tests with **expected nonzero assertions** authored from the fixture spec: full ingest -> compute -> API.
- GitHub Actions: typecheck, test, Docker build on push; image publish to GHCR on version tags. The reference compose file documents pinning a published tag; `git pull` of a moving branch is not the upgrade path.

## Deployment targets

`docker compose up` is the contract. DEPLOYMENT.md covers: TLS via reverse proxy (required for any non-localhost deployment), backups (what is actually irreplaceable: `app_settings`, audit, feedback, ingest history; the CAPWATCH mirrors rebuild from the next zip, so the leading recovery path is re-run quickstart + re-ingest), encrypted backup guidance with retention, the pg major-version upgrade path, memory limits for the app service, and the forward-only migration recovery runbook.

## PII posture

The database holds what the app renders (cadet DOB for age computation, parent/guardian email for the cadet profile) behind authentication, field-gated to admins in v2.0. SSN, Gender, Ethnicity, Profession, EducationLevel, and Citizen are dropped at the parse boundary and never stored; column allowlists mean new upstream columns default to dropped. Address, attendance, and safety tables are not ingested. Raw ZIPs are never persisted. Ingest error records never quote row content. `DoNotContact` is honored by any future outbound feature. The README states plainly what member data a deployment holds and that it must stay behind auth.
