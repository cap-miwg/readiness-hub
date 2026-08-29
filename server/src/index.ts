import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config } from './config.js'
import { migrate } from './db/migrate.js'

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')

async function main() {
  if (config.AUTH_MODE === 'dev' && config.GOOGLE_CLIENT_ID) {
    throw new Error(
      'AUTH_MODE=dev with GOOGLE_CLIENT_ID set looks like a misconfigured production deployment. Set AUTH_MODE=google or clear the Google credentials.',
    )
  }
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 })
  if (config.AUTH_MODE === 'dev') {
    app.log.warn(
      'AUTH_MODE=dev: authentication is a user picker. Keep this deployment bound to localhost. Real-data ingest requires DEV_ALLOW_REAL_INGEST=true.',
    )
  }

  await app.register(fastifyCookie, { secret: config.SESSION_SECRET })
  await app.register(fastifyMultipart, {
    limits: { fileSize: 250 * 1024 * 1024, files: 1 },
  })

  app.get('/healthz', async () => {
    const { getIngestHealth } = await import('./ingest/scheduler.js')
    const ingest = await getIngestHealth().catch(() => null)
    return { ok: true, ingest }
  })

  await migrate(msg => app.log.info(msg))

  // Feature modules register themselves here (auth, api, admin, scheduler).
  const { registerAuth } = await import('./auth/routes.js')
  const { registerApi } = await import('./api/routes.js')
  await registerAuth(app)
  await registerApi(app)
  const { startScheduler } = await import('./ingest/scheduler.js')
  startScheduler(app.log)

  // Static SPA (production build). In dev, Vite serves the frontend instead.
  if (existsSync(PUBLIC_DIR)) {
    await app.register(fastifyStatic, { root: PUBLIC_DIR, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/auth')) {
        reply.code(404).send({ error: 'not found' })
        return
      }
      reply.sendFile('index.html')
    })
  }

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
