/**
 * Ingest orchestration: zip -> parse -> gates -> staging load -> compute ->
 * atomic swap, serialized behind one Postgres advisory lock so the scheduler,
 * an admin upload, and the CLI can never run concurrently
 * (docs/ARCHITECTURE.md, Ingest).
 */
import type pg from 'pg'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { runCompute } from '../domain/compute.js'
import { ADOPTION_TABLES, TABLES } from './tables.js'
import { parseCsvTable, parseDownloadDate, type ParsedTable } from './parse.js'
import { DOWNLOAD_DATE_FILE, extractRegistryFiles } from './zip.js'
import { buildOrgClosure, type OrgTreeResult } from './orgTree.js'
import {
  INCOMING_SUFFIX,
  checkRequiredTables,
  checkShrinkGuard,
  dropIncomingTables,
  getPreviousCounts,
  loadParsedTable,
  rebuildOrgClosure,
  swapIncomingTables,
  type IngestLog,
} from './load.js'

export type { IngestLog } from './load.js'

export const INGEST_LOCK_KEY = 727002

export type IngestSource = 'upload' | 'fetch' | 'cli' | 'demo'

export interface IngestOptions {
  source: IngestSource
  force?: boolean
  dryRun?: boolean
}

export interface FileStat {
  file: string
  table: string
  rows: number
  droppedColumns: string[]
  rejects: number
}

export interface IngestResult {
  ok: boolean
  runId: number | null
  downloadDate: Date | null
  anchorOrgid: number | null
  fileStats: FileStat[]
  skippedEntries: string[]
  error: string | null
}

const consoleLog: IngestLog = {
  info: m => console.log(m),
  warn: m => console.warn(m),
  error: m => console.error(m),
}

function assertIngestAllowed(source: IngestSource): void {
  // Dev auth mode is a user picker; refuse real member data unless the
  // operator opted in explicitly. The synthetic demo fixture is always fine.
  if (config.AUTH_MODE === 'dev' && !config.DEV_ALLOW_REAL_INGEST && source !== 'demo') {
    throw new Error(
      'AUTH_MODE=dev refuses real-data ingest. Set DEV_ALLOW_REAL_INGEST=true to override, or use the demo fixture.',
    )
  }
}

/** Sanitized for ingest_runs.error: our own messages carry file/reason, never row content. */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.slice(0, 1000)
}

function fileStatsOf(parsed: readonly ParsedTable[]): FileStat[] {
  return parsed.map(p => ({
    file: p.file,
    table: p.table,
    rows: p.rows.length,
    droppedColumns: p.dropped.columns,
    rejects: p.dropped.rejects,
  }))
}

function columnValues(parsed: ParsedTable, column: string): (number | null)[] {
  const idx = parsed.columns.indexOf(column)
  if (idx === -1) return []
  return parsed.rows.map(r => {
    const v = r[idx]
    return typeof v === 'number' ? v : null
  })
}

function deriveOrgTree(parsedByTable: ReadonlyMap<string, ParsedTable>): OrgTreeResult {
  const organizations = parsedByTable.get('organizations')
  const members = parsedByTable.get('members')
  if (!organizations || !members) {
    throw new Error('org tree: organizations and members must both be present')
  }
  const orgids = columnValues(organizations, 'orgid')
  const nextLevels = columnValues(organizations, 'next_level')
  const orgs = orgids.flatMap((orgid, i) =>
    orgid === null ? [] : [{ orgid, nextLevel: nextLevels[i] ?? null }],
  )
  const homeOrgids = columnValues(members, 'orgid').filter((v): v is number => v !== null)
  return buildOrgClosure(orgs, homeOrgids, config.ANCHOR_ORGID)
}

