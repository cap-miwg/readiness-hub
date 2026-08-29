/**
 * Operational CLI, run inside the app container:
 *   node dist/cli.js ingest <zip-path>   ingest a CAPWATCH zip
 *   node dist/cli.js fetch               fetch from eServices then ingest
 *   node dist/cli.js seed-demo           load the synthetic demo dataset
 */
import { migrate } from './db/migrate.js'
import { pool } from './db/pool.js'

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  await migrate()
  switch (cmd) {
    case 'ingest':
    case 'fetch':
    case 'seed-demo':
      throw new Error(`${cmd}: not implemented yet`)
    default:
      console.error('usage: cli.js <ingest <zip>|fetch|seed-demo>')
      process.exitCode = 2
  }
  void args
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
