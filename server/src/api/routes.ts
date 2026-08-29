import type { FastifyInstance } from 'fastify'

/**
 * REST API under /api. Placeholder registration; the API module
 * implementation replaces this.
 */
export async function registerApi(app: FastifyInstance): Promise<void> {
  app.get('/api/meta', async (_req, reply) => {
    reply.code(501).send({ error: 'api not implemented yet' })
  })
}
