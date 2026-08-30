import { describe, expect, it } from 'vitest'

// config.ts validates env at import time; satisfy it before loading the API
// module (same pattern as authRoutes.test.ts). The pg Pool is constructed
// lazily and never connects in this file.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'
process.env.BASE_URL = 'http://localhost:8080'

const { LATEST_EXTRACT_SQL, withExtractDate } = await import('../src/api/reports.js')
const { generatePromotionEligibilityReport } = await import('../src/reports/generators.js')
const { emptyReportData } = await import('../src/reports/types.js')

const EXTRACT_ISO = '2026-08-28T03:24:16.000Z'

describe('report extract provenance query', () => {
  it('reads the latest succeeded run that carries a DownLoadDate (the /api/meta rule)', () => {
    // The rule has three load-bearing clauses; a drive-by edit to any of them
    // silently changes which extract the exports claim as provenance.
    expect(LATEST_EXTRACT_SQL).toContain('FROM ingest_runs')
    expect(LATEST_EXTRACT_SQL).toContain("status = 'succeeded'")
    expect(LATEST_EXTRACT_SQL).toContain('download_date IS NOT NULL')
    expect(LATEST_EXTRACT_SQL).toMatch(/ORDER BY finished_at DESC\s+LIMIT 1/)
    expect(LATEST_EXTRACT_SQL).toMatch(/SELECT download_date/)
  })
})

describe('extractDate injection round-trip', () => {
  const data = emptyReportData({
    asOf: new Date(2026, 7, 29),
    orgid: 200,
    scopeOrgids: new Set([200]),
    orgs: new Map([
      [
        200,
        {
          orgid: 200,
          region: 'GLR',
          wing: 'MI',
          unit: '205',
          nextLevel: null,
          name: 'Test Composite Squadron',
          type: 'COMPOSITE SQUADRON',
          scope: 'UNIT',
        },
      ],
    ]),
  })

  it('adds extractDate to a real generator result without touching its fields', () => {
    const bare = generatePromotionEligibilityReport(data)
    expect(bare.extractDate).toBeUndefined()

    const injected = withExtractDate(bare, EXTRACT_ISO)
    expect(injected.extractDate).toBe(EXTRACT_ISO)
    expect(injected.columns).toEqual(bare.columns)
    expect(injected.rows).toEqual(bare.rows)
    expect(injected.generatedAt).toBe(bare.generatedAt)
    expect(injected.scope).toEqual(bare.scope)
    // The route sends the injected object as JSON; the wire round-trip keeps it.
    const wire = JSON.parse(JSON.stringify(injected)) as Record<string, unknown>
    expect(wire['extractDate']).toBe(EXTRACT_ISO)
  })

  it('carries an explicit null before the first CAPWATCH ingest', () => {
    const injected = withExtractDate(generatePromotionEligibilityReport(data), null)
    expect(injected.extractDate).toBeNull()
    const wire = JSON.parse(JSON.stringify(injected)) as Record<string, unknown>
    expect(wire['extractDate']).toBeNull()
  })
})
