import { describe, expect, it } from 'vitest'
import type { Jsonified } from '../src/domain/computedTypes.js'
import type { UnitEsAnalysis } from '../src/domain/esUnit.js'

// config.ts validates env at import time; satisfy it before loading modules.
process.env.SESSION_SECRET ??= 'vitest-only-session-secret-0123456789'

const { keepEsNamesFor, sanitizeEsForScope } = await import('../src/api/orgs.js')

function capacity(name: string, memberName: string) {
  return {
    name,
    canField: true,
    teamsPossible: 1,
    positionCounts: {},
    qualifiedMembers: [{ capid: 111, name: memberName, rank: 'Capt', positions: ['GTL'] }],
    gaps: [],
  }
}

/** A minimal jsonb-shaped analysis carrying a name in every gated list. */
function fixtureEs(): Jsonified<UnitEsAnalysis> {
  return {
    orgid: 490,
    memberCount: 3,
    teams: {
      fieldOps: capacity('Field Operations', 'Alice Alpha'),
      aircrew: capacity('Aircrew', 'Bob Bravo'),
      suas: capacity('sUAS', 'Carol Charlie'),
      missionBase: capacity('Mission Base', 'Dan Delta'),
      command: capacity('Command', 'Eve Echo'),
    },
    qualifications: {
      byStatus: { active: 2, training: 1, expired: 1 },
      byFunctionalArea: {},
      expiringWithin90Days: [
        {
          capid: 222,
          name: 'Frank Foxtrot',
          rank: '1st Lt',
          qualification: 'GTM2',
          achvId: 55,
          expiration: '2026-09-15T00:00:00.000Z',
          daysUntil: 16,
          urgency: 'critical',
        },
      ],
      missingGES: [{ capid: 333, name: 'Grace Golf', rank: 'SM' }],
      healthRatio: 50,
    },
    evaluators: {
      available: [
        { capid: 444, name: 'Hank Hotel', rank: 'Maj', canEvaluate: [{ achvId: 55, name: 'GTM2' }] },
      ],
      qualsCovered: [55],
      gaps: [],
      coverage: 100,
      evaluatorCount: 1,
    },
    pipeline: {
      nearQualification: [],
      activeTraining: [
        { capid: 555, name: 'Ivy India', rank: 'C/CMSgt', qualification: 'GTM3', achvId: 56, position: 'GTM3' },
      ],
    },
    risks: {
      singlePointsOfFailure: [
        {
          position: 'GTL',
          positionName: 'Ground Team Leader',
          member: 'Tyler Bielak',
          capid: 657395,
          impact: 'Cannot field any ground teams without GTL',
          severity: 'high',
        },
      ],
      criticalGaps: [],
      recommendations: [
        {
          priority: 'high',
          area: 'Resilience',
          recommendation: 'Train backup Ground Team Leader - Tyler Bielak is single point of failure',
          impact: 'Cannot field any ground teams without GTL',
        },
      ],
    },
    readinessScore: 61,
    readinessRating: 'good',
    readinessComponents: {
      teamScore: 0,
      qualScore: 0,
      evaluatorScore: 0,
      riskScore: 0,
      pipelineScore: 0,
      teamScores: { fieldOps: 0, aircrew: 0, suas: 0, missionBase: 0, command: 0 },
    },
    quickSummary: 'Can field ground team',
  } as unknown as Jsonified<UnitEsAnalysis>
}

describe('keepEsNamesFor: the D9 name gate', () => {
  it('keeps names only at self scope on an operational (non-HQ) org', () => {
    expect(keepEsNamesFor('COMPOSITE SQUADRON', false)).toBe(true)
    expect(keepEsNamesFor('COMPOSITE SQUADRON', true)).toBe(false)
    expect(keepEsNamesFor('WING', false)).toBe(false)
    expect(keepEsNamesFor('GROUP HQ', false)).toBe(false)
    expect(keepEsNamesFor('REGION', true)).toBe(false)
  })
})

describe('sanitizeEsForScope', () => {
  it('passes the analysis through untouched at self operational scope', () => {
    const es = fixtureEs()
    const served = sanitizeEsForScope(es, true)
    expect(served).toBe(es)
    expect(served.risks.singlePointsOfFailure[0]?.member).toBe('Tyler Bielak')
  })

  it('strips the member field from every SPOF entry at wider scopes', () => {
    const served = sanitizeEsForScope(fixtureEs(), false)
    const spof = served.risks.singlePointsOfFailure[0] as Record<string, unknown>
    expect(spof).not.toHaveProperty('member')
    // The position facts survive: that is what the wider scope may see.
    expect(spof['positionName']).toBe('Ground Team Leader')
    expect(spof['severity']).toBe('high')
  })

  it('scrubs the member name out of the SPOF recommendation sentence', () => {
    const served = sanitizeEsForScope(fixtureEs(), false)
    const rec = served.risks.recommendations[0]?.recommendation ?? ''
    expect(rec).not.toContain('Tyler Bielak')
    expect(rec).toBe('Train backup Ground Team Leader - single point of failure')
  })

  it('blanks every other name-carrying list without disturbing counts', () => {
    const served = sanitizeEsForScope(fixtureEs(), false)
    for (const team of Object.values(served.teams)) {
      expect(team.qualifiedMembers.map(m => m.name)).toEqual([''])
      expect(team.qualifiedMembers[0]?.positions).toEqual(['GTL'])
    }
    // Team display names are not member names and survive.
    expect(served.teams.fieldOps.name).toBe('Field Operations')
    expect(served.evaluators.available[0]?.name).toBe('')
    // Qualification names inside canEvaluate are not member names.
    expect(served.evaluators.available[0]?.canEvaluate[0]?.name).toBe('GTM2')
    expect(served.qualifications.expiringWithin90Days[0]?.name).toBe('')
    expect(served.qualifications.expiringWithin90Days[0]?.qualification).toBe('GTM2')
    expect(served.qualifications.missingGES[0]?.name).toBe('')
    expect(served.pipeline.activeTraining[0]?.name).toBe('')
    expect(served.readinessScore).toBe(61)
    expect(served.evaluators.evaluatorCount).toBe(1)
  })
})
