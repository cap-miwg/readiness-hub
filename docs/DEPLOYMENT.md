# Deploying Readiness Hub v2

The contract is `docker compose up`. Anything that runs Docker works: a unit laptop, a wing VM, a cloud instance.

## First run

```
git clone https://github.com/cap-miwg/readiness-hub && cd readiness-hub
./quickstart.sh          # writes .env with generated secrets, builds, starts
./quickstart.sh --demo   # same, plus seeds the synthetic demo dataset
```

Open http://localhost:8080. The default `.env` uses `AUTH_MODE=dev` (a user picker, no Google setup needed) and binds only to localhost. That is the demo posture: real member data behind dev auth is refused unless you explicitly set `DEV_ALLOW_REAL_INGEST=true`, and you should not.

## Production posture (real CAPWATCH data)

1. **Google sign-in.** Create an OAuth 2.0 Web client in Google Cloud Console (any project owned by your Workspace). Authorized redirect URI: `https://<your-host>/auth/callback`. Put the client ID/secret in `.env`, set `AUTH_MODE=google`, `ALLOWED_DOMAINS=<yourwing>.cap.gov`, `ADMIN_EMAILS=<you>@<yourwing>.cap.gov`, and `BASE_URL=https://<your-host>`.
2. **TLS.** Required for any non-localhost deployment. Put a reverse proxy in front; Caddy makes this two lines:
   ```
   readiness.example.org {
     reverse_proxy 127.0.0.1:8080
   }
   ```
   Keep the compose bind on 127.0.0.1 and let the proxy own the network edge.
3. **Data.** Either upload a CAPWATCH zip in Admin > Ingest, or set `CAPWATCH_ORGID` + `ESERVICES_USERNAME`/`ESERVICES_PASSWORD` for the daily fetch. The account needs CAPWATCH download permission (annual security course + attestation). `ORGID` is the eServices org key, not the charter number (docs/CAPWATCH.md).

## Monitoring

`GET /healthz` reports ok plus ingest health (last run, extract age, auth-failure flag). Point any free uptime monitor at it. The most important alert: extract age keeps growing, which means credentials or the annual attestation lapsed; the fetch stops retrying on auth failures until configuration changes.

## Upgrades

Releases publish images to GHCR on version tags. Pin a tag in your compose override and upgrade deliberately:

```
docker compose pull && docker compose up -d
```

Migrations are forward-only and run at boot under a lock. Rolling back an image does not roll back the schema; recovery from a bad migration is restore-from-backup or re-ingest (below). Do not track a moving branch in production.

The `postgres:16-alpine` major version is pinned. Moving to a new Postgres major requires a dump/restore; do not just change the tag.

## Backups and recovery

Most of the database rebuilds from the next CAPWATCH zip. The irreplaceable state is small: `.env`, app settings, feedback, audit/ingest history.

- Quick backup: `docker compose exec db pg_dump -U readiness readiness | gzip > backup.sql.gz` (cron it if you want history). Backups contain member PII including minors' data: encrypt them (`age`, `gpg`) and cap retention.
- Restore: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U readiness readiness`
- Nothing-but-the-laptop-died recovery: re-run `./quickstart.sh`, restore `.env` (or re-enter settings), re-ingest the latest zip. That is a complete recovery.

## Resources

Wing scale (about 1,700 members, 85k task rows) runs comfortably in the defaults. Region scale is a stated goal but not yet validated; if you try it, give the app service memory headroom (compose `mem_limit`, e.g. 2g) and watch the first ingest.
