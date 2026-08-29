/**
 * POST /api/feedback: stored in the feedback table always; mirrored to a
 * GitHub issue only when GITHUB_TOKEN is set (fine-grained, issues:write on
 * one repo). User text is Markdown-neutralized before it reaches GitHub, and
 * the reporter's identity stays server-side (docs/ARCHITECTURE.md, API).
 */

import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import type { FeedbackResponse } from '../shared/contracts.js'
import { SlidingWindowLimiter, issueBodyOf, issueTitleOf } from './util.js'

export const FEEDBACK_USER_LIMIT = 5
export const FEEDBACK_GLOBAL_LIMIT = 30
const WINDOW_MS = 60 * 60 * 1000
const GLOBAL_KEY = '*'

const userLimiter = new SlidingWindowLimiter(FEEDBACK_USER_LIMIT, WINDOW_MS)
const globalLimiter = new SlidingWindowLimiter(FEEDBACK_GLOBAL_LIMIT, WINDOW_MS)

const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'question', 'other']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
})

const GITHUB_REPO = process.env['GITHUB_FEEDBACK_REPO'] ?? 'cap-miwg/readiness-hub'

interface IssueInput {
  id: number
  category: string
  title: string
  body: string
}

/** Fire-and-forget GitHub mirror; failures only log, never affect the reply. */
async function mirrorToGithub(input: IssueInput, token: string, log: FastifyBaseLogger): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'readiness-hub-feedback',
      },
      body: JSON.stringify({
        title: issueTitleOf(input.category, input.title),
        body: issueBodyOf(input.category, input.title, input.body),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      log.warn(`feedback: GitHub mirror failed for feedback ${input.id}: HTTP ${res.status}`)
      return
    }
    const issue = (await res.json()) as { number?: unknown }
    if (typeof issue.number === 'number') {
      await pool.query('UPDATE feedback SET github_issue = $2 WHERE id = $1', [
        input.id,
        issue.number,
      ])
      log.info(`feedback: mirrored feedback ${input.id} to ${GITHUB_REPO}#${issue.number}`)
    }
  } catch (err) {
    log.warn(
      `feedback: GitHub mirror errored for feedback ${input.id}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.post('/api/feedback', { preHandler: requireAuth }, async (req, reply) => {
    const session = req.rhSession
    if (session === undefined) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const parsed = feedbackSchema.safeParse(req.body)
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      reply.code(400).send({ error: `invalid feedback: ${issues}` })
      return
    }

    const now = Date.now()
    if (!userLimiter.wouldAllow(session.email, now) || !globalLimiter.wouldAllow(GLOBAL_KEY, now)) {
      reply.code(429).send({ error: 'feedback rate limit reached, try again later' })
      return
    }
    userLimiter.record(session.email, now)
    globalLimiter.record(GLOBAL_KEY, now)

    const { category, title, body } = parsed.data
    const insert = await pool.query<{ id: number }>(
      `INSERT INTO feedback (email, name, category, title, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int AS id`,
      [session.email, session.name, category, title, body],
    )
    const id = insert.rows[0]?.id
    if (id === undefined) {
      reply.code(500).send({ error: 'feedback insert failed' })
      return
    }

    const token = process.env['GITHUB_TOKEN']
    if (token) {
      void mirrorToGithub({ id, category, title, body }, token, req.log)
    }

    const response: FeedbackResponse = { ok: true, id }
    reply.send(response)
  })
}
