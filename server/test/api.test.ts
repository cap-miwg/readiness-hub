import { describe, expect, it } from 'vitest'
import {
  SlidingWindowLimiter,
  adoptionUnitKey,
  anchorOrgidOf,
  applyCadetFilters,
  applySeniorFilters,
  buildCadetTiles,
  buildLevelChips,
  buildOrgTree,
  capidFromEmail,
  daysSince,
  fencedBlock,
  isCommandHqType,
  isoDate,
  issueTitleOf,
  normalizeUnit,
  parentEmailOf,
  parseBoolParam,
  parseCadetFilters,
  parseCsvParam,
  parseIntParam,
  parseSeniorFilters,
  primaryEmailOf,
  resolveScopeOrgids,
  restrictedBlock,
  subtreeOrgidsOf,
  viewModeFor,
  type ClosurePair,
  type ContactRecord,
} from '../src/api/util.js'
import type { CadetRow, SeniorLevelId, SeniorRow } from '../src/shared/contracts.js'
import type { Jsonified } from '../src/domain/computedTypes.js'
import type { LevelsProgress } from '../src/domain/senior.js'

// Anchor 100 -> {200, 300}, 300 -> {310}, plus the synthetic UNASSIGNED node
// the ingest always appends under the anchor (ingest/orgTree.ts:127-128).
const CLOSURE: ClosurePair[] = [
  { ancestor: 100, descendant: 100, depth: 0 },
  { ancestor: 200, descendant: 200, depth: 0 },
  { ancestor: 300, descendant: 300, depth: 0 },
  { ancestor: 310, descendant: 310, depth: 0 },
  { ancestor: -1, descendant: -1, depth: 0 },
  { ancestor: 100, descendant: 200, depth: 1 },
  { ancestor: 100, descendant: 300, depth: 1 },
  { ancestor: 300, descendant: 310, depth: 1 },
  { ancestor: 100, descendant: -1, depth: 1 },
  { ancestor: 100, descendant: 310, depth: 2 },
]

describe('org scope resolution from org_closure rows', () => {
  it('finds the anchor as the real ancestor of the UNASSIGNED node', () => {
    expect(anchorOrgidOf(CLOSURE)).toBe(100)
    expect(anchorOrgidOf([])).toBeNull()
  })

  it('lists real subtree orgids from depth-0 rows, excluding -1', () => {
    expect(subtreeOrgidsOf(CLOSURE).sort((a, b) => a - b)).toEqual([100, 200, 300, 310])
  })

  it('anchor descendants scope includes UNASSIGNED members', () => {
    const scope = resolveScopeOrgids(CLOSURE, 100, true)
    expect(scope).not.toBeNull()
    expect([...(scope ?? [])].sort((a, b) => a - b)).toEqual([-1, 100, 200, 300, 310])
  })

  it('non-anchor descendants scope never includes UNASSIGNED', () => {
    expect(resolveScopeOrgids(CLOSURE, 300, true)?.sort((a, b) => a - b)).toEqual([300, 310])
  })

  it('self scope is just the org, and -1 addresses the pseudo-node', () => {
    expect(resolveScopeOrgids(CLOSURE, 300, false)).toEqual([300])
    expect(resolveScopeOrgids(CLOSURE, 100, false)).toEqual([100])
    expect(resolveScopeOrgids(CLOSURE, -1, false)).toEqual([-1])
  })

  it('rejects orgids outside the anchor subtree', () => {
    expect(resolveScopeOrgids(CLOSURE, 999, false)).toBeNull()
    expect(resolveScopeOrgids([], 100, true)).toBeNull()
  })
})

