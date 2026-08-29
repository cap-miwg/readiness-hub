/**
 * The 20 v1 report generators, ported server-side. Each is a pure function
 * (data: ReportData) => ReportResult so tests can drive them with in-memory
 * rowsets. v1 sources are the generate* functions in Index.html; line
 * citations mark the constraints that came from there.
 */

import {
  AEROSPACE_DIMENSIONS_MODULES,
  CADET_MIN_TEST_SCORE,
  CADET_PHASES,
  DUTY_TO_TRACK_MAP,
  ES_ACHIEVEMENT_IDS,
  LEVELS,
  LEVEL_ORDER,
  MODERATED_LOOKUP,
  LEVEL2_TASK_TRACKS,
  PROMOTION_RULES,
  QUA_CAPTAIN_OR_HIGHER_RANKS,
  QUA_ELIGIBLE_UNIT_TYPES,
  QUA_OPERATIONAL_ES_ACHIEVEMENT_IDS,
  QUA_YEAGER_AWARD_NAME,
  normalizeRank,
  type LevelId,
} from '../domain/constants/index.js'
import { phaseFromAchievement } from '../domain/cadet.js'
import type { RequirementKey } from '../domain/constants/index.js'
import { ageAsOf, approachingAge, daysUntil } from '../domain/timeSensitive.js'
import type { ReportColumn, ReportResult } from '../shared/reportContracts.js'
import {
  buildTrainingIndex,
  daysSince,
  daysUntilCeil,
  getCadetProtectionStatus,
  getTlcStatus,
  isAdvancedCpDuty,
  isModeratedTaskForLevel,
  isoDate,
  memberName,
  promotionDetailsNow,
  reviveDate,
  unitDisplayName,
  unitInfoOf,
  type CpStatus,
} from './helpers.js'
import type {
  DutySlice,
  JsonOrgStatsMetrics,
  OrgInfo,
  ReportData,
  ReportMember,
} from './types.js'

type Row = Record<string, unknown>

function col(key: string, header: string): ReportColumn {
  return { key, header }
}

function finish(
  data: ReportData,
  columns: ReportColumn[],
  rows: Row[],
  memberCount: number,
  meta?: Record<string, unknown>,
): ReportResult {
  const result: ReportResult = {
    columns,
    rows,
    generatedAt: data.asOf.toISOString(),
    scope: {
      orgid: data.orgid,
      descendants: data.descendants,
      orgName: unitDisplayName(data.orgs, data.orgid),
      memberCount,
    },
  }
  if (meta !== undefined) result.meta = meta
  return result
}

const seniorsOf = (data: ReportData): ReportMember[] => data.members.filter(m => m.isSeniorScope)
const cadetsOf = (data: ReportData): ReportMember[] => data.members.filter(m => m.isCadetScope)
const bothOf = (data: ReportData): ReportMember[] =>
  data.members.filter(m => m.isSeniorScope || m.isCadetScope)

function groupByCapid<T extends { capid: number }>(rows: readonly T[]): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const r of rows) {
    const arr = m.get(r.capid)
    if (arr) arr.push(r)
    else m.set(r.capid, [r])
  }
  return m
}

/** v1 Index.html:1732 next-rank ordering for the promotion reports. */
const NEXT_RANK_ORDER = [
  'CMSgt',
  'SMSgt',
  'MSgt',
  'TSgt',
  'SSgt',
  'Col',
  'Lt Col',
  'Maj',
  'Capt',
  '1st Lt',
  '2d Lt',
  'SFO',
  'TFO',
  'FO',
]

// --- 1. Most Needed Training (v1 Index.html:1493-1606) ---

export function generateMostNeededTraining(data: ReportData): ReportResult {
  const columns = [
    col('taskName', 'Module'),
    col('level', 'Level'),
    col('groupName', 'Group'),
    col('neededByCount', 'Needed By'),
    col('workingOnLevel', 'Working On Level'),
    col('percentageOfLevel', '% of Level'),
    col('percentageOfUnit', '% of Unit'),
  ]
  const pool = seniorsOf(data)
  const cfg = data.plConfig
  if (pool.length === 0 || cfg === null) return finish(data, columns, [], pool.length)

  const workingLevelOf = (m: ReportMember): LevelId | null => {
    for (const levelId of LEVEL_ORDER) {
      const lp = m.levelProgress?.[levelId]
      if (lp !== undefined && lp.status !== 'completed') return levelId
    }
    return null
  }

  const membersWorkingOnLevel = new Map<LevelId, number>()
  const workingLevelByCapid = new Map<number, LevelId | null>()
  for (const m of pool) workingLevelByCapid.set(m.capid, workingLevelOf(m))
  for (const levelId of LEVEL_ORDER) {
    membersWorkingOnLevel.set(
      levelId,
      pool.filter(m => workingLevelByCapid.get(m.capid) === levelId).length,
    )
  }

  interface NeedEntry {
    taskId: number
    taskName: string
    description: string | null
    level: LevelId
    groupName: string
    neededBy: { capid: number; name: string; rank: string }[]
  }
  const taskNeed = new Map<string, NeedEntry>()

  for (const levelId of LEVEL_ORDER) {
    const pathId = cfg.levelPathMap.get(levelId)
    if (pathId === undefined) continue
    const moderated = MODERATED_LOOKUP.get(levelId)
    if (moderated === undefined || moderated.size === 0) continue
    const groups = (cfg.groupsByPathId.get(pathId) ?? []).filter(g => g.numberOfRequiredTasks > 0)
    for (const group of groups) {
      for (const taskId of cfg.taskIdsByGroupId.get(group.groupId) ?? []) {
        const taskDef = cfg.tasksById.get(taskId)
        if (taskDef === undefined || !isModeratedTaskForLevel(levelId, taskDef.taskName)) continue
        const key = `${levelId}|${taskId}`
        let entry = taskNeed.get(key)
        if (entry === undefined) {
          entry = {
            taskId,
            taskName: taskDef.taskName,
            description: taskDef.description,
            level: levelId,
            groupName: group.groupName,
            neededBy: [],
          }
          taskNeed.set(key, entry)
        }
        for (const m of pool) {
          if (workingLevelByCapid.get(m.capid) !== levelId) continue
          // Level 2 honors track-specific applicability (v1 :1561-1566).
          if (levelId === 'L2P1' || levelId === 'L2P2') {
            const memberTrack = m.level2Track ?? null
            const appliesTo = LEVEL2_TASK_TRACKS.get(taskId) ?? ['ALL']
            if (
              memberTrack !== null &&
              !(appliesTo.includes('ALL') || appliesTo.includes(memberTrack))
            )
              continue
          }
          const isDone = cfg.completedCapidsByTaskId.get(taskId)?.has(m.capid) === true
          if (!isDone) {
            entry.neededBy.push({ capid: m.capid, name: memberName(m), rank: m.rank })
          }
        }
      }
    }
  }

  const rows: Row[] = [...taskNeed.values()]
    .map(item => {
      const workingOnLevel = membersWorkingOnLevel.get(item.level) ?? 0
      const neededByCount = item.neededBy.length
      return {
        taskId: item.taskId,
        taskName: item.taskName,
        description: item.description,
        level: item.level,
        groupName: item.groupName,
        neededBy: item.neededBy,
        neededByCount,
        workingOnLevel,
        percentageOfLevel:
          workingOnLevel > 0 ? Math.round((neededByCount / workingOnLevel) * 100) : 0,
        percentageOfUnit: pool.length > 0 ? Math.round((neededByCount / pool.length) * 100) : 0,
      }
    })
    .filter(item => item.neededByCount > 0)
    .sort((a, b) => {
      if (b.neededByCount !== a.neededByCount) return b.neededByCount - a.neededByCount
      if (b.percentageOfUnit !== a.percentageOfUnit) return b.percentageOfUnit - a.percentageOfUnit
      return a.taskName.localeCompare(b.taskName)
    })

  return finish(data, columns, rows, pool.length)
}

// --- 2. Track/Duty Discrepancies (v1 Index.html:1608-1648) ---

export function generateDiscrepanciesReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('unit', 'Unit'),
    col('issueCount', 'Issues'),
    col('issuesText', 'Missing Tracks'),
  ]
  const pool = seniorsOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    const tracks = m.seniorTracks ?? []
    const issues: { duty: string; requiredTrack: string }[] = []
    for (const duty of m.seniorDuties ?? []) {
      const cleanDuty = duty.name.toUpperCase().trim()
      const requiredTrack = DUTY_TO_TRACK_MAP[cleanDuty]
      if (requiredTrack === undefined) continue
      const hasEnrolled = tracks.some(t => {
        const trackName = t.name.toUpperCase().trim()
        return trackName.includes(requiredTrack) || requiredTrack.includes(trackName)
      })
      if (!hasEnrolled) issues.push({ duty: duty.name, requiredTrack })
    }
    if (issues.length > 0) {
      rows.push({
        capid: m.capid,
        memberName: memberName(m),
        rank: m.rank,
        unit: unitDisplayName(data.orgs, m.orgid),
        issues,
        issueCount: issues.length,
        issuesText: issues.map(i => `${i.duty}: needs ${i.requiredTrack}`).join('; '),
      })
    }
  }
  rows.sort((a, b) => (b['issueCount'] as number) - (a['issueCount'] as number))
  return finish(data, columns, rows, pool.length)
}

// --- 3. Levels Needing Approval (v1 Index.html:1650-1688) ---

