# CAP Readiness Hub

One place for commanders, senior members, and cadets to monitor readiness, training, and staffing, computed entirely from CAPWATCH data. No data entry anywhere in the system.

This is **v2**: a self-hosted, containerized application (TypeScript, PostgreSQL, React) sized for a unit, a wing, or larger. The original Google Apps Script version lives on the [`v1.11.0`](https://github.com/cap-miwg/readiness-hub/releases/tag/v1.11.0) tag and keeps working where deployed; see [docs/MIGRATION-V1.md](docs/MIGRATION-V1.md).

## What it does

- **Unit Overview**: strength, ES team capability (ground, aircrew, sUAS, mission base, command), qualification health, evaluator coverage, unit comparison across sub-units.
- **Senior Dashboard**: Education & Training level progress, specialty tracks, duty positions, promotion eligibility per CAPR 35-5.
- **Cadet Dashboard**: promotion readiness for all 21 achievements (leadership, aerospace, fitness, character, SDA/staff service), HFZ currency, honor credit, phase breakdown.
- **Reports**: exportable readiness reports (promotion eligibility, membership expiration, cadet protection, TLC, encampment, orientation flights, QCUA/QUA tracking, and more).
- **Org Chart**: the unit's command structure from CAPWATCH duty assignments, senior and cadet chains, with export.

Data comes from the standard CAPWATCH export: upload the zip by hand or let the built-in scheduler fetch it daily from eServices. Everything is recomputed on ingest and served from PostgreSQL, so pages load in milliseconds regardless of wing size.

## Quick start

Requires Docker (with compose v2).

```
git clone https://github.com/cap-miwg/readiness-hub && cd readiness-hub
./quickstart.sh --demo
```

Open http://localhost:8080, pick a demo user, look around. The demo dataset is synthetic; no real member data is involved.

For a real deployment (Google Workspace sign-in, TLS, real CAPWATCH data), follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Configuration

Everything is environment variables in `.env` (template: `env.example`).

| Variable | Purpose |
|---|---|
| `AUTH_MODE` | `dev` (local user picker, demo only) or `google` (Workspace OIDC) |
| `ALLOWED_DOMAINS` | Workspace domains allowed to sign in, comma-separated |
| `ADMIN_EMAILS` | users who get ingest/settings/audit access |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Web client for sign-in |
| `CAPWATCH_ORGID`, `ESERVICES_USERNAME`, `ESERVICES_PASSWORD` | optional scheduled fetch (needs CAPWATCH download permission) |
| `CAPWATCH_FETCH_CRON` | fetch schedule, default 04:00 America/New_York |
| `BASE_URL`, `APP_PORT`, `APP_BIND` | where the app lives |

## Member data and privacy

The database holds what the app renders, behind authentication. The ingest drops sensitive CAPWATCH columns (`SSN`, `Gender`, `Ethnicity`, and others) at the parse boundary; they are never stored. Cadet date of birth and parent/guardian contact are visible only to admin users. Address, attendance, and safety tables are not ingested at all. Raw zips are never written to disk. Read [docs/CAPWATCH.md](docs/CAPWATCH.md) before deploying with real data, and keep deployments behind TLS.

## Development

```
docker compose up db -d            # just the database
cd server && npm install && npm run dev   # API on :8080
cd web && npm install && npm run dev      # Vite on :5173, proxies /api
```

Tests: `cd server && npm test`. Architecture and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT. Built by and for Civil Air Patrol volunteers; not an official CAP or USAF publication.
