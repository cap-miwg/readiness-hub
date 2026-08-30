/**
 * REST API registration point (index.ts calls registerApi once). Every /api
 * route runs behind requireAuth; admin routes add requireAdmin after it. The
 * global CSRF and access-log hooks are installed by the auth module.
 */

import type { FastifyInstance } from 'fastify'
import { registerMetaRoutes } from './meta.js'
import { registerOrgRoutes } from './orgs.js'
import { registerMemberRoutes } from './members.js'
import { registerFeedbackRoutes } from './feedback.js'
import { registerAdminRoutes } from './admin.js'
import { registerReportRoutes } from './reports.js'
import { registerFindingsRoutes } from './findings.js'
import { registerMyProgressRoutes } from './myProgress.js'
import { registerAnnouncementRoutes } from './announcements.js'
import { registerParticipationRoutes } from './participation.js'
import { registerLogisticsRoutes } from './logistics.js'

export async function registerApi(app: FastifyInstance): Promise<void> {
  registerMetaRoutes(app)
  registerOrgRoutes(app)
  registerMemberRoutes(app)
  registerFeedbackRoutes(app)
  registerAdminRoutes(app)
  registerFindingsRoutes(app)
  registerMyProgressRoutes(app)
  registerAnnouncementRoutes(app)
  registerParticipationRoutes(app)
  registerLogisticsRoutes(app)
  await registerReportRoutes(app)
}