export function generateApprovalNeededReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('unit', 'Unit'),
    col('levelLabel', 'Level'),
    col('levelName', 'Level Name'),
    col('status', 'Status'),
    col('percent', '% Complete'),
  ]
  const pool = seniorsOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    for (const lvl of LEVELS) {
      const status = m.levelProgress?.[lvl.id]
      if (status === undefined) continue
      if (status.status === 'ready' || status.status === 'pending') {
        const statusLabel =
          status.status === 'pending'
            ? status.approvalStatus === 'disapproved'
              ? 'Submitted - Needs Update'
              : 'Submitted - Pending'
            : 'Ready to Submit'
        rows.push({
          capid: m.capid,
          memberName: memberName(m),
          rank: m.rank,
          unit: unitDisplayName(data.orgs, m.orgid),
          levelId: lvl.id,
          levelLabel: lvl.label,
          levelName: lvl.name,
          status: statusLabel,
          percent: status.percent,
        })
      }
    }
  }
  rows.sort((a, b) => {
    const ln = (a['memberName'] as string).localeCompare(b['memberName'] as string)
    if (ln !== 0) return ln
    return (a['levelId'] as string).localeCompare(b['levelId'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 4. Promotion Eligibility (v1 Index.html:1690-1739) ---

export function generatePromotionEligibilityReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('unit', 'Unit'),
    col('nextRank', 'Next Grade'),
    col('tigDisplay', 'Time in Grade'),
    col('levelDisplay', 'E&T Level'),
    col('dutyStatus', 'Duty Requirement'),
    col('eligibleDate', 'TIG Met On'),
  ]
  const pool = seniorsOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    // Corrected PROMOTION_RULES at request-time now; Lt Col has no rule row
    // (Colonel is a special appointment, CAPR 35-5 section 3.2), matching
    // v1's explicit Lt Col exclusion (Index.html:1704-1706).
    const promo = promotionDetailsNow(m, data.asOf)
    if (promo === null) continue
    if (!promo.isEligible) continue
    rows.push({
      capid: m.capid,
      memberName: memberName(m),
      rank: m.rank,
      unit: unitDisplayName(data.orgs, m.orgid),
      nextRank: promo.nextRank,
      tigMonths: promo.tigMonthsCurrent,
      tigRequired: promo.tigMonthsRequired,
      tigDisplay: `${promo.tigMonthsCurrent}m (${promo.tigMonthsRequired}m req)`,
      levelCurrent: promo.levelCurrent,
      levelRequired: promo.levelRequired,
      levelDisplay: `${promo.levelCurrent} (${promo.levelRequired} req)`,
      dutyStatus: promo.dutyStatusString !== '' ? promo.dutyStatusString : 'N/A',
      eligibleDate: isoDate(promo.eligibleDate),
    })
  }
  rows.sort((a, b) => {
    const ai = NEXT_RANK_ORDER.indexOf(a['nextRank'] as string)
    const bi = NEXT_RANK_ORDER.indexOf(b['nextRank'] as string)
    if (ai !== bi) return ai - bi
    return (a['memberName'] as string).localeCompare(b['memberName'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 5. Near Promotion (v1 Index.html:1741-1942) ---

export function generateNearPromotionReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('unit', 'Unit'),
    col('nextRank', 'Next Grade'),
    col('category', 'Category'),
    col('blockingFactors', 'Blocking Factors'),
    col('tigStatus', 'TIG Status'),
    col('levelCurrent', 'E&T Status'),
    col('dutyStatus', 'Duty Status'),
    col('eligibleDate', 'TIG Met On'),
  ]
  const pool = seniorsOf(data)
  // v1 thresholds (Index.html:1751-1753).
  const NEAR_TIG_THRESHOLD = 6
  const NEAR_DUTY_THRESHOLD = 6
  const MAX_TASKS_REMAINING = 5
  const rows: Row[] = []

  for (const m of pool) {
    const promo = promotionDetailsNow(m, data.asOf)
    if (promo === null) continue
    if (promo.isEligible) continue

    const rules = PROMOTION_RULES[normalizeRank(m.rank)]
    const tigMonthsRemaining = promo.tigMonthsRequired - promo.tigMonthsCurrent
    const isNearTIG = tigMonthsRemaining > 0 && tigMonthsRemaining <= NEAR_TIG_THRESHOLD

    let dutyMonthsRemaining = 0
    let isNearDuty = false
    if (promo.dutyReq !== null && !promo.isDutyMet && promo.currentDutyMonths > 0) {
      const requiredDutyMonths = rules?.dutyMonths ?? 0
      if (requiredDutyMonths > 0) {
        dutyMonthsRemaining = requiredDutyMonths - promo.currentDutyMonths
        isNearDuty = dutyMonthsRemaining > 0 && dutyMonthsRemaining <= NEAR_DUTY_THRESHOLD
      }
    }

    // Remaining-task count from stored level totals. v1 seeded this counter at
    // 5 (Index.html:1778); ported as a plain count of incomplete required tasks.
    let tasksRemaining = 0
    if (!promo.isLevelMet && rules !== undefined) {
      const remainingForLevel = (levelId: LevelId): number => {
        const lp = m.levelProgress?.[levelId]
        if (lp === undefined || lp.status === 'completed') return 0
        return Math.max(0, lp.totalReq - lp.totalComp)
      }
      if (rules.requiredParts !== undefined && rules.requiredParts.length > 0) {
        for (const part of rules.requiredParts) tasksRemaining += remainingForLevel(part as LevelId)
      } else if (rules.level > 0) {
        const currentLevel = m.seniorCurrentLevelNum ?? 0
        for (let lvl = 1; lvl <= rules.level; lvl++) {
          if (lvl <= currentLevel) continue
          for (const def of LEVELS) {
            if (def.baseLevel === lvl) tasksRemaining += remainingForLevel(def.id)
          }
          break
        }
      }
    }
    const isNearLevel = !promo.isLevelMet && tasksRemaining <= MAX_TASKS_REMAINING

    let category = ''
    const blockingFactors: string[] = []
    let priority = 0
    if (!promo.isTigMet) {
      category = isNearTIG ? 'TIG Pending (Near)' : 'TIG Pending'
      blockingFactors.push(`${tigMonthsRemaining}m until TIG`)
      priority = isNearTIG ? 1 : 4
    }
    if (!promo.isLevelMet) {
      if (isNearLevel) {
        category = category !== '' ? `${category} + Training` : 'Training Pending (Near)'
        blockingFactors.push(
          tasksRemaining > 0
            ? `${tasksRemaining} task${tasksRemaining !== 1 ? 's' : ''} remaining`
            : 'Awaiting level approval',
        )
        if (priority === 0 || priority > 2) priority = 2
      } else {
        category = category !== '' ? `${category} + Training` : 'Training Pending'
        blockingFactors.push(`${tasksRemaining} tasks remaining`)
        if (priority === 0 || priority > 5) priority = 5
      }
    }
    if (promo.dutyReq !== null && !promo.isDutyMet) {
      if (promo.currentDutyMonths === 0) {
        category = category !== '' ? `${category} + Duty` : 'Duty Assignment Needed'
        blockingFactors.push(`Needs ${promo.dutyReq}`)
        if (priority === 0 || priority > 3) priority = 3
      } else if (isNearDuty) {
        category = category !== '' ? `${category} + Duty` : 'Duty Time Pending (Near)'
        blockingFactors.push(`${dutyMonthsRemaining}m until duty req`)
        if (priority === 0 || priority > 1) priority = 1
      } else {
        category = category !== '' ? `${category} + Duty` : 'Duty Time Pending'
        blockingFactors.push(`${dutyMonthsRemaining}m until duty req`)
        if (priority === 0 || priority > 4) priority = 4
      }
    }
    // CAPR 35-5 fig 2 note: SM -> 2d Lt six-month membership minimum (v2
    // correction, not in v1's report).
    if (!promo.isMembershipMet && promo.membershipMonthsRequired !== null) {
      const monthsLeft = promo.membershipMonthsRequired - promo.membershipMonthsCurrent
      category = category !== '' ? `${category} + Membership` : 'Membership Time Pending'
      blockingFactors.push(`${monthsLeft}m until membership req`)
      if (priority === 0 || priority > 4) priority = 4
    }

    if (
      isNearTIG ||
      isNearLevel ||
      isNearDuty ||
      (blockingFactors.length > 0 && blockingFactors.length <= 2)
    ) {
      rows.push({
        capid: m.capid,
        memberName: memberName(m),
        rank: m.rank,
        unit: unitDisplayName(data.orgs, m.orgid),
        nextRank: promo.nextRank,
        category,
        blockingFactors: blockingFactors.join(', '),
        priority,
        tigStatus: promo.isTigMet
          ? 'Met'
          : `${tigMonthsRemaining}m remaining (${promo.tigMonthsCurrent}/${promo.tigMonthsRequired})`,
        levelCurrent: promo.levelCurrent,
        levelRequired: promo.levelRequired,
        tasksRemaining,
        dutyStatus: promo.dutyStatusString !== '' ? promo.dutyStatusString : 'N/A',
        eligibleDate: isoDate(promo.eligibleDate),
      })
    }
  }

  rows.sort((a, b) => {
    if ((a['priority'] as number) !== (b['priority'] as number))
      return (a['priority'] as number) - (b['priority'] as number)
    const ai = NEXT_RANK_ORDER.indexOf(a['nextRank'] as string)
    const bi = NEXT_RANK_ORDER.indexOf(b['nextRank'] as string)
    if (ai !== bi) return ai - bi
    return (a['memberName'] as string).localeCompare(b['memberName'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 6. Cadets, No Promotion in 120 Days (v1 Index.html:1945-1984) ---

export function generateCadetNoPromotionReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('rank', 'Grade'),
    col('lastPromotion', 'Last Promotion'),
    col('daysSince', 'Days Since'),
  ]
  const pool = cadetsOf(data)
  const threshold = 120
  const rows: Row[] = []
  for (const m of pool) {
    // computed_member.last_promotion_on is the achievement's approval-based
    // effective date (domain/cadet.ts lastPromotionDate); v1 read CadetRank
    // RankDate directly.
    if (m.lastPromotionOn === null) continue
    const days = daysSince(m.lastPromotionOn, data.asOf)
    if (days !== null && days > threshold) {
      rows.push({
        capid: m.capid,
        memberName: memberName(m),
        unit: unitDisplayName(data.orgs, m.orgid),
        rank: m.rank,
        lastPromotion: isoDate(m.lastPromotionOn),
        daysSince: days,
      })
    }
  }
  rows.sort((a, b) => (b['daysSince'] as number) - (a['daysSince'] as number))
  return finish(data, columns, rows, pool.length)
}

// --- 7. Membership Expiring Soon (v1 Index.html:1987-2022) ---

/** CAPWATCH open-ended expirations use year 9998/9999 sentinels (v1 :2002). */
function isRealExpiration(expiration: Date | null): expiration is Date {
  return expiration !== null && expiration.getFullYear() < 9998
}

function expirationUrgency(days: number): string {
  return days <= 30 ? 'critical' : days <= 60 ? 'warning' : 'caution'
}

export function generateMembershipLapseReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('unit', 'Unit'),
    col('memberType', 'Type'),
    col('rank', 'Grade'),
    col('expiration', 'Expires'),
    col('daysUntil', 'Days Left'),
    col('urgency', 'Urgency'),
  ]
  const pool = bothOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    if (!isRealExpiration(m.expiration)) continue
    const days = daysUntil(m.expiration, data.asOf)
    if (days !== null && days >= 0 && days <= 90) {
      rows.push({
        capid: m.capid,
        memberName: memberName(m),
        unit: unitDisplayName(data.orgs, m.orgid),
        memberType: m.memberType,
        rank: m.rank !== '' ? m.rank : 'N/A',
        expiration: isoDate(m.expiration),
        daysUntil: days,
        urgency: expirationUrgency(days),
      })
    }
  }
  rows.sort((a, b) => (a['daysUntil'] as number) - (b['daysUntil'] as number))
  return finish(data, columns, rows, pool.length)
}

// --- 8. Cadet Protection Training (v1 Index.html:2024-2107) ---

function advancedDutyRequired(
  m: ReportMember,
  dutiesByCapid: ReadonlyMap<number, DutySlice[]>,
  orgs: ReadonlyMap<number, OrgInfo>,
): boolean {
  if (!m.isSeniorScope) return false
  return (dutiesByCapid.get(m.capid) ?? []).some(
    d => d.source === 'senior' && isAdvancedCpDuty(d.duty, d.heldAtOrgid, orgs),
  )
}

export function generateCadetProtectionReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('unit', 'Unit'),
    col('memberType', 'Type'),
    col('rank', 'Grade'),
    col('course', 'Course'),
    col('requirement', 'Requirement'),
    col('status', 'Status'),
    col('lastCompleted', 'Last Completed'),
    col('expiration', 'Expires'),
    col('daysText', 'Time Remaining'),
  ]
  const pool = bothOf(data)
  const training = buildTrainingIndex(data.training)
  const dutiesByCapid = groupByCapid(data.duties)
  const statusLabelMap: Record<string, string> = {
    'due-soon': 'Due Soon',
    overdue: 'Overdue',
    missing: 'Missing',
  }
  const severityMap: Record<string, number> = { missing: 3, overdue: 3, 'due-soon': 2 }
  const rows: Row[] = []

  const pushRow = (
    m: ReportMember,
    cp: CpStatus,
    course: CpStatus['basic'],
    statusKey: string,
    requirement: string,
    daysTextOverride: string | null,
    daysSortOverride: number | null,
  ): void => {
    const daysSort =
      daysSortOverride !== null
        ? daysSortOverride
        : course.daysRemaining !== null
          ? course.daysRemaining
          : statusKey === 'missing'
            ? -9999
            : 9999
    rows.push({
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      memberType: m.memberType,
      rank: m.rank !== '' ? m.rank : 'N/A',
      course: course.label,
      requirement,
      status: statusLabelMap[statusKey] ?? 'Due Soon',
      lastCompleted: course.lastCompleted !== null ? isoDate(course.lastCompleted) : 'Not completed',
      expiration: course.expirationDate !== null ? isoDate(course.expirationDate) : 'N/A',
      daysText: daysTextOverride ?? course.daysText,
      statusKey,
      daysSort,
      age: cp.age,
    })
  }

  for (const m of pool) {
    const cp = getCadetProtectionStatus(m, training, advancedDutyRequired(m, dutiesByCapid, data.orgs), data.asOf)
    const flagged = cp.requiredCourses.filter(c =>
      c.status === 'overdue' || c.status === 'missing' || c.status === 'due-soon',
    )
    for (const course of flagged) pushRow(m, cp, course, course.status, 'Required', null, null)
    if (flagged.length === 0 && cp.basicEligibleUnstarted) {
      // v1 computed days-until-18 from exact DOB here (Index.html:2087-2097);
      // the DOB is admin-gated in v2, so the report uses v1's no-DOB fallback.
      pushRow(m, cp, cp.basic, 'due-soon', 'Eligible', 'By age 18', 9999)
    }
  }

  rows.sort((a, b) => {
    const sev =
      (severityMap[b['statusKey'] as string] ?? 0) - (severityMap[a['statusKey'] as string] ?? 0)
    if (sev !== 0) return sev
    return (a['daysSort'] as number) - (b['daysSort'] as number)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 9. TLC Compliance (v1 Index.html:2109-2244) ---

export function generateTlcComplianceReport(data: ReportData): ReportResult {
  const pool = seniorsOf(data)
  const training = buildTrainingIndex(data.training)
  const dutiesByCapid = groupByCapid(data.duties)
  // CAPR 60-1 baseline v1 applied: 2 TLC-qualified seniors per cadet/composite
  // unit; groups and 000/999 special units exempt (Index.html:2115-2116).
  const requiredCount = 2
  const specialUnits = new Set(['000', '999'])

  if (data.descendants) {
    const columns = [
      col('unit', 'Unit'),
      col('compliance', 'Compliance'),
      col('qualified', 'Qualified'),
      col('required', 'Required'),
      col('current', 'Current'),
      col('dueSoon', 'Due Soon'),
      col('expired', 'Expired'),
      col('missing', 'Missing'),
      col('totalMembers', 'Seniors'),
    ]
    interface Bucket {
      orgid: number
      unit: string
      unitNum: string
      unitType: string
      totalMembers: number
      current: number
      dueSoon: number
      expired: number
      missing: number
    }
    const unitMap = new Map<number, Bucket>()
    for (const m of pool) {
      let bucket = unitMap.get(m.orgid)
      if (bucket === undefined) {
        const info = unitInfoOf(data.orgs, m.orgid)
        bucket = {
          orgid: m.orgid,
          unit: unitDisplayName(data.orgs, m.orgid),
          unitNum: info.unitNum,
          unitType: info.unitType,
          totalMembers: 0,
          current: 0,
          dueSoon: 0,
          expired: 0,
          missing: 0,
        }
        unitMap.set(m.orgid, bucket)
      }
      bucket.totalMembers += 1
      const tlc = getTlcStatus(m.capid, training, data.asOf)
      const key = tlc !== null ? tlc.status : 'missing'
      if (key === 'current') bucket.current += 1
      else if (key === 'due-soon') bucket.dueSoon += 1
      else if (key === 'expired') bucket.expired += 1
      else bucket.missing += 1
    }
    const order: Record<string, number> = { 'non-compliant': 0, exempt: 1, compliant: 2 }
    const rows: Row[] = [...unitMap.values()]
      .map(b => {
        const qualified = b.current + b.dueSoon
        const isExempt = b.unitType.includes('GROUP') || specialUnits.has(b.unitNum)
        const isCompliant = isExempt ? true : qualified >= requiredCount
        return {
          orgid: b.orgid,
          unit: b.unit,
          qualified,
          required: isExempt ? 0 : requiredCount,
          compliance: isExempt ? 'Exempt' : isCompliant ? 'Compliant' : 'Needs TLC',
          complianceStatus: isExempt ? 'exempt' : isCompliant ? 'compliant' : 'non-compliant',
          current: b.current,
          dueSoon: b.dueSoon,
          expired: b.expired,
          missing: b.missing,
          totalMembers: b.totalMembers,
        }
      })
      .sort((a, b) => {
        if (a.complianceStatus !== b.complianceStatus) {
          return (order[a.complianceStatus] ?? 0) - (order[b.complianceStatus] ?? 0)
        }
        if (b.qualified !== a.qualified) return b.qualified - a.qualified
        return a.unit.localeCompare(b.unit)
      })
    return finish(data, columns, rows, pool.length, {
      view: 'unit-summary',
      required: requiredCount,
    })
  }

  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('dutySummary', 'Duties'),
    col('course', 'Course'),
    col('status', 'Status'),
    col('completed', 'Completed'),
    col('expiration', 'Expires'),
    col('daysText', 'Time Remaining'),
  ]
  const statusOrder: Record<string, number> = { missing: 0, expired: 1, 'due-soon': 2, current: 3 }
  const statusLabelMap: Record<string, string> = {
    current: 'Current',
    'due-soon': 'Due Soon',
    expired: 'Expired',
    missing: 'Missing',
  }
  const rows: Row[] = pool
    .map(m => {
      const tlc = getTlcStatus(m.capid, training, data.asOf)
      const statusKey = tlc !== null ? tlc.status : 'missing'
      const dutyNames = (dutiesByCapid.get(m.capid) ?? [])
        .filter(d => d.source === 'senior')
        .map(d => `${d.duty}${d.asst ? ' (A)' : ''}`)
      const shortList = dutyNames.slice(0, 2)
      const dutySummary =
        dutyNames.length === 0
          ? 'None'
          : dutyNames.length > 2
            ? `${shortList.join(', ')} +${dutyNames.length - 2} more`
            : shortList.join(', ')
      return {
        capid: m.capid,
        memberName: memberName(m),
        unit: unitDisplayName(data.orgs, m.orgid),
        rank: m.rank !== '' ? m.rank : 'N/A',
        dutySummary,
        dutyFull: dutyNames.length > 0 ? dutyNames.join(', ') : 'None',
        course: tlc !== null ? tlc.course : 'None',
        status: statusLabelMap[statusKey] ?? 'Missing',
        statusKey,
        completed: tlc !== null ? isoDate(tlc.completed) : 'N/A',
        expiration: tlc !== null ? isoDate(tlc.expirationDate) : 'N/A',
        daysText: tlc !== null ? tlc.daysText : 'N/A',
        isQualified: tlc !== null && tlc.status !== 'expired',
      }
    })
    .sort((a, b) => {
      const delta = (statusOrder[a.statusKey] ?? 0) - (statusOrder[b.statusKey] ?? 0)
      if (delta !== 0) return delta
      return a.memberName.localeCompare(b.memberName)
    })
  const scopeInfo = unitInfoOf(data.orgs, data.orgid)
  const scopeIsExempt = scopeInfo.unitType.includes('GROUP') || specialUnits.has(scopeInfo.unitNum)
  return finish(data, columns, rows, pool.length, {
    view: 'individual',
    required: scopeIsExempt ? 0 : requiredCount,
    isExempt: scopeIsExempt,
  })
}

// --- 10. Aerospace Education Completion (v1 Index.html:2247-2338) ---

export function generateAerospaceEducationReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('rank', 'Grade'),
    col('phase', 'Phase'),
    ...AEROSPACE_DIMENSIONS_MODULES.map(m => col(`module${m.moduleNum}`, `Module ${m.moduleNum}`)),
    col('totalHonorCredits', 'Honor Credits'),
  ]
  const pool = cadetsOf(data)
  const achvByCapid = groupByCapid(data.cadetAchvAe)
  const aeTasksByCapid = groupByCapid(data.aeTaskCompletions)
  const rows: Row[] = []

  for (const m of pool) {
    const currentAchv = m.nextAchvId !== null ? m.nextAchvId - 1 : 21
    const achievements = achvByCapid.get(m.capid) ?? []
    const taskRows = aeTasksByCapid.get(m.capid) ?? []
    const row: Row = {
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      rank: m.rank !== '' ? m.rank : 'N/A',
      phase: currentAchv > 0 ? (currentAchv <= 9 ? 'Phase 1 or 2' : 'Phase 3+') : 'N/A',
    }
    let totalHonorCredits = 0
    const modules: Row[] = []
    for (const module of AEROSPACE_DIMENSIONS_MODULES) {
      // v1 read interactive dates/scores from MbrTasks AdditionalOptions
      // (Index.html:2290-2314); that column is not mirrored (ingest/tables.ts
      // allowlist), so interactive completion is the StatusID 8 task credit
      // and test evidence is the CadetAchv AEScore/AEDateP fallback v1 used.
      const taskRow = taskRows.find(t => t.taskId === module.taskId)
      const interactiveCompleted = taskRow !== undefined
      const interactiveDate = taskRow?.completed ?? null
      const achvRecord = achievements.find(a => a.cadetAchvId === module.achievementId)
      const testScore =
        achvRecord?.aeScore !== null && achvRecord?.aeScore !== undefined
          ? Number.parseInt(achvRecord.aeScore, 10) || 0
          : 0
      const testDate = achvRecord?.aeDateP ?? null
      const testCompleted = testScore >= CADET_MIN_TEST_SCORE && testDate !== null
      const honorCredit = interactiveCompleted && testCompleted
      if (honorCredit) totalHonorCredits++
      row[`module${module.moduleNum}`] =
        interactiveCompleted && testCompleted
          ? 'Both'
          : testCompleted
            ? 'Test'
            : interactiveCompleted
              ? 'Interactive'
              : ''
      modules.push({
        moduleNum: module.moduleNum,
        achievementName: module.title,
        interactiveCompleted,
        interactiveDate: isoDate(interactiveDate),
        testCompleted,
        testScore,
        testDate: isoDate(testDate),
        honorCredit,
      })
    }
    row['modules'] = modules
    row['totalHonorCredits'] = totalHonorCredits
    rows.push(row)
  }

  rows.sort((a, b) => (a['memberName'] as string).localeCompare(b['memberName'] as string))
  return finish(data, columns, rows, pool.length)
}

// --- 11. Encampment Completion Status (v1 Index.html:2341-2381) ---

export function generateEncampmentReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('rank', 'Grade'),
    col('encampmentStatus', 'Status'),
    col('completionDate', 'Completed'),
    col('count', 'Encampments'),
  ]
  const pool = cadetsOf(data)
  const activitiesByCapid = groupByCapid(data.cadetActivities)
  const rows: Row[] = pool.map(m => {
    const encampments = (activitiesByCapid.get(m.capid) ?? [])
      .filter(a => a.type.toUpperCase().includes('ENCAMP'))
      .sort((a, b) => (a.completed?.getTime() ?? 0) - (b.completed?.getTime() ?? 0))
    const first = encampments[0]
    return {
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      rank: m.rank !== '' ? m.rank : 'N/A',
      encampmentStatus: encampments.length > 0 ? 'Completed' : 'Not Completed',
      completionDate: first !== undefined && first.completed !== null ? isoDate(first.completed) : 'N/A',
      hasEncampment: encampments.length > 0,
      encampments: encampments.map(e => ({
        type: e.type,
        location: e.location ?? 'N/A',
        completed: isoDate(e.completed) ?? 'N/A',
      })),
      count: encampments.length,
    }
  })
  rows.sort((a, b) => {
    if (a['hasEncampment'] !== b['hasEncampment']) return (a['hasEncampment'] as boolean) ? 1 : -1
    return (a['memberName'] as string).localeCompare(b['memberName'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 12. Orientation Flights Status (v1 Index.html:2384-2462) ---

/** Powered O-Flight syllabi 6-10; 99 is a back-seat ride (v1 :2396-2402, :2439). */
const POWERED_SYLLABI = [
  { num: 6, name: 'Ground Handling' },
  { num: 7, name: 'Normal Maneuvers' },
  { num: 8, name: 'Advanced Maneuvers' },
  { num: 9, name: 'Instruments' },
  { num: 10, name: 'Weather' },
] as const

export function generateOFlightReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('joinDate', 'Joined'),
    col('age', 'Age'),
    ...POWERED_SYLLABI.map(s => col(`syllabus${s.num}`, `Syl ${s.num}`)),
    col('totalPoweredFlights', 'Powered Flights'),
    col('backSeatRides', 'Back Seat'),
    col('completedSyllabi', 'Syllabi Done'),
  ]
  const pool = cadetsOf(data)
  const flightsByCapid = groupByCapid(data.oflights)
  const rows: Row[] = pool.map(m => {
    const flights = flightsByCapid.get(m.capid) ?? []
    let totalPoweredFlights = 0
    let completedSyllabi = 0
    const row: Row = {
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      joinDate: isoDate(m.joined) ?? 'N/A',
      age: m.ageAsofCompute ?? 'N/A',
    }
    for (const syllabus of POWERED_SYLLABI) {
      const matches = flights.filter(
        f => f.syllabus !== null && Number.parseInt(f.syllabus, 10) === syllabus.num,
      )
      const latest = matches
        .filter(f => f.fltDate !== null)
        .sort((a, b) => (b.fltDate as Date).getTime() - (a.fltDate as Date).getTime())[0]
      row[`syllabus${syllabus.num}`] =
        matches.length > 0 ? (isoDate(latest?.fltDate ?? null) ?? 'Yes') : ''
      totalPoweredFlights += matches.length
      if (matches.length > 0) completedSyllabi++
    }
    const backSeatRides = flights.filter(
      f => f.syllabus !== null && Number.parseInt(f.syllabus, 10) === 99,
    ).length
    row['totalPoweredFlights'] = totalPoweredFlights
    row['backSeatRides'] = backSeatRides
    row['completedSyllabi'] = completedSyllabi
    row['hasAnyFlight'] = totalPoweredFlights > 0 || backSeatRides > 0
    return row
  })
  rows.sort((a, b) => {
    if (a['hasAnyFlight'] !== b['hasAnyFlight']) return (a['hasAnyFlight'] as boolean) ? 1 : -1
    return (a['memberName'] as string).localeCompare(b['memberName'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 13. Cadets, Recent Promotions (v1 Index.html:2465-2506) ---

export function generateRecentPromotionsReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('previousRank', 'From'),
    col('rank', 'To'),
    col('promotionDate', 'Promoted'),
    col('daysSincePromotion', 'Days Ago'),
    col('timeframe', 'Window'),
  ]
  const pool = cadetsOf(data)
  const ranksByCapid = groupByCapid(data.cadetRanks)
  const windowDays = 60
  const rows: Row[] = []
  for (const m of pool) {
    if (m.lastPromotionOn === null) continue
    const days = daysSince(m.lastPromotionOn, data.asOf)
    if (days === null || days < 0 || days > windowDays) continue
    const history = (ranksByCapid.get(m.capid) ?? [])
      .slice()
      .sort((a, b) => (b.rankDate?.getTime() ?? 0) - (a.rankDate?.getTime() ?? 0))
    rows.push({
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      rank: m.rank,
      previousRank: history[1]?.rank ?? 'N/A',
      promotionDate: isoDate(m.lastPromotionOn),
      daysSincePromotion: days,
      timeframe: days <= 30 ? '30-day' : '60-day',
    })
  }
  rows.sort((a, b) => (a['daysSincePromotion'] as number) - (b['daysSincePromotion'] as number))
  return finish(data, columns, rows, pool.length)
}

// --- 14. Cadet Promotion Requirements (v1 Index.html:2509-2722) ---

/** v1 Index.html:2518-2524 requirement group memberships. */
const REQUIREMENT_GROUPS: Record<string, readonly RequirementKey[]> = {
  leadership: [
    'leadershipTest',
    'wrightBrothersLeadershipExam',
    'mitchellLeadershipExam',
    'earhartLeadershipExam',
    'spaatzLeadershipExam',
  ],
  aerospace: ['aerospaceTest', 'mitchellAerospaceExam', 'spaatzJOFExam'],
  fitness: ['physicalFitness', 'spaatzCFA'],
  character: [
    'characterDevelopment',
    'cadetOath',
    'leadershipExpectations',
    'leadershipFeedback',
    'uniformWear',
  ],
  activity: [
    'activeParticipation',
    'cadetWingmanCourse',
    'encampment',
    'cls',
    'achievement8Speech',
    'achievement8Essay',
    'eakerSpeech',
    'eakerEssay',
    'spaatzEssay',
    'drillTest',
    'sdaService',
    'sdaPresentation',
    'sdaWriting',
  ],
}

function cadetPhaseLabel(achievementId: number): string {
  const phaseId = phaseFromAchievement(achievementId)
  if (phaseId === 0) return 'Phase I'
  const phaseName = CADET_PHASES.get(phaseId)?.name ?? `Phase ${phaseId}`
  return phaseName.split('(')[0]?.trim() ?? phaseName
}

export function generatePromotionRequirementsReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('rank', 'Grade'),
    col('currentAchievement', 'Current Achievement'),
    col('nextAchievement', 'Next Achievement'),
    col('nextPhase', 'Next Phase'),
    col('leadership', 'Leadership'),
    col('aerospace', 'Aerospace'),
    col('fitness', 'Fitness'),
    col('character', 'Character'),
    col('activity', 'Activity'),
    col('progress', 'Progress'),
  ]
  const pool = cadetsOf(data)
  const rows: Row[] = pool.map(m => {
    const requirements = m.cadetRequirements ?? []
    const byKey = new Map(requirements.map(r => [r.key, r] as const))
    const summarize = (keys: readonly RequirementKey[]): boolean | null => {
      const applicable = keys.filter(k => byKey.has(k))
      if (applicable.length === 0) return null
      return applicable.every(k => byKey.get(k)?.completed === true)
    }
    const nextAchvId = m.nextAchvId
    let progress = 'N/A'
    let percentComplete = 0
    if (nextAchvId === null) {
      progress = 'Complete'
      percentComplete = 100
    } else if (requirements.length > 0) {
      const completedCount = requirements.filter(r => r.completed).length
      progress = `${completedCount}/${requirements.length}`
      percentComplete = Math.round((completedCount / requirements.length) * 100)
    }
    const currentAchvId = nextAchvId !== null ? nextAchvId - 1 : 21
    const detailLines = requirements.map(r =>
      r.value !== null && r.value !== ''
        ? `${r.label}: ${r.value}`
        : `${r.label}: ${r.completed ? 'Completed' : 'Not completed'}`,
    )
    return {
      capid: m.capid,
      memberName: memberName(m),
      unit: unitDisplayName(data.orgs, m.orgid),
      rank: m.rank !== '' ? m.rank : 'N/A',
      currentAchievement: m.currentAchievementName ?? 'Not Started',
      currentPhase: currentAchvId > 0 ? cadetPhaseLabel(currentAchvId) : 'Phase I',
      nextAchievement:
        nextAchvId !== null ? (m.nextAchievementName ?? `Achievement ${nextAchvId}`) : 'Completed All',
      nextPhase: nextAchvId !== null ? cadetPhaseLabel(nextAchvId) : 'Complete',
      leadership: summarize(REQUIREMENT_GROUPS['leadership'] ?? []),
      aerospace: summarize(REQUIREMENT_GROUPS['aerospace'] ?? []),
      fitness: summarize(REQUIREMENT_GROUPS['fitness'] ?? []),
      character: summarize(REQUIREMENT_GROUPS['character'] ?? []),
      activity: summarize(REQUIREMENT_GROUPS['activity'] ?? []),
      requirementsDetails: requirements,
      requirementsDetailText:
        detailLines.length > 0
          ? detailLines.join('\n')
          : nextAchvId !== null
            ? 'Requirement details unavailable'
            : 'All achievements complete',
      progress,
      percentComplete,
    }
  })
  rows.sort((a, b) => (a['memberName'] as string).localeCompare(b['memberName'] as string))
  return finish(data, columns, rows, pool.length)
}

// --- 15. Cadets Approaching Age 18 or 21 (v1 Index.html:2725-2803) ---

export function generateApproachingAgeMilestoneReport(data: ReportData): ReportResult {
  const isAdmin = data.role === 'admin'
  const columns = [
    col('memberName', 'Cadet'),
    col('unit', 'Unit'),
    col('rank', 'Grade'),
    col('milestoneLabel', 'Milestone'),
    col('currentAge', 'Age'),
    col('significance', 'Significance'),
    // DOB and its derivatives identify the exact birth date; admin-only in
    // v2.0 (docs/ARCHITECTURE.md, roles: viewers see computed age only).
    ...(isAdmin
      ? [col('dob', 'DOB'), col('milestoneDate', 'Milestone Date'), col('daysUntil', 'Days Until')]
      : []),
  ]
  const pool = cadetsOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    for (const milestone of [18, 21] as const) {
      // Viewer selection is age-based: turns 18/21 during this calendar year
      // (timeSensitive.approachingAge over dob_year; v1 used a 180-day exact
      // DOB window, Index.html:2736).
      if (!approachingAge(m.dobYear, milestone, data.asOf)) continue
      const row: Row = {
        capid: m.capid,
        memberName: memberName(m),
        unit: unitDisplayName(data.orgs, m.orgid),
        rank: m.rank !== '' ? m.rank : 'N/A',
        milestone,
        milestoneLabel: `Age ${milestone}`,
        currentAge: ageAsOf(m.dobYear, data.asOf),
        significance:
          milestone === 18 ? 'Transition to Senior Member eligibility' : 'Maximum cadet program age',
      }
      if (isAdmin && m.dob !== null && m.dob !== undefined) {
        const milestoneDate = new Date(m.dob)
        milestoneDate.setFullYear(milestoneDate.getFullYear() + milestone)
        row['dob'] = isoDate(m.dob)
        row['milestoneDate'] = isoDate(milestoneDate)
        row['daysUntil'] = daysUntilCeil(milestoneDate, data.asOf)
      }
      rows.push(row)
    }
  }
  rows.sort((a, b) => {
    if ((a['milestone'] as number) !== (b['milestone'] as number))
      return (a['milestone'] as number) - (b['milestone'] as number)
    return (a['memberName'] as string).localeCompare(b['memberName'] as string)
  })
  return finish(data, columns, rows, pool.length)
}

// --- 16. QCUA (v1 Index.html:2808-3158; thresholds also AppReports.html:1715-1721) ---

interface UnitCriterion {
  name: string
  description: string
  count: number | null
  total: number | null
  percent: number | null
  threshold: number | null
  met: boolean | null
  trackable: boolean
}

function pctCell(c: UnitCriterion): string {
  if (!c.trackable) return 'Manual'
  if (c.met === null) return 'No data'
  const detail =
    c.percent !== null && c.total !== null
      ? `${c.percent}% (${c.count}/${c.total})`
      : `${c.count ?? 0}`
  return `${c.met ? 'Met' : 'Not met'}: ${detail}`
}

export function generateQCUAReport(data: ReportData): ReportResult {
  const columns = [
    col('unit', 'Unit'),
    col('totalCadets', 'Cadets'),
    col('awardStatus', 'Status'),
    col('criteriaMet', 'Criteria Met'),
    col('wrightBrothers', 'WB 45%'),
    col('encampment', 'Encamp 50%'),
    col('enrollment', 'Enroll 25+'),
    col('emergencyServices', 'GES 60%'),
    col('onboarding', 'Onboard 70%'),
    col('orientationFlights', 'O-Flight 70%'),
    col('tlcGraduates', 'TLC 3+'),
  ]
  const pool = bothOf(data)

  // Award cycle runs 31 Aug to 31 Aug; v1 hardcoded the 2025-2026 cycle
  // (Index.html:2812-2814), v2 derives the current cycle at request time.
  const y = data.asOf.getFullYear()
  const aug31 = new Date(y, 7, 31)
  const cycleStart = data.asOf.getTime() >= aug31.getTime() ? aug31 : new Date(y - 1, 7, 31)
  const cycleEnd = new Date(cycleStart.getFullYear() + 1, 7, 31)

  const activitiesByCapid = groupByCapid(data.cadetActivities)
  const flightsByCapid = groupByCapid(data.oflights)
  const achv1ByCapid = groupByCapid(data.achv1Approvals)
  const training = buildTrainingIndex(data.training)

  const byOrg = new Map<number, { cadets: ReportMember[]; seniors: ReportMember[] }>()
  for (const m of pool) {
    let bucket = byOrg.get(m.orgid)
    if (bucket === undefined) {
      bucket = { cadets: [], seniors: [] }
      byOrg.set(m.orgid, bucket)
    }
    if (m.isCadetScope) bucket.cadets.push(m)
    else bucket.seniors.push(m)
  }

  const rows: Row[] = []
  for (const [orgid, unitData] of byOrg) {
    const { unitNum, unitType } = unitInfoOf(data.orgs, orgid)
    // Eligibility exclusions (v1 :2880-2891): senior units, higher HQ, 000/999.
    const isSeniorUnit = unitType.includes('SENIOR')
    const isHigherHQ =
      unitType.includes('GROUP') ||
      unitType.includes('WING') ||
      unitType.includes('REGION') ||
      unitType.includes('NATIONAL')
    if (isSeniorUnit || isHigherHQ || unitNum === '000' || unitNum === '999' || orgid === -1) continue

    const cadets = unitData.cadets
    const totalCadets = cadets.length
    const isEligible = totalCadets >= 10

    const currentAchvOf = (c: ReportMember): number => (c.nextAchvId !== null ? c.nextAchvId - 1 : 21)
    const wbCount = cadets.filter(c => currentAchvOf(c) >= 4).length
    const wbPercent = totalCadets > 0 ? Math.round((wbCount / totalCadets) * 100) : 0

    const encampCount = cadets.filter(c =>
      (activitiesByCapid.get(c.capid) ?? []).some(
        a => a.type.toUpperCase().includes('ENCAMP') && a.completed !== null,
      ),
    ).length
    const encampPercent = totalCadets > 0 ? Math.round((encampCount / totalCadets) * 100) : 0

    const gesCount = cadets.filter(c =>
      (c.esAll ?? []).some(q => q.achvId === ES_ACHIEVEMENT_IDS.GES && q.status === 'Active'),
    ).length
    const gesPercent = totalCadets > 0 ? Math.round((gesCount / totalCadets) * 100) : 0

    const newCadets = cadets.filter(
      c => c.joined !== null && c.joined >= cycleStart && c.joined <= cycleEnd,
    )
    // Achievement 1 within 8 weeks (56 days) of joining (v1 :2933-2958).
    const onboardCount = newCadets.filter(c => {
      const approval = (achv1ByCapid.get(c.capid) ?? [])[0]
      if (approval === undefined || approval.approvedOn === null || c.joined === null) return false
      const diff = Math.floor((approval.approvedOn.getTime() - c.joined.getTime()) / (24 * 60 * 60 * 1000))
      return diff <= 56
    }).length
    const onboardPercent =
      newCadets.length > 0 ? Math.round((onboardCount / newCadets.length) * 100) : null
    const onboardMet = newCadets.length === 0 ? null : (onboardPercent ?? 0) >= 70

    const firstFlightCount = cadets.filter(c => (flightsByCapid.get(c.capid) ?? []).length > 0).length
    const firstFlightPercent = totalCadets > 0 ? Math.round((firstFlightCount / totalCadets) * 100) : 0

    const tlcCount = unitData.seniors.filter(s => {
      const tlc = getTlcStatus(s.capid, training, data.asOf)
      return tlc !== null && (tlc.status === 'current' || tlc.status === 'due-soon')
    }).length

    const criteria: Record<string, UnitCriterion> = {
      cadetAchievement: {
        name: 'Cadet Achievement',
        description: '45% Wright Brothers Award',
        count: wbCount,
        total: totalCadets,
        percent: wbPercent,
        threshold: 45,
        met: wbPercent >= 45,
        trackable: true,
      },
      encampment: {
        name: 'Encampment',
        description: '50% encampment graduates',
        count: encampCount,
        total: totalCadets,
        percent: encampPercent,
        threshold: 50,
        met: encampPercent >= 50,
        trackable: true,
      },
      enrollment: {
        name: 'Enrollment',
        description: '25+ cadets on roster',
        count: totalCadets,
        total: null,
        percent: null,
        threshold: 25,
        met: totalCadets >= 25,
        trackable: true,
      },
      emergencyServices: {
        name: 'Emergency Services',
        description: '60% GES certified',
        count: gesCount,
        total: totalCadets,
        percent: gesPercent,
        threshold: 60,
        met: gesPercent >= 60,
        trackable: true,
      },
      onboarding: {
        name: 'Onboarding',
        description: '70% new cadets earn Achv 1 in 8 weeks',
        count: onboardCount,
        total: newCadets.length,
        percent: onboardPercent,
        threshold: 70,
        met: onboardMet,
        trackable: true,
      },
      orientationFlights: {
        name: 'Orientation Flights',
        description: '70% first flight credit',
        count: firstFlightCount,
        total: totalCadets,
        percent: firstFlightPercent,
        threshold: 70,
        met: firstFlightPercent >= 70,
        trackable: true,
      },
      tlcGraduates: {
        name: 'TLC Graduates',
        description: '3+ TLC-qualified seniors',
        count: tlcCount,
        total: unitData.seniors.length,
        percent: null,
        threshold: 3,
        met: tlcCount >= 3,
        trackable: true,
      },
      // Not trackable from CAPWATCH downloads (v1 :2980-2983).
      aerospace: {
        name: 'Aerospace',
        description: 'AEX Completion or STEM Kit',
        count: null,
        total: null,
        percent: null,
        threshold: null,
        met: null,
        trackable: false,
      },
      localAction: {
        name: 'Local Action',
        description: '4 community events with 4+ cadets',
        count: null,
        total: null,
        percent: null,
        threshold: null,
        met: null,
        trackable: false,
      },
      stemTeam: {
        name: 'STEM Team',
        description: 'Hosted qualifying STEM activity',
        count: null,
        total: null,
        percent: null,
        threshold: null,
        met: null,
        trackable: false,
      },
    }

    const trackableMet = Object.values(criteria).filter(c => c.trackable && c.met === true).length
    const trackableNotMet = Object.values(criteria).filter(c => c.trackable && c.met === false).length
    const unknown = Object.values(criteria).filter(c => c.met === null).length

    // QCUA needs 6 of 10 criteria; 3 are manual-verification only (v1 :2999-3013).
    let awardStatus: string
    if (!isEligible) awardStatus = 'Ineligible (< 10 cadets)'
    else if (trackableMet >= 6) awardStatus = 'On Track'
    else if (trackableMet + unknown >= 6) awardStatus = 'Potentially Eligible'
    else awardStatus = 'Not On Track'

    rows.push({
      orgid,
      unit: unitDisplayName(data.orgs, orgid),
      unitName: data.orgs.get(orgid)?.name ?? '',
      totalCadets,
      totalSeniors: unitData.seniors.length,
      isEligible,
      awardStatus,
      criteriaMet: trackableMet,
      criteriaNotMet: trackableNotMet,
      criteriaUnknown: unknown,
      wrightBrothers: pctCell(criteria['cadetAchievement'] as UnitCriterion),
      encampment: pctCell(criteria['encampment'] as UnitCriterion),
      enrollment: pctCell(criteria['enrollment'] as UnitCriterion),
      emergencyServices: pctCell(criteria['emergencyServices'] as UnitCriterion),
      onboarding: pctCell(criteria['onboarding'] as UnitCriterion),
      orientationFlights: pctCell(criteria['orientationFlights'] as UnitCriterion),
      tlcGraduates: pctCell(criteria['tlcGraduates'] as UnitCriterion),
      criteria,
    })
  }

  const statusOrder: Record<string, number> = {
    'On Track': 0,
    'Potentially Eligible': 1,
    'Not On Track': 2,
    'Ineligible (< 10 cadets)': 3,
  }
  rows.sort((a, b) => {
    const diff =
      (statusOrder[a['awardStatus'] as string] ?? 99) - (statusOrder[b['awardStatus'] as string] ?? 99)
    if (diff !== 0) return diff
    if ((a['criteriaMet'] as number) !== (b['criteriaMet'] as number))
      return (b['criteriaMet'] as number) - (a['criteriaMet'] as number)
    return (a['unit'] as string).localeCompare(b['unit'] as string)
  })

  return finish(data, columns, rows, pool.length, {
    cycleStart: isoDate(cycleStart),
    cycleEnd: isoDate(cycleEnd),
    totalUnits: rows.length,
    eligibleUnits: rows.filter(r => r['isEligible'] === true).length,
    onTrackUnits: rows.filter(r => r['awardStatus'] === 'On Track').length,
    view: data.descendants ? 'multi-unit' : 'single-unit',
  })
}

// --- 17. QUA (v1 Index.html:3165-3768; FY window :3169-3177) ---

/** Unit category rules verbatim from v1 Index.html:3192-3207. */
function quaUnitCategory(unitType: string): string | null {
  const type = unitType.toUpperCase()
  if (type.includes('GROUP')) return 'GROUP'
  if (type.includes('WING') || type.includes('REGION') || type.includes('NATIONAL')) return null
  if (type.includes('CADET') && !type.includes('COMPOSITE')) return null
  if (type.includes('COMPOSITE')) return 'COMPOSITE_SQUADRON'
  if (type.includes('SENIOR')) return 'SENIOR_SQUADRON'
  if (type.includes('SQUADRON') || type.includes('FLIGHT')) return 'SENIOR_SQUADRON'
  return null
}

export function generateQUAReport(data: ReportData): ReportResult {
  const columns = [
    col('unit', 'Unit'),
    col('unitCategoryLabel', 'Category'),
    col('totalSeniors', 'Seniors'),
    col('awardStatus', 'Status'),
    col('criteriaMet', 'Criteria Met'),
    col('cadetProtection', 'CP 100%'),
    col('professionalDevelopment', 'PD'),
    col('retention', 'Retention'),
    col('esReadiness', 'ES'),
    col('commandLeadership', 'CMD'),
    col('encampmentSupport', 'Encamp 15%'),
  ]
  const seniors = seniorsOf(data)

  // Great Lakes Region QUA runs on the fiscal year, 1 Oct to 30 Sep, derived
  // at request time (v1 Index.html:3169-3177).
  const y = data.asOf.getFullYear()
  const fyStartYear = data.asOf.getMonth() >= 9 ? y : y - 1
  const fyStart = new Date(fyStartYear, 9, 1)
  const fyEnd = new Date(fyStartYear + 1, 8, 30)

  const training = buildTrainingIndex(data.training)
  const dutiesByCapid = groupByCapid(data.duties)
  const seniorLevelsByCapid = groupByCapid(data.seniorLevels)
  const seniorAwardsByCapid = groupByCapid(data.seniorAwards)
  const activitiesByCapid = groupByCapid(data.cadetActivities)
  const voluCapids = new Set(data.voluInstructors.map(v => v.capid))

  const byOrg = new Map<number, ReportMember[]>()
  for (const s of seniors) {
    const arr = byOrg.get(s.orgid)
    if (arr) arr.push(s)
    else byOrg.set(s.orgid, [s])
  }

  const inFy = (d: Date | null): boolean => d !== null && d >= fyStart && d <= fyEnd
  const LEVEL_2_TO_5 = ['LV2', 'LV3', 'LV4', 'LV5', 'LEVEL II', 'LEVEL III', 'LEVEL IV', 'LEVEL V']

  const rows: Row[] = []
  for (const [orgid, unitSeniors] of byOrg) {
    const { unitNum, unitType } = unitInfoOf(data.orgs, orgid)
    const unitCategory = quaUnitCategory(unitType)
    if (unitCategory === null || unitNum === '000' || unitNum === '999' || orgid === -1) continue

    const totalSeniors = unitSeniors.length
    // PD threshold: 15% for groups, 10% for squadrons (v1 :3246).
    const pdThreshold = unitCategory === 'GROUP' ? 15 : 10

    // Required 1: Cadet Protection 100% current (v1 :3250-3291).
    const cpCurrentCount = unitSeniors.filter(s => {
      const cp = getCadetProtectionStatus(
        s,
        training,
        advancedDutyRequired(s, dutiesByCapid, data.orgs),
        data.asOf,
      )
      return cp.requiredCourses.length === 0 || cp.isCompliant
    }).length
    const cpPercent = totalSeniors > 0 ? Math.round((cpCurrentCount / totalSeniors) * 100) : 0
    const cpMet = cpPercent === 100

    // Required 2: new Level II-V completions in the FY (v1 :3293-3337).
    const pdNewLevelCount = unitSeniors.filter(s => {
      const levels = seniorLevelsByCapid.get(s.capid) ?? []
      const newLevel = levels.some(
        sl => LEVEL_2_TO_5.some(l => sl.lvl.toUpperCase().includes(l)) && inFy(sl.completed),
      )
      if (newLevel) return true
      const awards = seniorAwardsByCapid.get(s.capid) ?? []
      return awards.some(
        a => LEVEL_2_TO_5.some(l => a.award.toUpperCase().includes(l)) && inFy(a.completed),
      )
    }).length
    const pdPercent = totalSeniors > 0 ? Math.round((pdNewLevelCount / totalSeniors) * 100) : 0
    const pdLevelsMet = pdPercent >= pdThreshold

    // Required 2b: no SM stuck beyond 1 year without promoting (v1 :3339-3364).
    const smViolations = unitSeniors.filter(s => {
      if (normalizeRank(s.rank) !== 'SM') return false
      const days = daysSince(s.joined, data.asOf)
      return days !== null && days > 365
    }).length
    const smPromotionMet = smViolations === 0
    const pdMet = pdLevelsMet && smPromotionMet

    // Required 3: 5% growth OR 75% retention from org statistics (v1 :3366-3399).
    const metrics = data.orgStats.perUnit.get(orgid) ?? null
    let retentionMet: boolean | null = null
    let growthRate: number | null = null
    let retentionRate: number | null = null
    if (metrics !== null) {
      const startTotal = metrics.summary.yearAgoTotal
      const netChange = metrics.metrics.growth?.netChangeInPeriod ?? null
      if (startTotal !== null && startTotal > 0 && netChange !== null) {
        growthRate = Math.round((netChange / startTotal) * 100 * 10) / 10
      }
      retentionRate = metrics.metrics.retention?.retentionRate ?? null
      retentionMet =
        (growthRate !== null && growthRate >= 5) || (retentionRate !== null && retentionRate >= 75)
    }

    // Mission 4: ES readiness, 50% GES + 25% ICUT + 15% operational (v1 :3403-3460).
    const activeQual = (s: ReportMember, achvId: number): boolean =>
      (s.esAll ?? []).some(q => q.achvId === achvId && q.status === 'Active')
    const gesCount = unitSeniors.filter(s => activeQual(s, ES_ACHIEVEMENT_IDS.GES)).length
    const gesPercent = totalSeniors > 0 ? Math.round((gesCount / totalSeniors) * 100) : 0
    const icutCount = unitSeniors.filter(s => activeQual(s, ES_ACHIEVEMENT_IDS.ICUT)).length
    const icutPercent = totalSeniors > 0 ? Math.round((icutCount / totalSeniors) * 100) : 0
    const operationalCount = unitSeniors.filter(s =>
      (s.esAll ?? []).some(
        q => QUA_OPERATIONAL_ES_ACHIEVEMENT_IDS.has(q.achvId) && q.status === 'Active',
      ),
    ).length
    const operationalPercent =
      totalSeniors > 0 ? Math.round((operationalCount / totalSeniors) * 100) : 0
    const esReadinessMet = gesPercent >= 50 && icutPercent >= 25 && operationalPercent >= 15

    // Mission 5: 1+ VolU instructor, 25% Yeager, 25% Captain+ (v1 :3462-3524).
    const voluCount = unitSeniors.filter(s => voluCapids.has(s.capid)).length
    const yeagerCount = unitSeniors.filter(s =>
      (seniorAwardsByCapid.get(s.capid) ?? []).some(a =>
        a.award.toUpperCase().includes(QUA_YEAGER_AWARD_NAME),
      ),
    ).length
    const yeagerPercent = totalSeniors > 0 ? Math.round((yeagerCount / totalSeniors) * 100) : 0
    const captainPlusCount = unitSeniors.filter(s => {
      const rank = s.rank.toUpperCase().replace(/[^A-Z ]/g, '').trim()
      return (
        QUA_CAPTAIN_OR_HIGHER_RANKS.has(rank) ||
        [...QUA_CAPTAIN_OR_HIGHER_RANKS].some(r => rank.includes(r))
      )
    }).length
    const captainPlusPercent =
      totalSeniors > 0 ? Math.round((captainPlusCount / totalSeniors) * 100) : 0
    const commandLeadershipMet =
      voluCount >= 1 && yeagerPercent >= 25 && captainPlusPercent >= 25

    // Mission 6: 15% of seniors at encampment during the FY (v1 :3526-3554).
    const encampmentStaffCount = unitSeniors.filter(s =>
      (activitiesByCapid.get(s.capid) ?? []).some(
        a => a.type.toUpperCase().includes('ENCAMP') && inFy(a.completed),
      ),
    ).length
    const encampmentPercent =
      totalSeniors > 0 ? Math.round((encampmentStaffCount / totalSeniors) * 100) : 0
    const encampmentMet = encampmentPercent >= 15

    // 7 of 10 criteria; 4 mission criteria are manual-only (v1 :3556-3600).
    const allCriteriaMet = [
      cpMet,
      pdMet,
      retentionMet,
      esReadinessMet,
      commandLeadershipMet,
      encampmentMet,
      null,
      null,
      null,
      null,
    ]
    const criteriaMet = allCriteriaMet.filter(c => c === true).length
    const criteriaUnknown = allCriteriaMet.filter(c => c === null).length
    const requiredFailed = [cpMet, pdMet, retentionMet].filter(c => c === false).length
    const requiredMet = [cpMet, pdMet, retentionMet].filter(c => c === true).length
    const allRequiredMet = requiredFailed === 0 && requiredMet >= 2

    let awardStatus: string
    if (!allRequiredMet) awardStatus = 'Required Criteria Not Met'
    else if (criteriaMet >= 7) awardStatus = 'On Track'
    else if (criteriaMet + criteriaUnknown >= 7) awardStatus = 'Potentially Eligible'
    else awardStatus = 'Not On Track'

    rows.push({
      orgid,
      unit: unitDisplayName(data.orgs, orgid),
      unitName: data.orgs.get(orgid)?.name ?? '',
      unitCategory,
      unitCategoryLabel: QUA_ELIGIBLE_UNIT_TYPES[unitCategory]?.label ?? unitCategory,
      totalSeniors,
      pdThreshold,
      awardStatus,
      criteriaMet,
      criteriaUnknown,
      allRequiredMet,
      cadetProtection: `${cpMet ? 'Met' : 'Not met'}: ${cpPercent}% (${cpCurrentCount}/${totalSeniors})`,
      professionalDevelopment: `${pdMet ? 'Met' : 'Not met'}: ${pdPercent}% new II-V${smViolations > 0 ? `, ${smViolations} SM > 1yr` : ''}`,
      retention:
        retentionMet === null
          ? 'No data'
          : `${retentionMet ? 'Met' : 'Not met'}: growth ${growthRate ?? 'N/A'}%, retention ${retentionRate ?? 'N/A'}%`,
      esReadiness: `${esReadinessMet ? 'Met' : 'Not met'}: GES ${gesPercent}%, ICUT ${icutPercent}%, Ops ${operationalPercent}%`,
      commandLeadership: `${commandLeadershipMet ? 'Met' : 'Not met'}: VolU ${voluCount}, Yeager ${yeagerPercent}%, Capt+ ${captainPlusPercent}%`,
      encampmentSupport: `${encampmentMet ? 'Met' : 'Not met'}: ${encampmentPercent}% (${encampmentStaffCount}/${totalSeniors})`,
      criteria: {
        cadetProtection: { met: cpMet, percent: cpPercent, count: cpCurrentCount, total: totalSeniors, threshold: 100 },
        professionalDevelopment: {
          met: pdMet,
          percent: pdPercent,
          count: pdNewLevelCount,
          total: totalSeniors,
          threshold: pdThreshold,
          smViolations,
        },
        retention: { met: retentionMet, growth: growthRate, retention: retentionRate },
        esReadiness: {
          met: esReadinessMet,
          ges: { count: gesCount, percent: gesPercent, threshold: 50 },
          icut: { count: icutCount, percent: icutPercent, threshold: 25 },
          operational: { count: operationalCount, percent: operationalPercent, threshold: 15 },
        },
        commandLeadership: {
          met: commandLeadershipMet,
          volu: { count: voluCount, threshold: 1 },
          yeager: { count: yeagerCount, percent: yeagerPercent, threshold: 25 },
          captainPlus: { count: captainPlusCount, percent: captainPlusPercent, threshold: 25 },
        },
        encampmentSupport: {
          met: encampmentMet,
          count: encampmentStaffCount,
          percent: encampmentPercent,
          threshold: 15,
        },
      },
    })
  }

  const statusOrder: Record<string, number> = {
    'On Track': 0,
    'Potentially Eligible': 1,
    'Not On Track': 2,
    'Required Criteria Not Met': 3,
  }
  rows.sort((a, b) => {
    const diff =
      (statusOrder[a['awardStatus'] as string] ?? 99) - (statusOrder[b['awardStatus'] as string] ?? 99)
    if (diff !== 0) return diff
    if ((a['criteriaMet'] as number) !== (b['criteriaMet'] as number))
      return (b['criteriaMet'] as number) - (a['criteriaMet'] as number)
    return (a['unit'] as string).localeCompare(b['unit'] as string)
  })

  return finish(data, columns, rows, seniors.length, {
    fyStart: isoDate(fyStart),
    fyEnd: isoDate(fyEnd),
    fyLabel: `FY${fyStartYear + 1}`,
    totalUnits: rows.length,
    onTrackUnits: rows.filter(r => r['awardStatus'] === 'On Track').length,
    potentialUnits: rows.filter(r => r['awardStatus'] === 'Potentially Eligible').length,
    view: data.descendants ? 'multi-unit' : 'single-unit',
  })
}

// --- 18. Recruiting Trends (v1 Index.html:3773-3883) ---

function unitBreakdownRows(
  data: ReportData,
  pick: (m: JsonOrgStatsMetrics) => Record<string, unknown>,
): Row[] {
  const out: Row[] = []
  for (const [orgid, metrics] of data.orgStats.perUnit) {
    if (metrics === null || orgid === data.orgid) continue
    out.push({ orgid, unitName: unitDisplayName(data.orgs, orgid), ...pick(metrics) })
  }
  return out
}

export function generateRecruitingTrendsReport(data: ReportData): ReportResult {
  const columns = [
    col('month', 'Month'),
    col('newSenior', 'New Seniors'),
    col('newCadet', 'New Cadets'),
    col('rejoinSenior', 'Rejoin Seniors'),
    col('rejoinCadet', 'Rejoin Cadets'),
    col('totalNew', 'Total New'),
    col('totalRejoin', 'Total Rejoin'),
    col('totalRecruited', 'Total Recruited'),
    col('totalMembers', 'Total Members'),
  ]
  const metrics = data.orgStats.scoped
  if (metrics === null || metrics.monthlyData.length === 0) {
    return finish(data, columns, [], data.members.length, {
      error: 'No org statistics data available for the selected unit',
    })
  }

  const rows: Row[] = metrics.monthlyData
    .map(m => ({
      month: m.label,
      date: m.date,
      newSenior: m.senior.new,
      newCadet: m.cadet.new,
      rejoinSenior: m.senior.rejoin,
      rejoinCadet: m.cadet.rejoin,
      totalNew: m.combined.new,
      totalRejoin: m.combined.rejoin,
      totalRecruited: m.combined.new + m.combined.rejoin,
      totalMembers: m.combined.total,
    }))
    .reverse()

  const yoyData: Row[] = []
  if (metrics.monthlyData.length >= 12) {
    for (const m of metrics.monthlyData.slice(-12)) {
      const mDate = reviveDate(m.date)
      if (mDate === null) continue
      const prior = metrics.monthlyData.find(pm => {
        const pmDate = reviveDate(pm.date)
        return (
          pmDate !== null &&
          pmDate.getMonth() === mDate.getMonth() &&
          pmDate.getFullYear() === mDate.getFullYear() - 1
        )
      })
      if (prior !== undefined) {
        const current = m.combined.new + m.combined.rejoin
        const priorTotal = prior.combined.new + prior.combined.rejoin
        yoyData.push({ month: m.label, current, prior: priorTotal, change: current - priorTotal })
      }
    }
  }

  const unitBreakdown = data.descendants
    ? unitBreakdownRows(data, u => ({
        recruitingRate: u.metrics.recruiting?.monthlyAverage ?? null,
        currentTotal: u.summary.currentTotal,
      })).sort(
        (a, b) => ((b['recruitingRate'] as number) ?? 0) - ((a['recruitingRate'] as number) ?? 0),
      )
    : []

  const sum = (f: (r: Row) => number): number => rows.reduce((acc, r) => acc + f(r), 0)
  return finish(data, columns, rows, data.members.length, {
    timeRange: 12,
    totalRecruited: metrics.metrics.recruiting?.totalInPeriod ?? 0,
    monthlyAverage: metrics.metrics.recruiting?.monthlyAverage ?? 0,
    trend: metrics.metrics.recruiting?.trend ?? 'stable',
    trendPercent: metrics.metrics.recruiting?.trendPercent ?? 0,
    seniorTotal: sum(r => (r['newSenior'] as number) + (r['rejoinSenior'] as number)),
    cadetTotal: sum(r => (r['newCadet'] as number) + (r['rejoinCadet'] as number)),
    newTotal: sum(r => r['totalNew'] as number),
    rejoinTotal: sum(r => r['totalRejoin'] as number),
    seasonality: metrics.metrics.seasonality ?? null,
    yoyData,
    unitBreakdown,
    isAggregate: data.descendants,
    dataPoints: metrics.summary.dataPointCount,
  })
}

// --- 19. Retention and Renewal (v1 Index.html:3888-3995) ---

export function generateRetentionAnalysisReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('unit', 'Unit'),
    col('memberType', 'Type'),
    col('expiration', 'Expires'),
    col('daysUntil', 'Days Left'),
    col('urgency', 'Urgency'),
  ]
  const pool = bothOf(data)
  const rows: Row[] = []
  for (const m of pool) {
    if (!isRealExpiration(m.expiration)) continue
    const days = daysUntil(m.expiration, data.asOf)
    if (days !== null && days >= 0 && days <= 90) {
      rows.push({
        capid: m.capid,
        memberName: memberName(m),
        rank: m.rank,
        unit: unitDisplayName(data.orgs, m.orgid),
        memberType: m.isCadetScope ? 'Cadet' : 'Senior',
        expiration: isoDate(m.expiration),
        daysUntil: days,
        urgency: days <= 30 ? 'critical' : days <= 60 ? 'warning' : 'notice',
      })
    }
  }
  rows.sort((a, b) => (a['daysUntil'] as number) - (b['daysUntil'] as number))

  const metrics = data.orgStats.scoped
  const monthlyTrend =
    metrics?.monthlyData
      .map(m => ({ month: m.label, renewals: m.combined.renew, total: m.combined.total }))
      .reverse() ?? []
  const unitBreakdown = data.descendants
    ? unitBreakdownRows(data, u => ({
        retentionRate: u.metrics.retention?.retentionRate ?? null,
        currentTotal: u.summary.currentTotal,
        growthStatus: u.metrics.growth?.status ?? 'unknown',
      })).sort(
        (a, b) => ((b['retentionRate'] as number) ?? 0) - ((a['retentionRate'] as number) ?? 0),
      )
    : []

  return finish(data, columns, rows, pool.length, {
    timeRange: 12,
    retentionRate: metrics?.metrics.retention?.retentionRate ?? null,
    healthIndicator: metrics?.metrics.retention?.healthIndicator ?? 'unknown',
    renewalsInPeriod: metrics?.metrics.retention?.renewalsInPeriod ?? 0,
    estimatedAttrition: metrics?.metrics.retention?.estimatedAttrition ?? 0,
    annualizedAttritionRate: metrics?.metrics.retention?.annualizedAttritionRate ?? null,
    netChange: metrics?.metrics.growth?.netChangeInPeriod ?? 0,
    growthStatus: metrics?.metrics.growth?.status ?? 'unknown',
    currentTotal: metrics?.summary.currentTotal ?? 0,
    memberBreakdown: metrics?.summary.memberBreakdown ?? null,
    monthlyTrend,
    unitBreakdown,
    isAggregate: data.descendants,
    expiringIn30Days: rows.filter(r => (r['daysUntil'] as number) <= 30).length,
    expiringIn60Days: rows.filter(r => (r['daysUntil'] as number) <= 60).length,
    expiringIn90Days: rows.length,
  })
}

// --- 20. CAC Representatives (v1 Index.html:3997-4231) ---

const CAC_POSITION_ORDER: Record<string, number> = {
  ADVISOR: 0,
  CHAIR: 1,
  VICE: 2,
  RECORDER: 3,
  REPRESENTATIVE: 4,
  ALTERNATE: 5,
}

function cacPositionType(text: string, isChairFlag: boolean): string {
  const t = text.toUpperCase()
  if ((isChairFlag || t.includes('CHAIR')) && !t.includes('VICE')) return 'CHAIR'
  if (t.includes('VICE')) return 'VICE'
  if (t.includes('RECORDER') || t.includes('SECRETARY')) return 'RECORDER'
  if (t.includes('ASSISTANT') || t.includes('ALTERNATE')) return 'ALTERNATE'
  return 'REPRESENTATIVE'
}

function cacDutyLevel(dutyText: string): string | null {
  const upper = dutyText.toUpperCase()
  if (upper.includes('NCAC')) return 'National'
  if (upper.includes('RCAC')) return 'Region'
  if (upper.includes('WCAC')) return 'Wing'
  if (upper.includes('GCAC')) return 'Group'
  return null
}

function cacCommitteeLevel(committeeName: string): string | null {
  const upper = committeeName.toUpperCase()
  if (upper.includes('NATIONAL')) return 'National'
  if (upper.includes('REGION')) return 'Region'
  if (upper.includes('WING')) return 'Wing'
  if (upper.includes('GROUP')) return 'Group'
  return null
}

function findAncestorOfType(
  orgs: ReadonlyMap<number, OrgInfo>,
  orgid: number,
  targetType: string,
): OrgInfo | null {
  const visited = new Set<number>()
  let current: number | null = orgid
  while (current !== null && !visited.has(current)) {
    visited.add(current)
    const org = orgs.get(current)
    if (org === undefined) return null
    if (org.type.toUpperCase().includes(targetType)) return org
    current = org.nextLevel !== null && org.nextLevel !== current ? org.nextLevel : null
  }
  return null
}

export function generateCACRepresentativesReport(data: ReportData): ReportResult {
  const columns = [
    col('memberName', 'Member'),
    col('rank', 'Grade'),
    col('positionLabel', 'Position'),
    col('cacLevel', 'CAC Level'),
    col('cacOrgName', 'CAC Body'),
    col('unit', 'Home Unit'),
    col('email', 'Email'),
  ]
  const scopeOrg = data.orgs.get(data.orgid)
  const scopeType = (scopeOrg?.type ?? '').toUpperCase()
  const isWingLevel = scopeType.includes('WING')
  const isGroupLevel = scopeType.includes('GROUP')
  const scopeLevel = isWingLevel ? 'WING' : isGroupLevel ? 'GROUP' : 'SQUADRON'
  const scopeLevelName = isWingLevel ? 'Wing' : isGroupLevel ? 'Group' : 'Squadron'

  const membersByCapid = new Map<number, ReportMember>()
  for (const m of data.members) membersByCapid.set(m.capid, m)
  for (const m of data.extraMembers) if (!membersByCapid.has(m.capid)) membersByCapid.set(m.capid, m)

  const cacOrgDisplayName = (cacLevel: string, memberOrgid: number): string => {
    if (cacLevel === 'National' || cacLevel === 'Region') return cacLevel
    if (cacLevel === 'Wing') {
      const wing = findAncestorOfType(data.orgs, memberOrgid, 'WING')
      return wing !== null ? unitDisplayName(data.orgs, wing.orgid) : 'Wing'
    }
    if (cacLevel === 'Group') {
      const group = findAncestorOfType(data.orgs, memberOrgid, 'GROUP')
      return group !== null ? unitDisplayName(data.orgs, group.orgid) : 'Group'
    }
    return unitDisplayName(data.orgs, memberOrgid)
  }

  interface CacRecord extends Row {
    capid: number
    memberName: string
    cacLevel: string
    positionType: string
    sortOrder: number
    cacOrgName: string
  }

  const buildRecord = (capid: number, positionType: string, cacLevel: string): CacRecord | null => {
    const member = membersByCapid.get(capid)
    if (member === undefined) return null
    // Seniors on CAC serve as advisors regardless of the recorded position
    // (v1 Index.html:4080-4084; CAPR 60-1 CAC composition).
    const isSenior = member.isSeniorScope
    const finalType = isSenior ? 'ADVISOR' : positionType
    const finalLabel = isSenior
      ? 'Advisor'
      : positionType.charAt(0) + positionType.slice(1).toLowerCase()
    return {
      capid: member.capid,
      memberName: memberName(member),
      rank: member.rank !== '' ? member.rank : 'N/A',
      isSeniorAdvisor: isSenior,
      unit: unitDisplayName(data.orgs, member.orgid),
      positionType: finalType,
      positionLabel: finalLabel,
      cacLevel,
      cacOrgName: cacOrgDisplayName(cacLevel, member.orgid),
      email: data.emails.get(member.capid) ?? '',
      sortOrder: CAC_POSITION_ORDER[finalType] ?? 99,
    }
  }

  const isChair = (chair: string | null): boolean => {
    const c = (chair ?? '').trim().toUpperCase()
    return c === '1' || c === 'TRUE'
  }

  // Section 1: the scope's own council (v1 :4101-4151).
  const scopeReps: CacRecord[] = []
  const scopeDutyPrefix = isWingLevel ? 'WCAC' : isGroupLevel ? 'GCAC' : null
  for (const d of data.cacDuties) {
    const dutyUpper = d.duty.toUpperCase()
    if (dutyUpper.includes('#REF')) continue
    if (scopeDutyPrefix !== null && !dutyUpper.includes(scopeDutyPrefix)) continue
    const record = buildRecord(d.capid, cacPositionType(dutyUpper, false), cacDutyLevel(dutyUpper) ?? scopeLevelName)
    if (
      record !== null &&
      !scopeReps.some(
        r =>
          r.capid === record.capid &&
          r.cacLevel === record.cacLevel &&
          r.positionType === record.positionType,
      )
    ) {
      scopeReps.push(record)
    }
  }
  for (const c of data.committees) {
    const committeeName = c.committee.toUpperCase()
    if (!committeeName.includes('CADET ADVISORY COUNCIL')) continue
    if (isWingLevel && !(committeeName.includes('WING') || !committeeName.includes('GROUP'))) continue
    if (isGroupLevel && !(committeeName.includes('GROUP') || !committeeName.includes('WING'))) continue
    const record = buildRecord(
      c.capid,
      cacPositionType(c.committee, isChair(c.chair)),
      cacCommitteeLevel(c.committee) ?? scopeLevelName,
    )
    if (
      record !== null &&
      !scopeReps.some(
        r =>
          r.capid === record.capid &&
          r.cacLevel === record.cacLevel &&
          r.positionType === record.positionType,
      )
    ) {
      scopeReps.push(record)
    }
  }
  scopeReps.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.memberName.localeCompare(b.memberName)
  })

  // Section 2: every CAC assignment in scope (v1 :4153-4197).
  const allRepsMap = new Map<string, CacRecord>()
  for (const d of data.cacDuties) {
    const dutyUpper = d.duty.toUpperCase()
    if (dutyUpper.includes('#REF')) continue
    const record = buildRecord(d.capid, cacPositionType(dutyUpper, false), cacDutyLevel(dutyUpper) ?? scopeLevelName)
    if (record !== null) {
      const key = `${record.capid}-${record.cacLevel}-${record.positionType}`
      if (!allRepsMap.has(key)) allRepsMap.set(key, record)
    }
  }
  for (const c of data.committees) {
    if (!c.committee.toUpperCase().includes('CADET ADVISORY COUNCIL')) continue
    const record = buildRecord(
      c.capid,
      cacPositionType(c.committee, isChair(c.chair)),
      cacCommitteeLevel(c.committee) ?? scopeLevelName,
    )
    if (record !== null) {
      const key = `${record.capid}-${record.cacLevel}-${record.positionType}`
      if (!allRepsMap.has(key)) allRepsMap.set(key, record)
    }
  }

  const levelOrder: Record<string, number> = { National: 1, Region: 2, Wing: 3, Group: 4, Squadron: 5 }
  const allReps = [...allRepsMap.values()].sort((a, b) => {
    const la = levelOrder[a.cacLevel] ?? 99
    const lb = levelOrder[b.cacLevel] ?? 99
    if (la !== lb) return la - lb
    if (a.cacOrgName !== b.cacOrgName) return a.cacOrgName.localeCompare(b.cacOrgName)
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.memberName.localeCompare(b.memberName)
  })

  const groupedReps: { key: string; cacLevel: string; cacOrgName: string; members: CacRecord[] }[] = []
  for (const rep of allReps) {
    const key = `${rep.cacLevel}-${rep.cacOrgName}`
    const last = groupedReps[groupedReps.length - 1]
    if (last === undefined || last.key !== key) {
      groupedReps.push({ key, cacLevel: rep.cacLevel, cacOrgName: rep.cacOrgName, members: [rep] })
    } else {
      last.members.push(rep)
    }
  }

  return finish(data, columns, allReps, data.members.length, {
    scopeLevel,
    scopeLabel: isWingLevel
      ? 'Wing Cadet Advisory Council'
      : isGroupLevel
        ? 'Group Cadet Advisory Council'
        : 'Squadron CAC Representatives',
    scopeOrgName:
      scopeOrg !== undefined
        ? `${unitDisplayName(data.orgs, data.orgid)} ${scopeOrg.name}`.trim()
        : 'Unknown Unit',
    scopeReps,
    groupedReps,
    totalScopeReps: scopeReps.length,
    totalAllReps: allReps.length,
  })
}
