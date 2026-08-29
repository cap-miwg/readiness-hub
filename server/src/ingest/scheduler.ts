/**
 * Scheduled CAPWATCH fetch. Skipped entirely when CAPWATCH_FETCH_CRON or the
 * eServices credentials are unset. An 'auth' failure persists a marker in
 * app_settings and is never retried until the credentials fingerprint changes
 * or a fetch succeeds elsewhere (admin endpoint, CLI); eServices returns 403
 * for bad credentials, lapsed attestation, and a charter number in the ORGID
 * slot alike, so retrying is pure noise. Transient failures retry up to
 * 2 times, 15 minutes apart, deferred past the NHQ download blackout.
 */
import { createHash } from 'node:crypto'
import cron from 'node-cron'
import type { FastifyBaseLogger } from 'fastify'
import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { fetchCapwatchZip } from './fetcher.js'
import { INGEST_LOCK_KEY, ingestZip, type IngestLog } from './run.js'

export const AUTH_FAILURE_KEY = 'ingest.auth_failure'
export const MAX_TRANSIENT_RETRIES = 2
export const RETRY_DELAY_MS = 15 * 60 * 1000

/** NHQ blocks CAPWATCH downloads 00:00-02:30 America/Chicago (docs/ARCHITECTURE.md, Ingest). */
const BLACKOUT_TZ = 'America/Chicago'
const BLACKOUT_END_MINUTES = 2 * 60 + 30

