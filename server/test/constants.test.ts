import { describe, expect, it } from 'vitest'
import v1 from '../src/domain/constants/v1-constants.json' with { type: 'json' }
import {
  ES_ACHIEVEMENT_IDS,
  ES_ACHV_TO_POSITION,
  ES_AGE_REQUIREMENTS,
  ES_DASHBOARD_SPECIAL,
  ES_EXCLUDED_ACHIEVEMENT_IDS,
  ES_NO_SKILLS_EVALUATOR_IDS,
  ES_POSITION_TO_ACHV,
  ES_PREREQUISITE_SPECIAL_CASES,
  ES_READINESS_THRESHOLDS,
  ES_READINESS_WEIGHTS,
  ES_TEAM_REQUIREMENTS,
  LEVELS,
  LEVEL2_TASK_TRACKS,
  LEVEL2_TRACK_CHOICES,
  LEVEL_ORDER,
  MODERATED_LOOKUP,
  PROMOTION_RULES,
  normalizeRank,
  normalizeTaskName,
  normalizeTrackDisplayName,
  v1PromotionRules,
  type LevelId,
} from '../src/domain/constants/index.js'

describe('SET/ICUT landmine (v1 ConfigConstants.html:79-81)', () => {
  it('v1 shipped the wrong SET id, admitted in a comment', () => {
    expect(v1.ES_ACHIEVEMENT_IDS.SET).toBe('217')
    expect(v1.ES_ACHIEVEMENT_IDS.SET_ACTUAL).toBe('124')
  })

  it('v2 exports SET = 124 and ICUT = 217', () => {
    expect(ES_ACHIEVEMENT_IDS.SET).toBe(124)
    expect(ES_ACHIEVEMENT_IDS.SET_ACTUAL).toBe(124)
    expect(ES_ACHIEVEMENT_IDS.ICUT).toBe(217)
    expect(ES_DASHBOARD_SPECIAL.SE_TRAINING).toBe(124)
  })
})