async function insertRunRow(
  client: pg.PoolClient,
  source: IngestSource,
  forced: boolean,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO ingest_runs (status, source, forced) VALUES ('running', $1, $2) RETURNING id`,
    [source, forced],
  )
  return res.rows[0].id as number
}

interface RunOutcome {
  status: 'succeeded' | 'failed' | 'aborted'
  error: string | null
  downloadDate: Date | null
  fileStats: FileStat[]
  skippedEntries: string[]
}

async function finishRunRow(client: pg.PoolClient, runId: number, outcome: RunOutcome): Promise<void> {
  await client.query(
    `UPDATE ingest_runs
     SET status = $2, finished_at = now(), error = $3, download_date = $4, file_stats = $5
     WHERE id = $1`,
    [
      runId,
      outcome.status,
      outcome.error,
      outcome.downloadDate,
      JSON.stringify({ files: outcome.fileStats, skippedEntries: outcome.skippedEntries }),
    ],
  )
}

export async function ingestZip(
  zipBuf: Buffer,
  opts: IngestOptions,
  log: IngestLog = consoleLog,
): Promise<IngestResult> {
  assertIngestAllowed(opts.source)

  const { files, skipped } = extractRegistryFiles(zipBuf)
  for (const name of skipped) log.info(`ingest: skipping unregistered zip entry ${name}`)

  const parsedByTable = new Map<string, ParsedTable>()
  for (const spec of TABLES) {
    const buf = files.get(spec.file)
    if (!buf) continue
    const parsed = parseCsvTable(spec, buf)
    parsedByTable.set(parsed.table, parsed)
    if (parsed.dropped.columns.length > 0) {
      log.info(`ingest: ${spec.file} dropped columns ${parsed.dropped.columns.join(', ')}`)
    }
    if (parsed.dropped.rejects > 0) {
      log.warn(`ingest: ${spec.file} counted ${parsed.dropped.rejects} rejects`)
    }
  }
  const downloadBuf = files.get(DOWNLOAD_DATE_FILE)
  const downloadDate = downloadBuf ? parseDownloadDate(downloadBuf) : null
  const fileStats = fileStatsOf([...parsedByTable.values()])
  const parsedList = [...parsedByTable.values()]

  const base: Omit<IngestResult, 'ok' | 'runId' | 'error' | 'anchorOrgid'> = {
    downloadDate,
    fileStats,
    skippedEntries: skipped,
  }

  if (opts.dryRun) {
    const required = checkRequiredTables(parsedByTable)
    if (!required.ok) return { ...base, ok: false, runId: null, anchorOrgid: null, error: required.reason }
    const client = await pool.connect()
    let shrink: ReturnType<typeof checkShrinkGuard>
    let tree: OrgTreeResult
    try {
      const newCounts = new Map(parsedList.map(p => [p.table, p.rows.length]))
      shrink = checkShrinkGuard(newCounts, await getPreviousCounts(client), opts.force ?? false)
      tree = deriveOrgTree(parsedByTable)
    } finally {
      client.release()
    }
    if (!shrink.ok) return { ...base, ok: false, runId: null, anchorOrgid: null, error: shrink.reason }
    log.info(`ingest: dry run ok, anchor ${tree.anchorOrgid}`)
    return { ...base, ok: true, runId: null, anchorOrgid: tree.anchorOrgid, error: null }
  }

  const client = await pool.connect()
  let runId: number | null = null
  try {
    await client.query('SELECT pg_advisory_lock($1)', [INGEST_LOCK_KEY])
    try {
      await dropIncomingTables(client) // leftovers from a crashed earlier run
      runId = await insertRunRow(client, opts.source, opts.force ?? false)

      const required = checkRequiredTables(parsedByTable)
      if (!required.ok) {
        await finishRunRow(client, runId, { status: 'aborted', error: required.reason, downloadDate, fileStats, skippedEntries: skipped })
        log.error(`ingest: aborted: ${required.reason}`)
        return { ...base, ok: false, runId, anchorOrgid: null, error: required.reason }
      }
      const newCounts = new Map(parsedList.map(p => [p.table, p.rows.length]))
      const shrink = checkShrinkGuard(newCounts, await getPreviousCounts(client), opts.force ?? false)
      if (!shrink.ok) {
        await finishRunRow(client, runId, { status: 'aborted', error: shrink.reason, downloadDate, fileStats, skippedEntries: skipped })
        log.error(`ingest: aborted: ${shrink.reason}`)
        return { ...base, ok: false, runId, anchorOrgid: null, error: shrink.reason }
      }

      const tree = deriveOrgTree(parsedByTable)
      log.info(`ingest: anchor org ${tree.anchorOrgid}, subtree of ${tree.subtreeOrgids.size} orgs`)

      for (const parsed of parsedList) await loadParsedTable(client, parsed, log)
      await runCompute(client, INCOMING_SUFFIX, log)

      await client.query('BEGIN')
      try {
        await swapIncomingTables(client, log)
        await rebuildOrgClosure(client, tree.closureRows)
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      }

      await finishRunRow(client, runId, { status: 'succeeded', error: null, downloadDate, fileStats, skippedEntries: skipped })
      log.info(`ingest: run ${runId} succeeded (${fileStats.reduce((n, f) => n + f.rows, 0)} rows)`)
      return { ...base, ok: true, runId, anchorOrgid: tree.anchorOrgid, error: null }
    } catch (err) {
      await dropIncomingTables(client).catch(() => {})
      if (runId !== null) {
        await finishRunRow(client, runId, {
          status: 'failed',
          error: sanitizeError(err),
          downloadDate,
          fileStats,
          skippedEntries: skipped,
        }).catch(() => {})
      }
      throw err
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]).catch(() => {})
    client.release()
  }
}

/**
 * Google adoption sideload: the two Apps Script CSVs, same parse rules and the
 * same staging+swap pattern, but no gates, no compute, and no closure rebuild.
 * Buffers are keyed by the registry filename (GoogleAdoptionStats.csv,
 * GoogleAdoptionUsers.csv).
 */
export async function ingestAdoptionCsvs(
  buffers: ReadonlyMap<string, Buffer>,
  opts: IngestOptions,
  log: IngestLog = consoleLog,
): Promise<IngestResult> {
  assertIngestAllowed(opts.source)

  const parsedList: ParsedTable[] = []
  for (const spec of ADOPTION_TABLES) {
    const buf = buffers.get(spec.file)
    if (!buf) continue
    parsedList.push(parseCsvTable(spec, buf))
  }
  if (parsedList.length === 0) {
    throw new Error(
      `adoption ingest: no recognized files; expected ${ADOPTION_TABLES.map(t => t.file).join(' or ')}`,
    )
  }
  const fileStats = fileStatsOf(parsedList)

  const client = await pool.connect()
  let runId: number | null = null
  try {
    await client.query('SELECT pg_advisory_lock($1)', [INGEST_LOCK_KEY])
    try {
      await dropIncomingTables(client)
      runId = await insertRunRow(client, opts.source, opts.force ?? false)
      for (const parsed of parsedList) await loadParsedTable(client, parsed, log)
      await client.query('BEGIN')
      try {
        await swapIncomingTables(client, log)
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      }
      await finishRunRow(client, runId, { status: 'succeeded', error: null, downloadDate: null, fileStats, skippedEntries: [] })
      log.info(`ingest: adoption run ${runId} succeeded`)
      return { ok: true, runId, downloadDate: null, anchorOrgid: null, fileStats, skippedEntries: [], error: null }
    } catch (err) {
      await dropIncomingTables(client).catch(() => {})
      if (runId !== null) {
        await finishRunRow(client, runId, {
          status: 'failed',
          error: sanitizeError(err),
          downloadDate: null,
          fileStats,
          skippedEntries: [],
        }).catch(() => {})
      }
      throw err
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]).catch(() => {})
    client.release()
  }
}
