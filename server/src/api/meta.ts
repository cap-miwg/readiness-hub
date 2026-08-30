/**
 * GET /api/meta plus the /api/me homeOrgid enrichment. Counts read the live
 * tables on every request (no cache layer exists, so a fresh ingest is
 * reflected immediately; docs/ARCHITECTURE.md, API).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import type { MetaResponse } from '../shared/contracts.js'
import { loadClosure, loadOrgInfo, loadOrgSettings } from './scope.js'
import { capidFromEmail, isoTimestamp, normalizeUnit, subtreeOrgidsOf } from './util.js'

let cachedVersion: string | null = null

/**
 * Deployment version; the SPA prompts reload on mismatch. Prefers the
 * APP_VERSION baked into the image (which also versioned the web bundle),
 * falling back to server package.json for bare-node dev runs.
 */
export function appVersion(): string {
  if (cachedVersion !== null) return cachedVersion
  const fromEnv = process.env.APP_VERSION
  if (fromEnv) {
    cachedVersion = fromEnv
    return cachedVersion
  }
  try {
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../package.json',
    )
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown }
    cachedVersion = typeof parsed.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    cachedVersion = '0.0.0'
  }
  return cachedVersion
}

/**
 * Email local part parsed as an integer CAPID resolved to the member's home
 * org (a Workspace convention of CAPID-numbered mailboxes); null when the
 * local part is not a CAPID or no computed member matches.
 */
export async function resolveHomeOrgid(email: string): Promise<number | null> {
  const capid = capidFromEmail(email)
  if (capid === null) return null
  try {
    const res = await pool.query<{ orgid: number | null }>(
      'SELECT orgid FROM computed_member WHERE capid = $1',
      [capid],
    )
    return res.rows[0]?.orgid ?? null
  } catch {
    return null
  }
}


interface LastRunRow {
  finished_at: Date
  download_date: Date | null
}

/** Default MetaResponse.staleAfterHours: the daily fetch cycle plus slack. */
export const STALE_HOURS_DEFAULT = 26
/** Admin-settable bounds for 'ingest.stale_hours' (6 hours to 7 days). */
export const STALE_HOURS_MIN = 6
export const STALE_HOURS_MAX = 168

/**
 * app_settings 'ingest.stale_hours' as a bounded number; the default when the
 * key is absent or the stored value is not a number in range.
 */
export function parseStaleHours(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return STALE_HOURS_DEFAULT
  const n = Math.trunc(value)
  return n >= STALE_HOURS_MIN && n <= STALE_HOURS_MAX ? n : STALE_HOURS_DEFAULT
}

/** Read the stale-hours setting (shared with api/admin.ts settings GET/PUT). */
export async function loadStaleHours(): Promise<number> {
  const res = await pool.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = 'ingest.stale_hours'`,
  )
  return parseStaleHours(res.rows[0]?.value)
}

/**
 * MetaResponse.lastRunStatus from the latest ingest_runs row of ANY kind:
 * a failed (or aborted) run must surface on the as-of ladder even while
 * lastIngestAt still points at the last success. Null before the first run
 * or while the latest run is still in flight.
 */
export function lastRunStatusOf(status: string | undefined): 'succeeded' | 'failed' | null {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'aborted') return 'failed'
  return null
}

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get('/api/meta', { preHandler: requireAuth }, async (_req, reply) => {
    const [runRes, latestRunRes, staleHours, memberRes, closure, settings] = await Promise.all([
      // download_date IS NOT NULL keeps adoption-sideload runs (which carry
      // no DownLoadDate) from wiping the extract age off the header badge.
      pool.query<LastRunRow>(
        `SELECT finished_at, download_date FROM ingest_runs
         WHERE status = 'succeeded' AND download_date IS NOT NULL
         ORDER BY finished_at DESC LIMIT 1`,
      ),
      pool.query<{ status: string }>(
        'SELECT status FROM ingest_runs ORDER BY started_at DESC, id DESC LIMIT 1',
      ),
      loadStaleHours(),
      pool.query<{ n: number }>('SELECT count(*)::int AS n FROM computed_member'),
      loadClosure(),
      loadOrgSettings(),
    ])

    const subtree = subtreeOrgidsOf(closure)
    const info = await loadOrgInfo(subtree)
    const excluded = new Set(settings.excludedUnits.map(normalizeUnit))
    let orgCount = 0
    for (const orgid of subtree) {
      const unit = info.get(orgid)?.unit ?? ''
      if (!excluded.has(normalizeUnit(unit))) orgCount++
    }

    const lastRun = runRes.rows[0]
    const meta: MetaResponse = {
      appVersion: appVersion(),
      appName: config.APP_NAME,
      lastIngestAt: isoTimestamp(lastRun?.finished_at ?? null),
      downloadDate: isoTimestamp(lastRun?.download_date ?? null),
      memberCount: memberRes.rows[0]?.n ?? 0,
      orgCount,
      // The Home "About the data" panel's next-expected fact (V2-DESIGN-PLAN.md
      // section 5); null when no scheduled fetch is configured.
      ingestSchedule: config.CAPWATCH_FETCH_CRON || null,
      lastRunStatus: lastRunStatusOf(latestRunRes.rows[0]?.status),
      staleAfterHours: staleHours,
    }
    reply.send(meta)
  })
}
