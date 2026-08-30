import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().default('postgres://readiness:readiness@localhost:5432/readiness'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  AUTH_MODE: z.enum(['dev', 'google']).default('dev'),
  APP_NAME: z.string().default('Readiness Hub'),
  /**
   * Path to the deployment's official logo file (svg/png), volume-mounted.
   * The repo never bundles the trademarked CAP mark (V2-DESIGN-PLAN.md D12);
   * unset -> the web app renders its neutral placeholder.
   */
  BRAND_LOGO_FILE: z.string().default(''),
  BASE_URL: z.string().default('http://localhost:8080'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  ALLOWED_DOMAINS: z.string().default(''),
  ADMIN_EMAILS: z.string().default(''),
  CAPWATCH_ORGID: z.string().default(''),
  ESERVICES_USERNAME: z.string().default(''),
  ESERVICES_PASSWORD: z.string().default(''),
  CAPWATCH_FETCH_CRON: z.string().default(''),
  /** Override the derived org-tree anchor (defaults to the LCA of member home orgs). */
  ANCHOR_ORGID: z.preprocess(
    v => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().int().positive().optional(),
  ),
  /** dev auth mode refuses non-demo ingest unless this is set explicitly. */
  DEV_ALLOW_REAL_INGEST: z
    .string()
    .default('')
    .transform(v => v === 'true' || v === '1'),
  TZ: z.string().default('America/New_York'),
})

export type Config = z.infer<typeof schema> & {
  allowedDomains: string[]
  adminEmails: string[]
}

function load(): Config {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid configuration: ${issues}`)
  }
  const csv = (s: string) =>
    s.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  return {
    ...parsed.data,
    allowedDomains: csv(parsed.data.ALLOWED_DOMAINS),
    adminEmails: csv(parsed.data.ADMIN_EMAILS),
  }
}

export const config = load()
