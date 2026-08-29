/**
 * Report endpoints: the catalog list and on-demand generation. Generation is
 * request-time: time-sensitive gates (promotion TIG, expiring windows, QUA
 * fiscal year) re-evaluate against now() rather than the ingest timestamp
 * (docs/ARCHITECTURE.md, Compute).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireAuth } from '../auth/guard.js'
import { listReportMeta, REPORTS_BY_ID } from '../reports/catalog.js'
import { loadReportData } from '../reports/data.js'
import type { ReportsListResponse } from '../shared/reportContracts.js'
import { loadClosure } from './scope.js'
import { anchorOrgidOf, parseBoolParam, parseIntParam, resolveScopeOrgids } from './util.js'

async function handleReport(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = req.params as Record<string, unknown>
  const id = typeof params['id'] === 'string' ? params['id'] : ''
  const def = REPORTS_BY_ID.get(id)
  if (def === undefined) {
    reply.code(404).send({ error: `unknown report id '${id}'` })
    return
  }

  const query = req.query as Record<string, unknown>
  const descendants = parseBoolParam(query['descendants'])
  const closure = await loadClosure()
  const anchorOrgid = anchorOrgidOf(closure)
  if (anchorOrgid === null) {
    reply.code(404).send({ error: 'no dataset ingested yet' })
    return
  }
  let orgid: number
  if (query['orgid'] === undefined) {
    orgid = anchorOrgid
  } else {
    const parsed = parseIntParam(query['orgid'])
    if (parsed === null) {
      reply.code(400).send({ error: 'orgid must be an integer' })
      return
    }
    orgid = parsed
  }
  const scopeOrgids = resolveScopeOrgids(closure, orgid, descendants)
  if (scopeOrgids === null) {
    reply.code(404).send({ error: `org ${orgid} is not in the anchor subtree` })
    return
  }
  const cacScopeOrgids = resolveScopeOrgids(closure, orgid, true) ?? [orgid]

  const data = await loadReportData(def.needs, {
    orgid,
    descendants,
    scopeOrgids,
    cacScopeOrgids,
    role: req.rhSession?.role ?? 'viewer',
    asOf: new Date(),
  })
  reply.send(def.generate(data))
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/reports', { preHandler: requireAuth }, async (): Promise<ReportsListResponse> => {
    return { reports: listReportMeta() }
  })
  app.get('/api/reports/:id', { preHandler: requireAuth }, handleReport)
}
