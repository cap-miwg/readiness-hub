/**
 * Demo seeding: builds the synthetic CAPWATCH zip and pushes it through the
 * real ingest pipeline. Source 'demo' is the one source assertIngestAllowed
 * (ingest/run.ts) accepts in dev auth mode without DEV_ALLOW_REAL_INGEST,
 * because the fixture contains no real member data; every gate, the compute
 * step, and the atomic swap run exactly as they do for a real extract.
 */
import { migrate } from '../db/migrate.js'
import { ingestZip, type IngestLog, type IngestResult } from '../ingest/run.js'
import { DEMO_SEED_DEFAULT, generateDemoZip } from './generateDemo.js'

export interface SeedDemoOptions {
  seed?: number
  /** Overrides the shrink guard when the demo replaces a larger real dataset. */
  force?: boolean
}

export async function seedDemo(log: IngestLog, opts: SeedDemoOptions = {}): Promise<IngestResult> {
  await migrate(log.info)
  const zip = generateDemoZip(opts.seed ?? DEMO_SEED_DEFAULT)
  log.info(`seed-demo: generated synthetic CAPWATCH zip (${zip.length} bytes)`)
  return ingestZip(zip, { source: 'demo', force: opts.force ?? false }, log)
}
