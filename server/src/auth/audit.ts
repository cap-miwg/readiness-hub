import { pool } from '../db/pool.js'

/** Append one audit_log row. Detail must never contain member data. */
export async function audit(
  actorEmail: string,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    'INSERT INTO audit_log (actor_email, action, detail) VALUES ($1, $2, $3::jsonb)',
    [actorEmail, action, JSON.stringify(detail)],
  )
}