const blackoutClock = new Intl.DateTimeFormat('en-US', {
  timeZone: BLACKOUT_TZ,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

function minutesIntoChicagoDay(at: Date): number {
  const parts = blackoutClock.formatToParts(at)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

export function isInNhqBlackout(at: Date): boolean {
  return minutesIntoChicagoDay(at) < BLACKOUT_END_MINUTES
}

/** Delay from `from` that lands at least RETRY_DELAY_MS out and outside the blackout. */
export function retryDelayMs(from: Date): number {
  let delay = RETRY_DELAY_MS
  const target = new Date(from.getTime() + delay)
  if (isInNhqBlackout(target)) {
    const remaining = BLACKOUT_END_MINUTES - minutesIntoChicagoDay(target)
    delay += remaining * 60 * 1000 + 60 * 1000
  }
  return delay
}

function credentialsFingerprint(): string {
  // Detects "config changed" across restarts without storing the secret.
  return createHash('sha256')
    .update(`${config.ESERVICES_USERNAME}\n${config.ESERVICES_PASSWORD}\n${config.CAPWATCH_ORGID}`)
    .digest('hex')
}

async function getAuthFailureMarker(): Promise<{ fingerprint?: string } | null> {
  const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [AUTH_FAILURE_KEY])
  return (res.rows[0]?.value as { fingerprint?: string } | undefined) ?? null
}

async function setAuthFailureMarker(message: string): Promise<void> {
  const value = JSON.stringify({
    message,
    at: new Date().toISOString(),
    fingerprint: credentialsFingerprint(),
  })
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [AUTH_FAILURE_KEY, value],
  )
}

/**
 * Any successful fetch proves the credentials work, so every fetch path (the
 * scheduler here, the admin fetch endpoint, the CLI) clears the marker.
 */
export async function clearAuthFailureMarker(): Promise<void> {
  await pool.query('DELETE FROM app_settings WHERE key = $1', [AUTH_FAILURE_KEY])
}

function asIngestLog(log: FastifyBaseLogger): IngestLog {
  return {
    info: m => log.info(m),
    warn: m => log.warn(m),
    error: m => log.error(m),
  }
}

async function runScheduledFetch(log: FastifyBaseLogger, attempt: number): Promise<void> {
  const marker = await getAuthFailureMarker()
  if (marker && marker.fingerprint === credentialsFingerprint()) {
    log.warn(
      'scheduler: skipping fetch, a persisted auth failure is unresolved (fix the credential or ORGID configuration, or clear the marker via a successful fetch; restarting does not help)',
    )
    return
  }

  const result = await fetchCapwatchZip()
  if (result.kind === 'auth') {
    await setAuthFailureMarker(result.message)
    log.error(`scheduler: auth failure, retries stopped until config changes: ${result.message}`)
    return
  }
  if (result.kind === 'transient') {
    if (attempt >= MAX_TRANSIENT_RETRIES) {
      log.error(`scheduler: fetch failed after ${attempt} retries: ${result.message}`)
      return
    }
    const delay = retryDelayMs(new Date())
    log.warn(`scheduler: transient fetch failure, retry ${attempt + 1}/${MAX_TRANSIENT_RETRIES} in ${Math.round(delay / 60000)} min: ${result.message}`)
    const timer = setTimeout(() => {
      runScheduledFetch(log, attempt + 1).catch(err =>
        log.error(`scheduler: retry crashed: ${err instanceof Error ? err.message : String(err)}`),
      )
    }, delay)
    timer.unref()
    return
  }

  await clearAuthFailureMarker()
  try {
    await ingestZip(result.zip, { source: 'fetch' }, asIngestLog(log))
  } catch (err) {
    // Ingest failures are recorded in ingest_runs; re-fetching the same
    // extract would not change the outcome, so no retry here.
    log.error(`scheduler: ingest failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Mark runs left in 'running' by a crash or restart as failed. Guarded by
 * pg_try_advisory_lock on the ingest lock: when another process (a second
 * replica, the CLI) is mid-ingest, its run row legitimately says 'running'
 * and must not be clobbered, so recovery is skipped for this boot.
 */
async function bootRecovery(log: FastifyBaseLogger): Promise<void> {
  const client = await pool.connect()
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [INGEST_LOCK_KEY])
    if (!lock.rows[0]?.locked) {
      log.warn('scheduler: boot recovery skipped, a live ingest holds the lock elsewhere')
      return
    }
    try {
      const res = await client.query(
        `UPDATE ingest_runs SET status = 'failed', finished_at = now(),
           error = 'marked failed at boot: run was left in running state'
         WHERE status = 'running'`,
      )
      if ((res.rowCount ?? 0) > 0) {
        log.warn(`scheduler: boot recovery marked ${res.rowCount} stuck ingest run(s) failed`)
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]).catch(() => {})
    }
  } finally {
    client.release()
  }
}

/**
 * Daily access_log sweep: rows older than the 90-day retention window are
 * deleted. audit_log (admin mutations) is intentionally never pruned.
 */
const ACCESS_LOG_RETENTION_CRON = '30 4 * * *'
export const ACCESS_LOG_RETENTION_DAYS = 90

function startAccessLogSweep(log: FastifyBaseLogger): void {
  cron.schedule(
    ACCESS_LOG_RETENTION_CRON,
    () => {
      pool
        .query(`DELETE FROM access_log WHERE at < now() - interval '90 days'`)
        .then(res => {
          if ((res.rowCount ?? 0) > 0) {
            log.info(`scheduler: pruned ${res.rowCount} access_log rows older than ${ACCESS_LOG_RETENTION_DAYS} days`)
          }
        })
        .catch(err =>
          log.error(`scheduler: access_log sweep failed: ${err instanceof Error ? err.message : String(err)}`),
        )
    },
    { timezone: config.TZ },
  )
}

export function startScheduler(log: FastifyBaseLogger): void {
  bootRecovery(log).catch(err =>
    log.error(`scheduler: boot recovery failed: ${err instanceof Error ? err.message : String(err)}`),
  )

  // Always scheduled, independent of the CAPWATCH fetch configuration.
  startAccessLogSweep(log)

  if (!config.CAPWATCH_FETCH_CRON) {
    log.info('scheduler: CAPWATCH_FETCH_CRON unset, scheduled fetch disabled')
    return
  }
  if (!config.ESERVICES_USERNAME || !config.ESERVICES_PASSWORD || !config.CAPWATCH_ORGID) {
    log.info('scheduler: eServices credentials or CAPWATCH_ORGID unset, scheduled fetch disabled')
    return
  }
  if (!cron.validate(config.CAPWATCH_FETCH_CRON)) {
    log.error(`scheduler: invalid CAPWATCH_FETCH_CRON expression: ${config.CAPWATCH_FETCH_CRON}`)
    return
  }

  cron.schedule(
    config.CAPWATCH_FETCH_CRON,
    () => {
      runScheduledFetch(log, 0).catch(err =>
        log.error(`scheduler: fetch crashed: ${err instanceof Error ? err.message : String(err)}`),
      )
    },
    { timezone: config.TZ },
  )
  log.info(`scheduler: CAPWATCH fetch scheduled (${config.CAPWATCH_FETCH_CRON} ${config.TZ})`)
}

export interface IngestHealth {
  /** finished_at of the last succeeded run, ISO, null before first success. */
  lastRun: string | null
  /** CAPWATCH DownLoadDate of the current dataset. */
  downloadDate: string | null
  /** Age of the current dataset (DownLoadDate, else lastRun), in hours. */
  staleHours: number | null
  authFailure: boolean
}

/** For /healthz wiring so a free uptime monitor can alert on staleness. */
export async function getIngestHealth(): Promise<IngestHealth> {
  // Adoption-sideload runs carry no download_date; staleness tracks the
  // latest run that ingested an actual CAPWATCH extract.
  const runRes = await pool.query(
    `SELECT finished_at, download_date FROM ingest_runs
     WHERE status = 'succeeded' AND download_date IS NOT NULL
     ORDER BY finished_at DESC LIMIT 1`,
  )
  const row = runRes.rows[0] as { finished_at: Date; download_date: Date | null } | undefined
  const marker = await getAuthFailureMarker()
  const freshness = row?.download_date ?? row?.finished_at ?? null
  return {
    lastRun: row ? row.finished_at.toISOString() : null,
    downloadDate: row?.download_date ? row.download_date.toISOString() : null,
    staleHours: freshness
      ? Math.round(((Date.now() - freshness.getTime()) / 3_600_000) * 10) / 10
      : null,
    authFailure: marker !== null,
  }
}
