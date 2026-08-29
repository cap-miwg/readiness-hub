/**
 * Operational CLI, run inside the app container:
 *   node dist/cli.js ingest <zip-path> [--force] [--dry-run]
 *   node dist/cli.js fetch [--force]      fetch from eServices then ingest
 *   node dist/cli.js seed-demo            load the synthetic demo dataset
 */
import { readFile } from 'node:fs/promises'
import { config } from './config.js'
import { migrate } from './db/migrate.js'
import { pool } from './db/pool.js'
import { fetchCapwatchZip } from './ingest/fetcher.js'
import { ingestZip, type IngestLog, type IngestResult } from './ingest/run.js'
import { seedDemo } from './seed/seedDemo.js'

const log: IngestLog = {
  info: m => console.log(m),
  warn: m => console.warn(m),
  error: m => console.error(m),
}

function refuseDevRealIngest(): void {
  if (config.AUTH_MODE === 'dev' && !config.DEV_ALLOW_REAL_INGEST) {
    throw new Error(
      'AUTH_MODE=dev refuses real-data ingest: dev auth is a user picker, so real member data would sit behind no authentication. Set DEV_ALLOW_REAL_INGEST=true to override, or use seed-demo.',
    )
  }
}

function report(result: IngestResult): void {
  for (const f of result.fileStats) {
    const extras = [
      f.droppedColumns.length > 0 ? `dropped ${f.droppedColumns.length} cols` : null,
      f.rejects > 0 ? `${f.rejects} rejects` : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`  ${f.file} -> ${f.table}: ${f.rows} rows${extras ? ` (${extras})` : ''}`)
  }
  if (result.ok) {
    console.log(
      `ingest ok${result.runId !== null ? ` (run ${result.runId})` : ' (dry run)'}` +
        `${result.anchorOrgid !== null ? `, anchor org ${result.anchorOrgid}` : ''}` +
        `${result.downloadDate ? `, extract of ${result.downloadDate.toISOString()}` : ''}`,
    )
  } else {
    console.error(`ingest aborted: ${result.error}`)
    process.exitCode = 1
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const force = argv.includes('--force')
  const dryRun = argv.includes('--dry-run')
  const positional = argv.filter(a => !a.startsWith('--'))
  const [cmd, zipPath] = positional

  switch (cmd) {
    case 'ingest': {
      if (!zipPath) {
        console.error('usage: cli.js ingest <zip-path> [--force] [--dry-run]')
        process.exitCode = 2
        return
      }
      refuseDevRealIngest()
      await migrate()
      // The one sanctioned disk read of a CAPWATCH zip: an operator-provided
      // path. The pipeline itself never writes zips or entries to disk.
      const zipBuf = await readFile(zipPath)
      report(await ingestZip(zipBuf, { source: 'cli', force, dryRun }, log))
      return
    }
    case 'fetch': {
      refuseDevRealIngest()
      await migrate()
      const fetched = await fetchCapwatchZip()
      if (fetched.kind !== 'ok') {
        console.error(`fetch failed (${fetched.kind}): ${fetched.message}`)
        process.exitCode = 1
        return
      }
      report(await ingestZip(fetched.zip, { source: 'fetch', force, dryRun }, log))
      return
    }
    case 'seed-demo':
      report(await seedDemo(log, { force }))
      return
    default:
      console.error('usage: cli.js <ingest <zip> [--force] [--dry-run] | fetch [--force] | seed-demo>')
      process.exitCode = 2
  }
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
