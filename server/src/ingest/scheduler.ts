import type { FastifyBaseLogger } from 'fastify'

/**
 * Scheduled CAPWATCH fetch. Placeholder; the ingest module implementation
 * replaces this with a node-cron job honoring CAPWATCH_FETCH_CRON and the
 * NHQ blackout window.
 */
export function startScheduler(log: FastifyBaseLogger): void {
  log.info('scheduler: not implemented yet')
}
