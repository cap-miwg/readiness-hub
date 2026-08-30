import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool.js'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
)

/**
 * Apply migrations/NNN_*.sql in filename order, exactly once each, recorded in
 * schema_migrations. Guarded by an advisory lock so concurrent app boots
 * (e.g. compose restart races) cannot double-apply.
 */
export async function migrate(log: (msg: string) => void = console.log): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(727001)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)
    const applied = new Set(
      (await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name as string),
    )
    let files: string[] = []
    try {
      files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort()
    } catch {
      log('no migrations directory; skipping')
      return
    }
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      log(`applying migration ${file}`)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`migration ${file} failed: ${(err as Error).message}`)
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {})
    client.release()
  }
}
