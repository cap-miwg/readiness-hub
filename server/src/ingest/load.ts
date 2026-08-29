/**
 * Staging + atomic-rename loader. TRUNCATE-and-refill would take ACCESS
 * EXCLUSIVE and block every reader for the whole load, so rows bulk-insert
 * into <table>__incoming and a final sub-second transaction drops the old
 * tables and renames (docs/ARCHITECTURE.md, Ingest). Pure SQL/gate builders
 * are exported separately from the client-driven executors so they unit-test
 * without a database.
 */
import type pg from 'pg'
import { TABLES } from './tables.js'
import type { CellValue, ParsedTable } from './parse.js'
import type { ClosureRow } from './orgTree.js'

export const INCOMING_SUFFIX = '__incoming'

/** Postgres caps bind parameters at 65535 per statement; stay safely under. */
export const MAX_INSERT_PARAMS = 59999

export const SHRINK_GUARD_TABLES = ['members', 'mbr_tasks', 'mbr_achievements'] as const
/** A row-count shrink greater than this fraction versus the previous run aborts unless forced. */
export const SHRINK_ABORT_FRACTION = 0.4

export type GateResult = { ok: true } | { ok: false; reason: string }

export interface IngestLog {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

export function stagingName(table: string): string {
  return `${table}${INCOMING_SUFFIX}`
}

/** DDL to (re)create the staging table, inheriting columns and indexes. */
export function createStagingSql(table: string): string[] {
  const staging = stagingName(table)
  return [
    `DROP TABLE IF EXISTS ${quoteIdent(staging)}`,
    `CREATE TABLE ${quoteIdent(staging)} (LIKE ${quoteIdent(table)} INCLUDING ALL)`,
  ]
}

/** Every required table present and non-empty, else the run aborts. */
export function checkRequiredTables(parsed: ReadonlyMap<string, ParsedTable>): GateResult {
  const problems: string[] = []
  for (const spec of TABLES) {
    if (!spec.required) continue
    const table = parsed.get(spec.table)
    if (!table) problems.push(`${spec.file} missing`)
    else if (table.rows.length === 0) problems.push(`${spec.file} empty`)
  }
  if (problems.length > 0) return { ok: false, reason: `required tables failed: ${problems.join(', ')}` }
  return { ok: true }
}

/**
 * Row-count shrink guard on the tables every surface depends on. A partial
 * NHQ extract must not silently replace a full one.
 */
export function checkShrinkGuard(
  newCounts: ReadonlyMap<string, number>,
  previousCounts: ReadonlyMap<string, number>,
  force: boolean,
): GateResult {
  const problems: string[] = []
  for (const table of SHRINK_GUARD_TABLES) {
    const previous = previousCounts.get(table) ?? 0
    if (previous <= 0) continue
    const next = newCounts.get(table) ?? 0
    const floor = previous * (1 - SHRINK_ABORT_FRACTION)
    if (next < floor) {
      problems.push(`${table} shrank ${previous} -> ${next} (>${SHRINK_ABORT_FRACTION * 100}%)`)
    }
  }
  if (problems.length === 0) return { ok: true }
  if (force) return { ok: true }
  return { ok: false, reason: `shrink guard: ${problems.join('; ')} (re-run with force to override)` }
}

function toSqlValue(v: CellValue): string | number | boolean | null {
  // Date cells are UTC-midnight Dates; serialize to the calendar date string
  // so node-postgres's local-timezone Date rendering cannot shift the day.
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return v
}

export interface InsertStatement {
  sql: string
  params: (string | number | boolean | null)[]
}

/** Multi-row INSERTs chunked so each statement stays under maxParams binds. */
export function buildInsertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly CellValue[])[],
  maxParams: number = MAX_INSERT_PARAMS,
): InsertStatement[] {
  if (rows.length === 0 || columns.length === 0) return []
  const rowsPerChunk = Math.max(1, Math.floor(maxParams / columns.length))
  const columnList = columns.map(quoteIdent).join(', ')
  const statements: InsertStatement[] = []
  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    const chunk = rows.slice(start, start + rowsPerChunk)
    const params: (string | number | boolean | null)[] = []
    const tuples: string[] = []
    for (const row of chunk) {
      const placeholders: string[] = []
      for (const cell of row) {
        params.push(toSqlValue(cell))
        placeholders.push(`$${params.length}`)
      }
      tuples.push(`(${placeholders.join(', ')})`)
    }
    statements.push({
      sql: `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES ${tuples.join(', ')}`,
      params,
    })
  }
  return statements
}

/** Live row counts for the shrink-guarded tables (the previous run's data). */
export async function getPreviousCounts(
  client: pg.PoolClient,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const table of SHRINK_GUARD_TABLES) {
    const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [table])
    if (!exists.rows[0]?.present) continue
    const res = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdent(table)}`)
    counts.set(table, (res.rows[0]?.n as number) ?? 0)
  }
  return counts
}

/** Stage one parsed table: recreate <table>__incoming and bulk-insert. */
export async function loadParsedTable(
  client: pg.PoolClient,
  parsed: ParsedTable,
  log: IngestLog,
): Promise<void> {
  for (const sql of createStagingSql(parsed.table)) await client.query(sql)
  const statements = buildInsertStatements(stagingName(parsed.table), parsed.columns, parsed.rows)
  for (const stmt of statements) await client.query(stmt.sql, stmt.params)
  log.info(`ingest: staged ${parsed.rows.length} rows into ${stagingName(parsed.table)}`)
}

async function listIncomingTables(client: pg.PoolClient): Promise<string[]> {
  const res = await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = current_schema() AND tablename LIKE '%\\_\\_incoming'`,
  )
  return res.rows.map(r => r.tablename as string)
}

/**
 * Rename every staged table over its live counterpart. Must run inside the
 * caller's transaction so readers flip datasets atomically. Picks up any
 * __incoming table, so computed_*__incoming staged by compute participates in
 * the same swap.
 */
export async function swapIncomingTables(client: pg.PoolClient, log: IngestLog): Promise<void> {
  const incoming = await listIncomingTables(client)
  for (const staged of incoming) {
    const base = staged.slice(0, -INCOMING_SUFFIX.length)
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(base)}`)
    await client.query(`ALTER TABLE ${quoteIdent(staged)} RENAME TO ${quoteIdent(base)}`)
  }
  log.info(`ingest: swapped ${incoming.length} tables`)
}

/** Best-effort cleanup of staging tables after an abort or failure. */
export async function dropIncomingTables(client: pg.PoolClient): Promise<void> {
  for (const staged of await listIncomingTables(client)) {
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(staged)}`).catch(() => {})
  }
}

/**
 * org_closure is derived and small; delete+insert inside the swap transaction
 * keeps it consistent with the dataset that is becoming live.
 */
export async function rebuildOrgClosure(
  client: pg.PoolClient,
  closureRows: readonly ClosureRow[],
): Promise<void> {
  await client.query('DELETE FROM org_closure')
  const rows = closureRows.map(r => [r.ancestorOrgid, r.descendantOrgid, r.depth] as CellValue[])
  const statements = buildInsertStatements('org_closure', [
    'ancestor_orgid',
    'descendant_orgid',
    'depth',
  ], rows)
  for (const stmt of statements) await client.query(stmt.sql, stmt.params)
}