describe('buildOrgTree: exclusions, reparenting, unassigned node', () => {
  const orgInfo = (unit: string, name: string, type = 'Composite Squadron') => ({
    name,
    unit,
    type,
    scope: 'UNIT',
    wing: 'MI',
    region: 'GLR',
  })
  const src = {
    anchorOrgid: 100,
    parents: new Map<number, number>([
      [200, 100],
      [210, 200],
      [300, 100],
      [310, 300],
      [-1, 100],
    ]),
    orgs: new Map([
      [100, orgInfo('001', 'Michigan Wing', 'Wing Headquarters')],
      [200, orgInfo('000', 'Wing Admin Placeholder')],
      [210, orgInfo('207', 'Placed Under Excluded')],
      [300, orgInfo('205', 'Monroe Composite Squadron')],
      [310, orgInfo('401', 'Nested Flight')],
    ]),
    counts: new Map<number, number>([
      [100, 5],
      [300, 30],
      [210, 12],
      [-1, 3],
    ]),
    excludedUnits: ['000', '999'],
  }

  it('drops excluded units and reparents their children to the kept ancestor', () => {
    const tree = buildOrgTree(src)
    expect(tree.orgid).toBe(100)
    const childIds = tree.children.map(c => c.orgid)
    expect(childIds).not.toContain(200)
    expect(childIds).toContain(210)
    expect(childIds).toContain(300)
    const monroe = tree.children.find(c => c.orgid === 300)
    expect(monroe?.children.map(c => c.orgid)).toEqual([310])
    expect(monroe?.memberCount).toBe(30)
  })

  it('appends the Unassigned pseudo-node only when -1 members exist', () => {
    const tree = buildOrgTree(src)
    const last = tree.children[tree.children.length - 1]
    expect(last?.orgid).toBe(-1)
    expect(last?.name).toBe('Unassigned')
    expect(last?.memberCount).toBe(3)

    const without = buildOrgTree({ ...src, counts: new Map([[100, 5]]) })
    expect(without.children.some(c => c.orgid === -1)).toBe(false)
  })

  it('never drops the anchor even when its unit is excluded', () => {
    const tree = buildOrgTree({ ...src, excludedUnits: ['001'] })
    expect(tree.orgid).toBe(100)
  })
})

