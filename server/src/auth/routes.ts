import type { FastifyInstance } from 'fastify'

/**
 * Authentication routes: /auth/login, /auth/callback, /auth/logout, /api/me.
 * Placeholder registration; the auth module implementation replaces this.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (_req, reply) => {
    reply.code(501).send({ error: 'auth not implemented yet' })
  })
}
