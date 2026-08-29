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

/** Server package.json version; the SPA prompts reload on mismatch. */
export function appVersion(): string {
  if (cachedVersion !== null) return cachedVersion
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

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get('/api/meta', { preHandler: requireAuth }, async (_req, reply) => {
    const [runRes, memberRes, closure, settings] = await Promise.all([
      pool.query<LastRunRow>(
        `SELECT finished_at, download_date FROM ingest_runs
         WHERE status = 'succeeded' ORDER BY finished_at DESC LIMIT 1`,
      ),
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
    }
    reply.send(meta)
  })
}