describe('ES constant integrity', () => {
  it('every ES_TEAM_REQUIREMENTS achievement id is present in ES_ACHV_TO_POSITION', () => {
    const teamIds = new Set<number>()
    for (const id of Object.values(ES_TEAM_REQUIREMENTS.fieldOps.achvIds)) teamIds.add(id)
    for (const id of Object.values(ES_TEAM_REQUIREMENTS.aircrew.achvIds)) teamIds.add(id)
    for (const id of Object.values(ES_TEAM_REQUIREMENTS.suas.achvIds)) teamIds.add(id)
    for (const pos of ES_TEAM_REQUIREMENTS.missionBase.positions) teamIds.add(pos.achvId)
    for (const pos of ES_TEAM_REQUIREMENTS.command.positions) teamIds.add(pos.achvId)

    expect(teamIds.size).toBeGreaterThan(0)
    for (const id of teamIds) {
      expect(ES_ACHV_TO_POSITION.has(id), `AchvID ${id} missing from ES_ACHV_TO_POSITION`).toBe(true)
    }
  })

  it('ES_ACHV_TO_POSITION and ES_POSITION_TO_ACHV are a bijection', () => {
    expect(ES_POSITION_TO_ACHV.size).toBe(ES_ACHV_TO_POSITION.size)
    for (const [id, code] of ES_ACHV_TO_POSITION) {
      expect(ES_POSITION_TO_ACHV.get(code)).toBe(id)
    }
  })

  it('team-displayed ids are never on the excluded list', () => {
    for (const id of ES_ACHV_TO_POSITION.keys()) {
      expect(ES_EXCLUDED_ACHIEVEMENT_IDS.has(id), `AchvID ${id} is excluded but displayed`).toBe(false)
    }
  })

  it('integer conversions round-trip the v1 string values', () => {
    expect([...ES_EXCLUDED_ACHIEVEMENT_IDS].sort((a, b) => a - b)).toEqual(
      v1.ES_EXCLUDED_ACHIEVEMENT_IDS.map(Number).sort((a, b) => a - b),
    )
    expect([...ES_NO_SKILLS_EVALUATOR_IDS].sort((a, b) => a - b)).toEqual(
      v1.ES_NO_SKILLS_EVALUATOR_IDS.map(Number).sort((a, b) => a - b),
    )
    expect(ES_AGE_REQUIREMENTS.get(69)).toBe(18)
    expect(ES_AGE_REQUIREMENTS.get(61)).toBe(21)
    expect(ES_AGE_REQUIREMENTS.size).toBe(Object.keys(v1.ES_AGE_REQUIREMENTS).length)
  })

  it('special prerequisite cases converted with integer ids', () => {
    expect([...ES_PREREQUISITE_SPECIAL_CASES.keys()].sort((a, b) => a - b)).toEqual([44, 53, 64, 257])
    const ges = ES_PREREQUISITE_SPECIAL_CASES.get(53)
    expect(ges?.specialPrereqs).toEqual([
      { type: 'CONDITIONAL_MEMBER_TYPE', seniorAchvId: 96, cadetAchvId: 95 },
      { type: 'TASK', taskId: 131 },
    ])
    const psc = ES_PREREQUISITE_SPECIAL_CASES.get(64)
    expect(psc?.specialPrereqs).toEqual([
      {
        type: 'OR_WITH_CROSS_TRAINING',
        options: [
          { achvId: 67, crossTraining: [70, 71] },
          { achvId: 68, crossTraining: [55] },
        ],
      },
    ])
    const uasmp = ES_PREREQUISITE_SPECIAL_CASES.get(257)
    expect(uasmp?.specialPrereqs).toEqual([
      { type: 'TASK', taskId: 1502 },
      { type: 'TASK', taskId: 1544 },
    ])
    const vfr = ES_PREREQUISITE_SPECIAL_CASES.get(44)
    expect(vfr?.specialPrereqs).toEqual([{ type: 'OR', options: [246, 247] }])
  })

  it('readiness weights sum to 1 and thresholds band 80/65/50', () => {
    const sum =
      ES_READINESS_WEIGHTS.teamCapability +
      ES_READINESS_WEIGHTS.qualificationHealth +
      ES_READINESS_WEIGHTS.evaluatorCoverage +
      ES_READINESS_WEIGHTS.riskMitigation +
      ES_READINESS_WEIGHTS.pipelineStrength
    expect(sum).toBeCloseTo(1, 10)
    expect(ES_READINESS_THRESHOLDS).toEqual({ excellent: 80, good: 65, fair: 50 })
  })
})

describe('senior level constants', () => {
  it('LEVEL_ORDER matches the six-level split', () => {
    expect(LEVEL_ORDER).toEqual(['L1', 'L2P1', 'L2P2', 'L3', 'L4', 'L5'])
    expect(LEVELS.find(l => l.id === 'L2P2')?.fallbackMatch).toBe('Level 2')
    expect(LEVELS.find(l => l.id === 'L2P1')?.legacyKey).toBeUndefined()
  })

  it('MODERATED_LOOKUP rebuilt via normalizeTaskName equals the v1-computed lookup', () => {
    const v1Lookup = v1.MODERATED_LOOKUP as Record<string, string[]>
    expect([...MODERATED_LOOKUP.keys()].sort()).toEqual(Object.keys(v1Lookup).sort())
    for (const [levelId, names] of Object.entries(v1Lookup)) {
      const rebuilt = MODERATED_LOOKUP.get(levelId as LevelId)
      expect(rebuilt, `missing level ${levelId}`).toBeDefined()
      expect([...(rebuilt as ReadonlySet<string>)].sort()).toEqual([...names].sort())
    }
  })

  it('normalizeTaskName strips everything but A-Z0-9 and uppercases', () => {
    expect(normalizeTaskName("Commander's Intent")).toBe('COMMANDERSINTENT')
    expect(normalizeTaskName('Customs, Courtesies, and Ceremonies')).toBe('CUSTOMSCOURTESIESANDCEREMONIES')
    expect(normalizeTaskName(null)).toBe('')
    expect(normalizeTaskName(undefined)).toBe('')
  })

  it('normalizeTrackDisplayName only rewrites the IT officer variant', () => {
    expect(normalizeTrackDisplayName('Information Technology Officer')).toBe('INFORMATION TECHNOLOGY')
    expect(normalizeTrackDisplayName('SAFETY')).toBe('SAFETY')
    expect(normalizeTrackDisplayName(null)).toBeNull()
  })

  it('LEVEL2 maps use integer TaskID keys', () => {
    expect(LEVEL2_TRACK_CHOICES.get(190)).toBe('CADET')
    expect(LEVEL2_TRACK_CHOICES.get(269)).toBe('NEW')
    expect(LEVEL2_TASK_TRACKS.get(19)).toEqual(['MILITARY'])
    expect(LEVEL2_TASK_TRACKS.get(26)).toEqual(['NEW', 'MILITARY', 'PROFESSIONAL'])
    expect(LEVEL2_TASK_TRACKS.size).toBe(Object.keys(v1.LEVEL2_TASK_TRACKS).length)
  })
})

