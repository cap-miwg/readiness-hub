import { describe, expect, it } from 'vitest'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const {
  USAGE_DAILY_DAYS,
  USAGE_TOP_ROUTES,
  fillDailySeries,
  normalizeRoute,
  settingsSchema,
  topRoutesOf,
} = await import('../src/api/admin.js')
const { STALE_HOURS_DEFAULT, lastRunStatusOf, parseStaleHours } = await import(
  '../src/api/meta.js'
)

describe('admin settings validation: the staleHours round trip (pure zod)', () => {
  it('accepts staleHours alone within 6..168 whole hours', () => {
    const parsed = settingsSchema.safeParse({ staleHours: 26 })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.staleHours).toBe(26)
    expect(settingsSchema.safeParse({ staleHours: 6 }).success).toBe(true)
    expect(settingsSchema.safeParse({ staleHours: 168 }).success).toBe(true)
  })

  it('rejects out-of-range, fractional, and non-numeric staleHours', () => {
    expect(settingsSchema.safeParse({ staleHours: 5 }).success).toBe(false)
    expect(settingsSchema.safeParse({ staleHours: 169 }).success).toBe(false)
    expect(settingsSchema.safeParse({ staleHours: 26.5 }).success).toBe(false)
    expect(settingsSchema.safeParse({ staleHours: '26' }).success).toBe(false)
  })

  it('stays strict and composes with the org-scoping keys', () => {
    expect(settingsSchema.safeParse({ staleHours: 26, other: true }).success).toBe(false)
    const parsed = settingsSchema.safeParse({
      excludedUnits: ['000'],
      memberTypes: ['CADET'],
      staleHours: 48,
    })
    expect(parsed.success).toBe(true)
  })
})

describe('meta helpers for the as-of ladder', () => {
  it('parseStaleHours reads a stored number and falls back to the default', () => {
    expect(parseStaleHours(48)).toBe(48)
    expect(parseStaleHours(undefined)).toBe(STALE_HOURS_DEFAULT)
    expect(parseStaleHours('48')).toBe(STALE_HOURS_DEFAULT)
    expect(parseStaleHours(0)).toBe(STALE_HOURS_DEFAULT)
    expect(parseStaleHours(999)).toBe(STALE_HOURS_DEFAULT)
  })

  it('lastRunStatusOf surfaces a failed or aborted latest run', () => {
    expect(lastRunStatusOf('succeeded')).toBe('succeeded')
    expect(lastRunStatusOf('failed')).toBe('failed')
    expect(lastRunStatusOf('aborted')).toBe('failed')
    expect(lastRunStatusOf('running')).toBeNull()
    expect(lastRunStatusOf(undefined)).toBeNull()
  })
})

describe('normalizeRoute: access_log routes collapse to stable patterns', () => {
  it('strips query strings', () => {
    expect(normalizeRoute('/api/meta?x=1')).toBe('/api/meta')
    expect(normalizeRoute('/api/orgs?descendants=1')).toBe('/api/orgs')
  })

  it('collapses org-scoped ids to :orgid', () => {
    expect(normalizeRoute('/api/orgs/1234/seniors')).toBe('/api/orgs/:orgid/seniors')
    expect(normalizeRoute('/api/orgs/1234/findings?descendants=1')).toBe(
      '/api/orgs/:orgid/findings',
    )
    expect(normalizeRoute('/api/orgs/-1/cadets')).toBe('/api/orgs/:orgid/cadets')
  })

  it('leaves the bare orgs tree route alone', () => {
    expect(normalizeRoute('/api/orgs')).toBe('/api/orgs')
  })

  it('collapses member capids to :capid', () => {
    expect(normalizeRoute('/api/members/507610')).toBe('/api/members/:capid')
  })

  it('collapses report slugs to :id and leaves the catalog route alone', () => {
    expect(normalizeRoute('/api/reports/promotion?orgid=9')).toBe('/api/reports/:id')
    expect(normalizeRoute('/api/reports')).toBe('/api/reports')
  })

  it('collapses announcement ids to :id', () => {
    expect(normalizeRoute('/api/admin/announcements/17')).toBe('/api/admin/announcements/:id')
    expect(normalizeRoute('/api/admin/announcements')).toBe('/api/admin/announcements')
  })

  it('is idempotent on already-parameterized Fastify route patterns', () => {
    for (const pattern of [
      '/api/orgs/:orgid/overview',
      '/api/members/:capid',
      '/api/reports/:id',
      '/api/admin/announcements/:id',
    ]) {
      expect(normalizeRoute(pattern)).toBe(pattern)
    }
  })

  it('leaves unrelated routes untouched', () => {
    expect(normalizeRoute('/api/me/progress')).toBe('/api/me/progress')
    expect(normalizeRoute('/api/announcements')).toBe('/api/announcements')
    expect(normalizeRoute('/api/admin/usage')).toBe('/api/admin/usage')
  })
})

describe('topRoutesOf: normalized aggregation, ranked, capped', () => {
  it('merges raw and pattern forms of the same route', () => {
    const rows = [
      { route: '/api/orgs/1234/seniors', hits: 3 },
      { route: '/api/orgs/:orgid/seniors', hits: 5 },
      { route: '/api/orgs/9/seniors?duty=IT', hits: 2 },
      { route: '/api/meta', hits: 4 },
    ]
    expect(topRoutesOf(rows, 8)).toEqual([
      { route: '/api/orgs/:orgid/seniors', hits: 10 },
      { route: '/api/meta', hits: 4 },
    ])
  })

  it('ranks by hits then route name, and caps at the limit', () => {
    const rows = [
      { route: '/api/b', hits: 2 },
      { route: '/api/a', hits: 2 },
      { route: '/api/c', hits: 7 },
      { route: '/api/d', hits: 1 },
    ]
    expect(topRoutesOf(rows, 3)).toEqual([
      { route: '/api/c', hits: 7 },
      { route: '/api/a', hits: 2 },
      { route: '/api/b', hits: 2 },
    ])
  })

  it('returns [] on an empty log', () => {
    expect(topRoutesOf([], USAGE_TOP_ROUTES)).toEqual([])
  })
})

describe('fillDailySeries: zero-filled, fixed-length, oldest first', () => {
  it('produces exactly the requested days ending today, with gaps as 0', () => {
    const rows = [
      { day: '2026-08-28', users: 4 },
      { day: '2026-08-30', users: 6 },
    ]
    const series = fillDailySeries(rows, 5, '2026-08-30')
    expect(series).toEqual([
      { day: '2026-08-26', users: 0 },
      { day: '2026-08-27', users: 0 },
      { day: '2026-08-28', users: 4 },
      { day: '2026-08-29', users: 0 },
      { day: '2026-08-30', users: 6 },
    ])
  })

  it('crosses month boundaries correctly', () => {
    const series = fillDailySeries([], 3, '2026-09-01')
    expect(series.map(p => p.day)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  })

  it('drops rows outside the window instead of stretching it', () => {
    const rows = [{ day: '2026-07-01', users: 99 }]
    const series = fillDailySeries(rows, USAGE_DAILY_DAYS, '2026-08-30')
    expect(series).toHaveLength(USAGE_DAILY_DAYS)
    expect(series.every(p => p.users === 0)).toBe(true)
    expect(series[0]?.day).toBe('2026-08-01')
    expect(series[series.length - 1]?.day).toBe('2026-08-30')
  })
})
