import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config } from './config.js'
import { migrate } from './db/migrate.js'
import { pool } from './db/pool.js'

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')

/**
 * Dev auth is a user picker; refusing to boot over a database that holds real
 * (non-demo) member data closes the gap where data was ingested legitimately
 * and the deployment later flipped to AUTH_MODE=dev.
 */
async function refuseDevOverRealData(): Promise<void> {
  if (config.AUTH_MODE !== 'dev' || config.DEV_ALLOW_REAL_INGEST) return
  const res = await pool.query(
    `SELECT id FROM ingest_runs
     WHERE status = 'succeeded' AND source NOT IN ('demo') AND download_date IS NOT NULL
     LIMIT 1`,
  )
  if ((res.rowCount ?? 0) > 0) {
    throw new Error(
      'AUTH_MODE=dev refuses to serve real member data: the database contains a succeeded ' +
        'non-demo CAPWATCH ingest, and dev auth is an unauthenticated user picker. Either set ' +
        'AUTH_MODE=google (real authentication), set DEV_ALLOW_REAL_INGEST=true for local ' +
        'analysis on a localhost bind, or run docker compose down -v to drop the data.',
    )
  }
}

async function main() {
  if (config.AUTH_MODE === 'dev' && config.GOOGLE_CLIENT_ID) {
    throw new Error(
      'AUTH_MODE=dev with GOOGLE_CLIENT_ID set looks like a misconfigured production deployment. Set AUTH_MODE=google.',
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

  // Deployment logo slot (V2-DESIGN-PLAN.md D12): serves the volume-mounted
  // official mark; 404 lets the web app fall back to its neutral placeholder.
  app.get('/brand/logo', async (_req, reply) => {
    const file = config.BRAND_LOGO_FILE
    if (!file || !existsSync(file)) {
      reply.code(404).send({ error: 'no logo configured' })
      return
    }
    const type = file.endsWith('.svg')
      ? 'image/svg+xml'
      : file.endsWith('.png')
        ? 'image/png'
        : null
    if (!type) {
      reply.code(404).send({ error: 'unsupported logo format (svg or png)' })
      return
    }
    const { readFile } = await import('node:fs/promises')
    const body = await readFile(file)
    reply.header('cache-control', 'public, max-age=3600').type(type).send(body)
  })

  await migrate(msg => app.log.info(msg))
  await refuseDevOverRealData()

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