describe('promotion rules: corrected vs v1 (CAPR 35-5, MIGRATION-V1.md)', () => {
  it('diffs are exactly the six documented rows', () => {
    // Removed: Lt Col -> Col (special appointment, CAPR 35-5 section 3.2).
    expect(Object.keys(v1PromotionRules).filter(k => !(k in PROMOTION_RULES))).toEqual(['LT COL'])
    expect(Object.keys(PROMOTION_RULES).filter(k => !(k in v1PromotionRules))).toEqual([])

    const unchanged = ['2D LT', '1ST LT', 'FO', 'TFO', 'SSGT', 'TSGT', 'SMSGT']
    for (const key of unchanged) {
      expect(PROMOTION_RULES[key], `rule ${key} should be unchanged`).toEqual(v1PromotionRules[key])
    }

    // SFO: fig 2 says Captain needs 30 months as 1st Lt or SFO (v1 had 0).
    expect(PROMOTION_RULES['SFO']).toEqual({ ...v1PromotionRules['SFO'], tigMonths: 30 })
    // CAPT: fig 2 says 4 years (v1 had 36 months).
    expect(PROMOTION_RULES['CAPT']).toEqual({ ...v1PromotionRules['CAPT'], tigMonths: 48 })
    // MAJ: fig 2 says 5 years (v1 had 48 months).
    expect(PROMOTION_RULES['MAJ']).toEqual({ ...v1PromotionRules['MAJ'], tigMonths: 60 })
    // SM: fig 2 adds 6 months as a member (v1 had no membership minimum).
    expect(PROMOTION_RULES['SM']).toEqual({ ...v1PromotionRules['SM'], minMembershipMonths: 6 })
    // MSGT: fig 9 wording for the duty label; everything else identical.
    expect(PROMOTION_RULES['MSGT']).toEqual({
      ...v1PromotionRules['MSGT'],
      dutyReq: 'Squadron/Flight NCO',
    })
  })

  it('normalizeRank maps CAPWATCH rank spellings to rule keys', () => {
    expect(normalizeRank('Capt')).toBe('CAPT')
    expect(normalizeRank('Captain')).toBe('CAPT')
    expect(normalizeRank('2d Lt')).toBe('2D LT')
    expect(normalizeRank('Second Lieutenant')).toBe('2D LT')
    expect(normalizeRank('Lt Col')).toBe('LT COL')
    expect(normalizeRank('Senior Member')).toBe('SM')
    expect(normalizeRank('SMSgt')).toBe('SMSGT')
    expect(normalizeRank('Senior Master Sergeant')).toBe('SMSGT')
    expect(normalizeRank(null)).toBe('')
  })

  it('Lt Col has no duty-performance promotion path in v2', () => {
    expect(PROMOTION_RULES[normalizeRank('Lt Col')]).toBeUndefined()
  })
})