describe('query param parsing', () => {
  it('parses comma-separated and repeated list params', () => {
    expect(parseCsvParam('a, b,,c')).toEqual(['a', 'b', 'c'])
    expect(parseCsvParam(['a,b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(parseCsvParam(undefined)).toEqual([])
  })

  it('parses booleans and integers strictly', () => {
    expect(parseBoolParam('true')).toBe(true)
    expect(parseBoolParam('1')).toBe(true)
    expect(parseBoolParam('false')).toBe(false)
    expect(parseBoolParam(undefined)).toBe(false)
    expect(parseIntParam('-1')).toBe(-1)
    expect(parseIntParam('310')).toBe(310)
    expect(parseIntParam('12.5')).toBeNull()
    expect(parseIntParam('abc')).toBeNull()
  })

  it('resolves a CAPID only from an all-digit email local part', () => {
    expect(capidFromEmail('507610@miwg.cap.gov')).toBe(507610)
    expect(capidFromEmail('luke.bunge@miwg.cap.gov')).toBeNull()
    expect(capidFromEmail('507610')).toBeNull()
  })

  it('normalizes senior filter params: categories upper, ranks via normalizeRank', () => {
    const f = parseSeniorFilters({
      rankCategory: 'officer,nco',
      rank: 'Captain,Maj',
      trackLevel: 'master',
      levelComplete: 'l2p1',
      levelIncomplete: 'L9',
      dutyAsst: 'PRIMARY',
      promotable: 'true',
    })
    expect(f.rankCategories).toEqual(['OFFICER', 'NCO'])
    expect(f.ranks).toEqual(['CAPT', 'MAJ'])
    expect(f.trackLevels).toEqual(['MASTER'])
    expect(f.levelComplete).toBe('L2P1')
    expect(f.levelIncomplete).toBeNull()
    expect(f.dutyAsst).toBe('primary')
    expect(f.promotable).toBe(true)
  })
})

function levelsFixture(statuses: Partial<Record<SeniorLevelId, string>>): Jsonified<LevelsProgress> {
  const entry = (status: string) => ({
    percent: 0,
    status: status as 'completed',
    approvalStatus: null,
    date: null,
    pathId: null,
    totalReq: 0,
    totalComp: 0,
    legacy: false,
  })
  return {
    L1: entry(statuses.L1 ?? 'not-started'),
    L2P1: entry(statuses.L2P1 ?? 'not-started'),
    L2P2: entry(statuses.L2P2 ?? 'not-started'),
    L3: entry(statuses.L3 ?? 'not-started'),
    L4: entry(statuses.L4 ?? 'not-started'),
    L5: entry(statuses.L5 ?? 'not-started'),
  }
}

function makeSenior(overrides: Partial<SeniorRow>): SeniorRow {
  return {
    capid: 1,
    orgid: 300,
    fullName: 'Capt Doe, Jane',
    nameLast: 'Doe',
    nameFirst: 'Jane',
    rank: 'Capt',
    memberType: 'SENIOR',
    joined: null,
    expiration: null,
    rankDate: null,
    currentLevel: null,
    levelProgress: levelsFixture({}),
    duties: [],
    tracks: [],
    promotion: null,
    promotable: false,
    promotableOn: null,
    tigEligibleOn: null,
    esCounts: { active: 0, training: 0, expired: 0, missing: 0, notApproved: 0 },
    esExpiringCount: 0,
    ...overrides,
  }
}

describe('senior dashboard filters (v1 Index.html:1192-1279 semantics)', () => {
  const captain = makeSenior({ capid: 1, rank: 'Capt' })
  const msgt = makeSenior({ capid: 2, rank: 'MSgt' })
  const sm = makeSenior({ capid: 3, rank: 'SM' })

  it('rank categories match against normalizeRank output', () => {
    const f = parseSeniorFilters({ rankCategory: 'OFFICER' })
    expect(applySeniorFilters([captain, msgt, sm], f).map(r => r.capid)).toEqual([1])
    const nco = parseSeniorFilters({ rankCategory: 'NCO' })
    expect(applySeniorFilters([captain, msgt, sm], nco).map(r => r.capid)).toEqual([2])
    const smCat = parseSeniorFilters({ rankCategory: 'SM' })
    expect(applySeniorFilters([captain, msgt, sm], smCat).map(r => r.capid)).toEqual([3])
  })

  it('specific rank filter normalizes both sides', () => {
    const f = parseSeniorFilters({ rank: 'Captain' })
    expect(applySeniorFilters([captain, msgt], f).map(r => r.capid)).toEqual([1])
  })

  it('track NONE matches trackless members only when no track name is selected', () => {
    const trackless = makeSenior({ capid: 4, tracks: [] })
    const tracked = makeSenior({
      capid: 5,
      tracks: [{ track: 'Communications', trackLevel: 'SENIOR' }],
    })
    const noneOnly = parseSeniorFilters({ trackLevel: 'NONE' })
    expect(applySeniorFilters([trackless, tracked], noneOnly).map(r => r.capid)).toEqual([4])
    const noneWithTrack = parseSeniorFilters({ trackLevel: 'NONE', track: 'Communications' })
    expect(applySeniorFilters([trackless, tracked], noneWithTrack).map(r => r.capid)).toEqual([])
  })

  it('track name + track level must match on the same track (AND)', () => {
    const row = makeSenior({
      capid: 6,
      tracks: [
        { track: 'Communications', trackLevel: 'SENIOR' },
        { track: 'Safety', trackLevel: 'MASTER' },
      ],
    })
    const wrongPair = parseSeniorFilters({ track: 'safety', trackLevel: 'SENIOR' })
    expect(applySeniorFilters([row], wrongPair)).toHaveLength(0)
    const rightPair = parseSeniorFilters({ track: 'safety', trackLevel: 'MASTER' })
    expect(applySeniorFilters([row], rightPair)).toHaveLength(1)
  })

  it('duty filter is a case-insensitive substring; dutyAsst splits primary/assistant', () => {
    const primary = makeSenior({
      capid: 7,
      duties: [
        { duty: 'Deputy Commander for Seniors', asst: false, heldAtOrgid: 300, functArea: null, lvl: null, source: 'senior' },
      ],
    })
    const assistant = makeSenior({
      capid: 8,
      duties: [
        { duty: 'Safety Officer', asst: true, heldAtOrgid: 300, functArea: 'SE', lvl: null, source: 'senior' },
      ],
    })
    const duty = parseSeniorFilters({ duty: 'deputy commander' })
    expect(applySeniorFilters([primary, assistant], duty).map(r => r.capid)).toEqual([7])
    const asst = parseSeniorFilters({ dutyAsst: 'assistant' })
    expect(applySeniorFilters([primary, assistant], asst).map(r => r.capid)).toEqual([8])
    const fa = parseSeniorFilters({ functArea: 'SE' })
    expect(applySeniorFilters([primary, assistant], fa).map(r => r.capid)).toEqual([8])
  })

  it('level chips filter on completed vs not-completed; missing progress never matches', () => {
    const done = makeSenior({ capid: 9, levelProgress: levelsFixture({ L1: 'completed' }) })
    const inProgress = makeSenior({ capid: 10, levelProgress: levelsFixture({ L1: 'in-progress' }) })
    const noProgress = makeSenior({ capid: 11, levelProgress: null })
    const complete = parseSeniorFilters({ levelComplete: 'L1' })
    expect(applySeniorFilters([done, inProgress, noProgress], complete).map(r => r.capid)).toEqual([9])
    const incomplete = parseSeniorFilters({ levelIncomplete: 'L1' })
    expect(applySeniorFilters([done, inProgress, noProgress], incomplete).map(r => r.capid)).toEqual([10])
  })

  it('promotable filter keeps request-time promotable rows only', () => {
    const yes = makeSenior({ capid: 12, promotable: true })
    const no = makeSenior({ capid: 13, promotable: false })
    const f = parseSeniorFilters({ promotable: '1' })
    expect(applySeniorFilters([yes, no], f).map(r => r.capid)).toEqual([12])
  })

  it('buildLevelChips counts complete and incomplete per level', () => {
    const rows = [
      makeSenior({ capid: 14, levelProgress: levelsFixture({ L1: 'completed' }) }),
      makeSenior({ capid: 15, levelProgress: levelsFixture({ L1: 'in-progress' }) }),
      makeSenior({ capid: 16, levelProgress: null }),
    ]
    const chips = buildLevelChips(rows)
    const l1 = chips.find(c => c.level === 'L1')
    expect(l1).toEqual({ level: 'L1', complete: 1, incomplete: 1 })
    expect(chips).toHaveLength(6)
  })
})

function makeCadet(overrides: Partial<CadetRow>): CadetRow {
  return {
    capid: 100,
    orgid: 300,
    fullName: 'C/SSgt Roe, Sam',
    nameLast: 'Roe',
    nameFirst: 'Sam',
    rank: 'C/SSgt',
    memberType: 'CADET',
    joined: null,
    expiration: null,
    phase: '1',
    state: 'IN_PROGRESS',
    stateMessage: null,
    nextAchvId: 4,
    nextAchvPublicNumber: 4,
    tigCompleteOn: null,
    hfzValidUntil: null,
    lastPromotionOn: null,
    daysSincePromotion: null,
    honorCredit: false,
    honorCreditCount: 0,
    duties: [],
    esCounts: { active: 0, training: 0, expired: 0, missing: 0, notApproved: 0 },
    ...overrides,
  }
}

describe('cadet dashboard filters and tiles (v1 AppCadetDashboard.html:90-137)', () => {
  const ready = makeCadet({ capid: 101, state: 'READY', daysSincePromotion: 120, honorCreditCount: 2, phase: '2' })
  const timePending = makeCadet({ capid: 102, state: 'TIME_PENDING', daysSincePromotion: 30, honorCreditCount: 1 })
  const nearly = makeCadet({ capid: 103, state: 'NEARLY_READY', rank: 'C/AMN', phase: '2' })
  const notStarted = makeCadet({
    capid: 104,
    state: 'NOT_STARTED',
    duties: [{ duty: 'Cadet Flight Sergeant', asst: false, heldAtOrgid: 300 }],
  })
  const all = [ready, timePending, nearly, notStarted]

  it('filters by state, rank (exact, case-insensitive), duty substring, and phase', () => {
    expect(applyCadetFilters(all, parseCadetFilters({ state: 'READY' })).map(r => r.capid)).toEqual([101])
    expect(applyCadetFilters(all, parseCadetFilters({ rank: 'c/amn' })).map(r => r.capid)).toEqual([103])
    expect(
      applyCadetFilters(all, parseCadetFilters({ duty: 'flight sergeant' })).map(r => r.capid),
    ).toEqual([104])
    expect(applyCadetFilters(all, parseCadetFilters({ phase: '2' })).map(r => r.capid)).toEqual([101, 103])
  })

  it('tiles: close = TIME_PENDING + NEARLY_READY, honor sums credits, 90+ counts days at grade', () => {
    const tiles = buildCadetTiles(all)
    expect(tiles.ready).toBe(1)
    expect(tiles.close).toBe(2)
    expect(tiles.ninetyPlusDays).toBe(1)
    expect(tiles.honorCredits).toBe(3)
    expect(tiles.phases['1']).toBe(2)
    expect(tiles.phases['2']).toBe(2)
  })
})

describe('PII field gating by role (docs/ARCHITECTURE.md, AuthN/AuthZ)', () => {
  const contacts: ContactRecord[] = [
    { type: 'EMAIL', priority: 'PRIMARY', contact: 'cadet@example.org', doNotContact: false },
    { type: 'CADET PARENT EMAIL', priority: 'PRIMARY', contact: 'parent@example.org', doNotContact: false },
  ]

  it('viewers never receive the restricted block, even when data exists', () => {
    expect(restrictedBlock('viewer', '2009-04-01', 'parent@example.org')).toBeUndefined()
  })

  it('admins receive dob and parent email', () => {
    expect(restrictedBlock('admin', '2009-04-01', 'parent@example.org')).toEqual({
      dob: '2009-04-01',
      parentEmail: 'parent@example.org',
    })
  })

  it('parent email is suppressed when identical to the member email (v1 ModalCadetProfile.html:155-158)', () => {
    expect(parentEmailOf(contacts, 'cadet@example.org')).toBe('parent@example.org')
    const same: ContactRecord[] = [
      { type: 'EMAIL', priority: 'PRIMARY', contact: 'kid@example.org', doNotContact: false },
      { type: 'CADET PARENT EMAIL', priority: 'PRIMARY', contact: 'kid@example.org', doNotContact: false },
    ]
    expect(parentEmailOf(same, 'kid@example.org')).toBeNull()
  })

  it('primary email selection matches type EMAIL, priority PRIMARY, case-insensitively', () => {
    expect(primaryEmailOf(contacts)).toEqual({ email: 'cadet@example.org', doNotContact: false })
    const flagged: ContactRecord[] = [
      { type: 'email', priority: 'primary', contact: 'x@example.org', doNotContact: true },
    ]
    expect(primaryEmailOf(flagged)).toEqual({ email: 'x@example.org', doNotContact: true })
    expect(primaryEmailOf([])).toEqual({ email: null, doNotContact: false })
  })
})

describe('feedback rate limiting and Markdown neutralization', () => {
  it('allows the limit within the window, then blocks, then recovers', () => {
    const limiter = new SlidingWindowLimiter(3, 1000)
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(limiter.wouldAllow('user', t0 + i)).toBe(true)
      limiter.record('user', t0 + i)
    }
    expect(limiter.wouldAllow('user', t0 + 10)).toBe(false)
    expect(limiter.wouldAllow('other', t0 + 10)).toBe(true)
    expect(limiter.wouldAllow('user', t0 + 1001)).toBe(true)
  })

  it('wouldAllow does not consume a slot', () => {
    const limiter = new SlidingWindowLimiter(1, 1000)
    expect(limiter.wouldAllow('u', 0)).toBe(true)
    expect(limiter.wouldAllow('u', 1)).toBe(true)
    limiter.record('u', 2)
    expect(limiter.wouldAllow('u', 3)).toBe(false)
  })

  it('fences user text with a longer fence than any backtick run inside', () => {
    const hostile = 'before\n```\n@everyone do things\n```\nafter'
    const fenced = fencedBlock(hostile)
    expect(fenced.startsWith('````text\n')).toBe(true)
    expect(fenced.endsWith('\n````')).toBe(true)
    expect(fencedBlock('plain')).toBe('```text\nplain\n```')
  })

  it('issue titles strip newlines and backticks and cap length', () => {
    const title = issueTitleOf('bug', 'line one\nline two `code`' + 'x'.repeat(300))
    expect(title.startsWith('Feedback (bug): line one line two code')).toBe(true)
    expect(title.length).toBeLessThanOrEqual('Feedback (bug): '.length + 120)
    expect(title).not.toContain('\n')
    expect(title).not.toContain('`')
  })
})

describe('misc pure helpers', () => {
  it('view mode ports v1 AppUnitOverview.html:1826-1846', () => {
    expect(viewModeFor('Composite Squadron', true)).toBe('operational')
    expect(viewModeFor('Wing Headquarters', false)).toBe('command-only')
    expect(viewModeFor('Group Headquarters', true)).toBe('aggregate')
    expect(isCommandHqType('National Headquarters')).toBe(true)
    expect(isCommandHqType('Cadet Squadron')).toBe(false)
  })

  it('unit keys zero-strip then 3-pad (v1 buildUnitName parity)', () => {
    expect(normalizeUnit('070')).toBe('070')
    expect(normalizeUnit('0205')).toBe('205')
    expect(normalizeUnit('5')).toBe('005')
    expect(normalizeUnit('000')).toBe('000')
    expect(adoptionUnitKey('MI', '070')).toBe('MI-070')
  })

  it('isoDate preserves the calendar date for UTC-midnight and local-midnight Dates', () => {
    expect(isoDate(new Date('2026-08-29T00:00:00.000Z'))).toBe('2026-08-29')
    expect(isoDate(new Date(2026, 7, 29))).toBe('2026-08-29')
    expect(isoDate('2026-08-29')).toBe('2026-08-29')
    expect(isoDate(null)).toBeNull()
  })

  it('daysSince counts elapsed whole days, negative for the future', () => {
    const asOf = new Date('2026-08-29T12:00:00.000Z')
    expect(daysSince(new Date('2026-05-31T12:00:00.000Z'), asOf)).toBe(90)
    expect(daysSince(new Date('2026-08-31T12:00:00.000Z'), asOf)).toBe(-2)
    expect(daysSince(null, asOf)).toBeNull()
  })
})
