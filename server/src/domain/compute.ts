/**
 * Compute step, called by the ingest run with the staging suffix so computed
 * tables participate in the same atomic swap as the mirrors.
 *
 * Stub: the computed-table DDL (003_computed.sql) and the readiness rules body
 * land in a later wave. Until then there are no computed tables to stage, so
 * this is a logged no-op; the swap simply finds no computed_*__incoming tables.
 */
import type pg from 'pg'

export interface ComputeLog {
  info: (msg: string) => void
}

export async function runCompute(
  _client: pg.PoolClient,
  suffix: string,
  log: ComputeLog,
): Promise<void> {
  log.info(`compute: stub, no computed tables staged for suffix ${suffix}`)
}
