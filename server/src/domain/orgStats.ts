/**
 * Recruiting & Retention analysis over ORGStatistics monthly counts, ported
 * from v1 ServicesOrgStatsDataService.html. The whole scoring model
 * (recruiting/retention/growth/stability weights, fallbacks, and bands) is v1
 * engineering judgment, not from a CAP publication.
 */
import type { Dataset, OrgStatisticRow } from './dataset.js'

export type MemberCategory = 'senior' | 'cadet' | 'cadetSponsor' | 'patron' | 'other'

/** Bucket keys usable as the mbrType metric filter. */
export type BucketKey = 'senior' | 'cadet' | 'cadetSponsor' | 'patron' | 'combined' | 'all'

// v1 ServicesOrgStatsDataService.html:26-34: FIFTY YEAR and LIFE count as seniors.
const MEMBER_TYPE_MAP: Readonly<Record<string, MemberCategory>> = {
  SENIOR: 'senior',
  'FIFTY YEAR': 'senior',
  LIFE: 'senior',
  CADET: 'cadet',
  'CADET SPONSOR': 'cadetSponsor',
  PATRON: 'patron',
  AEM: 'other',
}

export function classifyMemberType(rawType: string | null | undefined): MemberCategory {
  const normalized = (rawType ?? '').trim().toUpperCase()
  return MEMBER_TYPE_MAP[normalized] ?? 'other'
}

export interface MetricExplanation {
  label: string
  shortDesc: string
  fullDesc: string
  howToImprove?: string
  goodValue?: string
  formula?: string
}

/** UI help text carried from v1 (ServicesOrgStatsDataService.html:40-110). */
export const METRIC_EXPLANATIONS: Readonly<Record<string, MetricExplanation>> = {
  recruitingRate: {
    label: 'Recruiting Rate',
    shortDesc: 'New + returning members per month',
    fullDesc:
      'Average number of new members and rejoining former members your unit gains each month. This shows how effective your recruiting efforts are.',
    howToImprove:
      'Host open houses, attend community events, leverage social media, partner with schools and community organizations.',
    goodValue: '2+ per month for squadrons',
    formula: '(New Members + Rejoins) / Number of Months',
  },
  retentionRate: {
    label: 'Retention Rate',
    shortDesc: 'Percentage of members who renew',
    fullDesc:
      'Of members eligible for renewal, what percentage actually renewed their membership. High retention means members find value in CAP.',
    howToImprove:
      'Engage members in meaningful activities, recognize achievements, maintain regular communication, address concerns promptly.',
    goodValue: '80%+ is healthy',
    formula: 'Renewals / (Renewals + Estimated Attrition) x 100',
  },
  netChange: {
    label: 'Net Growth',
    shortDesc: '12-month membership change',
    fullDesc:
      'The difference between your current membership and 12 months ago. Positive means growth, negative means decline.',
    howToImprove:
      'Focus on both recruiting AND retention. Growing units recruit enough to offset natural attrition plus add new members.',
    goodValue: 'Positive growth year-over-year',
    formula: 'Current Total - Total 12 Months Ago',
  },
  stability: {
    label: 'Stability',
    shortDesc: 'Month-to-month consistency',
    fullDesc:
      'How consistent your membership numbers are month-to-month. High stability means predictable membership levels.',
    howToImprove:
      'Steady recruiting throughout the year, proactive retention outreach before expiration dates.',
    goodValue: 'Low variation (<10%)',
    formula: 'Based on coefficient of variation in monthly totals',
  },
  attritionRate: {
    label: 'Attrition Rate',
    shortDesc: 'Members lost per year',
    fullDesc:
      'The estimated number of members your unit loses annually through non-renewal or transfer. Understanding attrition helps you plan recruiting to maintain or grow membership.',
    howToImprove:
      'Focus on member engagement, address concerns early, ensure meaningful activities for all members.',
    goodValue: 'Lower than recruiting rate',
    formula: 'Estimated from: Recruited - Net Change',
  },
  newMembers: {
    label: 'New Members',
    shortDesc: 'First-time joins + returning members',
    fullDesc:
      'Total count of brand new members who joined plus former members who rejoined during the time period.',
    howToImprove:
      'Host open houses, partner with schools, leverage social media, attend community events.',
    goodValue: 'At least 2 per month for squadrons',
  },
  renewals: {
    label: 'Renewals',
    shortDesc: 'Members who renewed membership',
    fullDesc:
      'Count of existing members who renewed their annual membership during the time period. High renewals indicate member satisfaction.',
    howToImprove: 'Send reminders before expiration, keep members engaged with meaningful activities.',
    goodValue: 'Higher than attrition',
  },
  dataPoints: {
    label: 'Data Points',
    shortDesc: 'Months of data analyzed',
    fullDesc:
      'The number of monthly data points included in this analysis. More data points provide more reliable trends and seasonality patterns.',
    howToImprove: 'Select a longer time range to see more historical data.',
    goodValue: '24+ months for seasonality analysis',
  },
  sustainability: {
    label: 'Sustainability Score',
    shortDesc: 'Overall membership health',
    fullDesc:
      'A composite score (0-100) combining recruiting, retention, growth, and stability. Higher scores indicate a healthier, more sustainable unit.',
    howToImprove: 'Address your lowest-scoring component first for the biggest impact.',
    goodValue: '65+ is good, 80+ is excellent',
    formula: '25% Recruiting + 35% Retention + 25% Growth + 15% Stability',
  },
}

export interface MonthlyBucket {
  total: number
  new: number
  renew: number
  rejoin: number
}

export interface MonthlyEntry {
  date: Date
  label: string
  senior: MonthlyBucket
  cadet: MonthlyBucket
  cadetSponsor: MonthlyBucket
  patron: MonthlyBucket
  combined: MonthlyBucket
  all: MonthlyBucket
}

const createBucket = (): MonthlyBucket => ({ total: 0, new: 0, renew: 0, rejoin: 0 })

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function getDataForOrg(dataset: Dataset, orgids: ReadonlySet<number>): OrgStatisticRow[] {
  return dataset.orgStatistics.filter(row => orgids.has(row.orgid))
}

export function getDataInTimeRange(
  rows: readonly OrgStatisticRow[],
  startDate: Date,
  endDate: Date,
): OrgStatisticRow[] {
  return rows.filter(row => row.cntDate !== null && row.cntDate >= startDate && row.cntDate <= endDate)
}

/**
 * Monthly buckets per member category with combined (senior + cadet, the
 * operational membership) and all totals (v1 :190-264). CntType matching:
 * TOTAL exact, then RENEW before NEW because "RENEW" contains "NEW"; rows in
 * the 'other' category (AEM etc.) are not bucketed, exactly as v1.
 */
export function aggregateByMonth(
  rows: readonly OrgStatisticRow[],
  filterCategories: readonly MemberCategory[] | null = null,
): MonthlyEntry[] {
  const monthlyData = new Map<number, MonthlyEntry>()

  for (const row of rows) {
    if (row.cntDate === null) continue
    const category = classifyMemberType(row.mbrType)
    if (filterCategories !== null && !filterCategories.includes(category)) continue

    const dateKey = row.cntDate.getTime()
    const cntType = row.cntType.trim().toUpperCase()
    const quantity = row.quantity

    let entry = monthlyData.get(dateKey)
    if (entry === undefined) {
      entry = {
        date: row.cntDate,
        label: formatMonthLabel(row.cntDate),
        senior: createBucket(),
        cadet: createBucket(),
        cadetSponsor: createBucket(),
        patron: createBucket(),
        combined: createBucket(),
        all: createBucket(),
      }
      monthlyData.set(dateKey, entry)
    }

    const targetBucket =
      category === 'senior'
        ? entry.senior
        : category === 'cadet'
          ? entry.cadet
          : category === 'cadetSponsor'
            ? entry.cadetSponsor
            : category === 'patron'
              ? entry.patron
              : null
    if (targetBucket === null) continue

    if (cntType === 'TOTAL') targetBucket.total += quantity
    else if (cntType.includes('RENEW')) targetBucket.renew += quantity
    else if (cntType.includes('REJOIN')) targetBucket.rejoin += quantity
    else if (cntType.includes('NEW')) targetBucket.new += quantity
  }

  for (const entry of monthlyData.values()) {
    entry.combined.total = entry.senior.total + entry.cadet.total
    entry.combined.new = entry.senior.new + entry.cadet.new
    entry.combined.renew = entry.senior.renew + entry.cadet.renew
    entry.combined.rejoin = entry.senior.rejoin + entry.cadet.rejoin

    entry.all.total = entry.senior.total + entry.cadet.total + entry.cadetSponsor.total + entry.patron.total
    entry.all.new = entry.senior.new + entry.cadet.new + entry.cadetSponsor.new + entry.patron.new
    entry.all.renew = entry.senior.renew + entry.cadet.renew + entry.cadetSponsor.renew + entry.patron.renew
    entry.all.rejoin =
      entry.senior.rejoin + entry.cadet.rejoin + entry.cadetSponsor.rejoin + entry.patron.rejoin
  }

  return [...monthlyData.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

export interface RecruitingMetrics {
  totalInPeriod: number
  monthlyAverage: number
  trend: 'increasing' | 'decreasing' | 'stable'
  trendPercent: number
  explanation: MetricExplanation
}

export function calculateRecruitingThroughput(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
  timeRangeMonths = 12,
): RecruitingMetrics | null {
  if (monthlyData.length === 0) return null

  const numMonths = timeRangeMonths === 0 ? monthlyData.length : Math.min(timeRangeMonths, monthlyData.length)
  const recentMonths = monthlyData.slice(-numMonths)

  const totalRecruited = recentMonths.reduce((sum, m) => sum + m[mbrType].new + m[mbrType].rejoin, 0)
  const avgMonthlyRecruiting = totalRecruited / recentMonths.length

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  let trendPercent = 0

  if (monthlyData.length >= numMonths * 2) {
    const priorMonths = monthlyData.slice(-numMonths * 2, -numMonths)
    const priorRecruited = priorMonths.reduce((sum, m) => sum + m[mbrType].new + m[mbrType].rejoin, 0)
    const priorAvg = priorRecruited / priorMonths.length
    if (priorAvg > 0) {
      trendPercent = ((avgMonthlyRecruiting - priorAvg) / priorAvg) * 100
      trend = trendPercent > 5 ? 'increasing' : trendPercent < -5 ? 'decreasing' : 'stable'
    }
  }

  return {
    totalInPeriod: totalRecruited,
    monthlyAverage: Math.round(avgMonthlyRecruiting * 10) / 10,
    trend,
    trendPercent: Math.round(trendPercent * 10) / 10,
    explanation: METRIC_EXPLANATIONS['recruitingRate'] as MetricExplanation,
  }
}

export interface RetentionMetrics {
  renewalsInPeriod: number
  estimatedAttrition: number
  annualizedAttritionRate: number | null
  retentionRate: number | null
  healthIndicator: 'unknown' | 'healthy' | 'moderate' | 'at-risk'
  explanation: MetricExplanation
  attritionExplanation: MetricExplanation
}

/**
 * Retention estimated as Renewals / (Renewals + Estimated Attrition), where
 * attrition = recruited - net change. When no attrition is detectable v1
 * hardcodes 95 (stable or growing) or 75 (renewals but no attrition estimate);
 * ported as-is (v1 :356-364).
 */
export function calculateRetentionLoad(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
  timeRangeMonths = 12,
): RetentionMetrics | null {
  if (monthlyData.length < 2) return null

  const numMonths = timeRangeMonths === 0 ? monthlyData.length : Math.min(timeRangeMonths, monthlyData.length)
  const recentMonths = monthlyData.slice(-numMonths)
  if (recentMonths.length < 2) return null

  const totalRenewals = recentMonths.reduce((sum, m) => sum + m[mbrType].renew, 0)
  const totalRecruited = recentMonths.reduce((sum, m) => sum + m[mbrType].new + m[mbrType].rejoin, 0)

  const first = recentMonths[0]
  const last = recentMonths[recentMonths.length - 1]
  if (first === undefined || last === undefined) return null
  const startTotal = first[mbrType].total
  const endTotal = last[mbrType].total
  const netChange = endTotal - startTotal

  const estimatedAttrition = Math.max(0, totalRecruited - netChange)

  let retentionRate: number | null = null
  if (totalRenewals + estimatedAttrition > 0) {
    retentionRate = (totalRenewals / (totalRenewals + estimatedAttrition)) * 100
  } else if (startTotal > 0 && endTotal >= startTotal) {
    retentionRate = 95
  } else if (totalRenewals > 0) {
    retentionRate = 75
  }

  if (retentionRate !== null) {
    retentionRate = Math.min(100, Math.max(0, retentionRate))
  }

  const healthIndicator =
    retentionRate === null
      ? 'unknown'
      : retentionRate >= 80
        ? 'healthy'
        : retentionRate >= 60
          ? 'moderate'
          : 'at-risk'

  const monthsOfData = recentMonths.length
  const annualizedAttrition =
    startTotal > 0 ? (estimatedAttrition / startTotal) * 100 * (12 / monthsOfData) : null

  return {
    renewalsInPeriod: totalRenewals,
    estimatedAttrition: Math.round(estimatedAttrition),
    annualizedAttritionRate:
      annualizedAttrition !== null ? Math.round(annualizedAttrition * 10) / 10 : null,
    retentionRate: retentionRate !== null ? Math.round(retentionRate * 10) / 10 : null,
    healthIndicator,
    explanation: METRIC_EXPLANATIONS['retentionRate'] as MetricExplanation,
    attritionExplanation: METRIC_EXPLANATIONS['attritionRate'] as MetricExplanation,
  }
}

export interface GrowthMetrics {
  netChangeInPeriod: number
  totalRecruited: number
  replacementNeeded: number
  growthContribution: number
  growthRatio: number
  status: 'growing' | 'stable' | 'declining'
  explanation: MetricExplanation
}

export function calculateGrowthAnalysis(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
  timeRangeMonths = 12,
): GrowthMetrics | null {
  if (monthlyData.length < 2) return null

  const numMonths = timeRangeMonths === 0 ? monthlyData.length : Math.min(timeRangeMonths, monthlyData.length)
  const recentMonths = monthlyData.slice(-numMonths)
  if (recentMonths.length < 2) return null

  const first = recentMonths[0]
  const last = recentMonths[recentMonths.length - 1]
  if (first === undefined || last === undefined) return null

  const netChange = last[mbrType].total - first[mbrType].total
  const totalRecruited = recentMonths.reduce((sum, m) => sum + m[mbrType].new + m[mbrType].rejoin, 0)

  const replacementNeeded = totalRecruited - netChange
  const growthContribution = netChange > 0 ? netChange : 0
  const growthRatio = totalRecruited > 0 ? (growthContribution / totalRecruited) * 100 : 0

  return {
    netChangeInPeriod: netChange,
    totalRecruited,
    replacementNeeded: Math.max(0, replacementNeeded),
    growthContribution,
    growthRatio: Math.round(growthRatio),
    status: netChange > 0 ? 'growing' : netChange === 0 ? 'stable' : 'declining',
    explanation: METRIC_EXPLANATIONS['netChange'] as MetricExplanation,
  }
}

export interface SeasonalityPattern {
  month: string
  monthIndex: number
  avgRecruiting: number
  avgRenewals: number
}

export interface SeasonalityMetrics {
  patterns: SeasonalityPattern[]
  peakMonths: string[]
  lowMonths: string[]
}

export function calculateSeasonality(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
): SeasonalityMetrics | null {
  // Seasonality needs 24+ months of data for pattern detection (v1 :438).
  if (monthlyData.length < 24) return null

  const monthlyAverages = Array.from({ length: 12 }, () => ({
    count: 0,
    totalNew: 0,
    totalRejoin: 0,
    totalRenew: 0,
  }))

  for (const m of monthlyData) {
    const bucket = monthlyAverages[m.date.getMonth()]
    if (bucket === undefined) continue
    bucket.count++
    bucket.totalNew += m[mbrType].new
    bucket.totalRejoin += m[mbrType].rejoin
    bucket.totalRenew += m[mbrType].renew
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const patterns: SeasonalityPattern[] = monthlyAverages.map((bucket, idx) => ({
    month: monthNames[idx] ?? '',
    monthIndex: idx,
    avgRecruiting: bucket.count > 0 ? (bucket.totalNew + bucket.totalRejoin) / bucket.count : 0,
    avgRenewals: bucket.count > 0 ? bucket.totalRenew / bucket.count : 0,
  }))

  const sorted = [...patterns].sort((a, b) => b.avgRecruiting - a.avgRecruiting)

  return {
    patterns,
    peakMonths: sorted.slice(0, 3).map(p => p.month),
    lowMonths: sorted.slice(-3).reverse().map(p => p.month),
  }
}

export interface VolatilityMetrics {
  standardDeviation: number
  coefficientOfVariation: number
  maxMonthlySwing: number
  stabilityRating: 'very-stable' | 'stable' | 'moderate' | 'volatile'
  explanation: MetricExplanation
}

export function calculateVolatility(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
  timeRangeMonths = 12,
): VolatilityMetrics | null {
  if (monthlyData.length < 6) return null

  const numMonths = timeRangeMonths === 0 ? monthlyData.length : Math.min(timeRangeMonths, monthlyData.length)
  const recentMonths = monthlyData.slice(-numMonths)
  const totals = recentMonths.map(m => m[mbrType].total).filter(t => t > 0)

  if (totals.length < 3) return null

  const mean = totals.reduce((sum, t) => sum + t, 0) / totals.length
  const variance = totals.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / totals.length
  const stdDev = Math.sqrt(variance)
  const coeffOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0

  let maxSwing = 0
  for (let i = 1; i < totals.length; i++) {
    const swing = Math.abs((totals[i] ?? 0) - (totals[i - 1] ?? 0))
    if (swing > maxSwing) maxSwing = swing
  }

  return {
    standardDeviation: Math.round(stdDev * 10) / 10,
    coefficientOfVariation: Math.round(coeffOfVariation * 10) / 10,
    maxMonthlySwing: maxSwing,
    stabilityRating:
      coeffOfVariation < 5
        ? 'very-stable'
        : coeffOfVariation < 10
          ? 'stable'
          : coeffOfVariation < 20
            ? 'moderate'
            : 'volatile',
    explanation: METRIC_EXPLANATIONS['stability'] as MetricExplanation,
  }
}

export interface SustainabilityComponent {
  name: string
  score: number
  label: string
}

export interface SustainabilityMetrics {
  overallScore: number
  components: { recruiting: number; retention: number; growth: number; stability: number }
  rating: 'excellent' | 'good' | 'fair' | 'needs-attention'
  summary: string
  focusArea: SustainabilityComponent
  explanation: MetricExplanation
}

/**
 * Composite sustainability score. The 25/35/25/15 weights, the per-component
 * step scores, the 50/70 defaults for missing inputs, and the 80/65/50 bands
 * are v1 engineering judgment (ServicesOrgStatsDataService.html:525-581), not
 * a CAP publication.
 */
export function calculateSustainability(
  monthlyData: readonly MonthlyEntry[],
  mbrType: BucketKey = 'combined',
  timeRangeMonths = 12,
): SustainabilityMetrics | null {
  const recruiting = calculateRecruitingThroughput(monthlyData, mbrType, timeRangeMonths)
  const retention = calculateRetentionLoad(monthlyData, mbrType, timeRangeMonths)
  const growth = calculateGrowthAnalysis(monthlyData, mbrType, timeRangeMonths)
  const volatility = calculateVolatility(monthlyData, mbrType, timeRangeMonths)

  if (recruiting === null && retention === null && growth === null && volatility === null) return null

  const recruitingScore = recruiting !== null ? Math.min(100, recruiting.monthlyAverage * 20) : 50
  const retentionScore = retention?.retentionRate ?? 50
  const growthScore =
    growth !== null
      ? growth.status === 'growing'
        ? 80 + Math.min(20, growth.netChangeInPeriod * 2)
        : growth.status === 'stable'
          ? 60
          : Math.max(0, 50 + growth.netChangeInPeriod * 5)
      : 50
  const stabilityScore =
    volatility !== null
      ? volatility.stabilityRating === 'very-stable'
        ? 100
        : volatility.stabilityRating === 'stable'
          ? 80
          : volatility.stabilityRating === 'moderate'
            ? 60
            : 40
      : 70

  const overallScore =
    recruitingScore * 0.25 + retentionScore * 0.35 + growthScore * 0.25 + stabilityScore * 0.15

  const componentScores: SustainabilityComponent[] = [
    { name: 'recruiting', score: recruitingScore, label: 'Recruiting' },
    { name: 'retention', score: retentionScore, label: 'Retention' },
    { name: 'growth', score: growthScore, label: 'Growth' },
    { name: 'stability', score: stabilityScore, label: 'Stability' },
  ]
  const lowestComponent = [...componentScores].sort((a, b) => a.score - b.score)[0] as SustainabilityComponent

  return {
    overallScore: Math.round(overallScore),
    components: {
      recruiting: Math.round(recruitingScore),
      retention: Math.round(retentionScore),
      growth: Math.round(growthScore),
      stability: Math.round(stabilityScore),
    },
    rating:
      overallScore >= 80 ? 'excellent' : overallScore >= 65 ? 'good' : overallScore >= 50 ? 'fair' : 'needs-attention',
    summary:
      overallScore >= 80
        ? 'Unit membership is healthy and sustainable'
        : overallScore >= 65
          ? 'Unit membership is stable with room for improvement'
          : overallScore >= 50
            ? 'Unit should focus on retention and recruiting'
            : 'Unit membership needs immediate attention',
    focusArea: lowestComponent,
    explanation: METRIC_EXPLANATIONS['sustainability'] as MetricExplanation,
  }
}

function monthsAgo(asOf: Date, months: number): Date {
  const date = new Date(asOf)
  date.setMonth(date.getMonth() - months)
  return date
}

/**
 * Zero-based month counter (year*12 + month) for calendar-month arithmetic.
 * ORGStatistics CntDate arrives either as a UTC-midnight Date (parse layer)
 * or a local-midnight Date (pg date columns); the same UTC-midnight rule
 * api/util.ts isoDate applies preserves the intended calendar month here.
 */
export function monthIndexOf(d: Date): number {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.getUTCFullYear() * 12 + d.getUTCMonth()
  }
  return d.getFullYear() * 12 + d.getMonth()
}

/**
 * The entry for the calendar month exactly `monthsBack` before the latest
 * data month, or undefined when that month is absent from the series. Never
 * select by array position: monthly series can carry gaps, and length-12 is
 * only 11 calendar months before the latest entry (the off-by-one that made
 * every 12-month delta compare against the wrong month).
 */
export function entryMonthsBefore(
  monthlyData: readonly MonthlyEntry[],
  monthsBack: number,
): MonthlyEntry | undefined {
  const latest = monthlyData[monthlyData.length - 1]
  if (latest === undefined) return undefined
  const target = monthIndexOf(latest.date) - monthsBack
  return monthlyData.find(m => monthIndexOf(m.date) === target)
}

export interface MemberBreakdown {
  senior: number
  cadet: number
  cadetSponsor: number
  patron: number
  combined: number
  all: number
}

export interface UnitOrgStatsMetrics {
  monthlyData: MonthlyEntry[]
  metrics: {
    recruiting: RecruitingMetrics | null
    retention: RetentionMetrics | null
    growth: GrowthMetrics | null
    seasonality: SeasonalityMetrics | null
    volatility: VolatilityMetrics | null
    sustainability: SustainabilityMetrics | null
  }
  summary: {
    currentTotal: number
    yearAgoTotal: number | null
    dataPointCount: number
    memberBreakdown: MemberBreakdown | null
  }
}

export interface OrgStatsOptions {
  timeRangeMonths?: number
  mbrType?: BucketKey
}

/**
 * Comprehensive recruiting/retention metrics for a set of orgs (the caller
 * passes self or subtree org ids). Analysis pulls at least 24 months (or 2x
 * the requested range) for trend comparison; the display slice is the
 * requested range (v1 :588-653).
 */
export function getMetricsForUnit(
  dataset: Dataset,
  orgids: ReadonlySet<number>,
  options: OrgStatsOptions,
  asOf: Date,
): UnitOrgStatsMetrics | null {
  const timeRangeMonths = options.timeRangeMonths ?? 12
  const mbrType = options.mbrType ?? 'combined'

  const unitData = getDataForOrg(dataset, orgids)
  if (unitData.length === 0) return null

  const isAllTime = timeRangeMonths === 0
  const analysisMonths = isAllTime ? 999 : Math.max(timeRangeMonths * 2, 24)
  const startDate = isAllTime ? new Date(2000, 0, 1) : monthsAgo(asOf, analysisMonths)
  const filteredData = getDataInTimeRange(unitData, startDate, asOf)
  const monthlyData = aggregateByMonth(filteredData)

  const displayData = isAllTime ? monthlyData : monthlyData.slice(-timeRangeMonths)

  const latestMonth = displayData.length > 0 ? displayData[displayData.length - 1] : undefined
  const currentTotal = latestMonth !== undefined ? latestMonth[mbrType].total : 0

  // The calendar month exactly 12 before the latest data month (null when
  // that month is absent), so the delta always compares like month to like
  // month even with reporting lag or gaps in the series.
  const yearAgoEntry = entryMonthsBefore(monthlyData, 12)
  const yearAgoTotal = yearAgoEntry !== undefined ? yearAgoEntry[mbrType].total : null

  const memberBreakdown: MemberBreakdown | null =
    latestMonth !== undefined
      ? {
          senior: latestMonth.senior.total,
          cadet: latestMonth.cadet.total,
          cadetSponsor: latestMonth.cadetSponsor.total,
          patron: latestMonth.patron.total,
          combined: latestMonth.combined.total,
          all: latestMonth.all.total,
        }
      : null

  return {
    monthlyData: displayData,
    metrics: {
      recruiting: calculateRecruitingThroughput(monthlyData, mbrType, timeRangeMonths),
      retention: calculateRetentionLoad(monthlyData, mbrType, timeRangeMonths),
      growth: calculateGrowthAnalysis(monthlyData, mbrType, timeRangeMonths),
      seasonality: calculateSeasonality(monthlyData, mbrType),
      volatility: calculateVolatility(monthlyData, mbrType, timeRangeMonths),
      sustainability: calculateSustainability(monthlyData, mbrType, timeRangeMonths),
    },
    summary: {
      currentTotal,
      yearAgoTotal,
      dataPointCount: displayData.length,
      memberBreakdown,
    },
  }
}

export function hasDataForUnit(dataset: Dataset, orgids: ReadonlySet<number>): boolean {
  return dataset.orgStatistics.some(row => orgids.has(row.orgid))
}

export interface UnitOrgStatsKeyData {
  currentTotal: number
  yearOverYearChange: number | null
  sustainabilityScore: number | null
  sustainabilityRating: string
  trendDirection: string
  retentionRate: number | null
}

export function getKeyDataForUnit(
  dataset: Dataset,
  orgids: ReadonlySet<number>,
  options: OrgStatsOptions,
  asOf: Date,
): UnitOrgStatsKeyData {
  const fullMetrics = getMetricsForUnit(dataset, orgids, options, asOf)
  if (fullMetrics === null) {
    return {
      currentTotal: 0,
      yearOverYearChange: null,
      sustainabilityScore: null,
      sustainabilityRating: 'unknown',
      trendDirection: 'unknown',
      retentionRate: null,
    }
  }
  return {
    currentTotal: fullMetrics.summary.currentTotal,
    yearOverYearChange:
      fullMetrics.summary.yearAgoTotal !== null
        ? fullMetrics.summary.currentTotal - fullMetrics.summary.yearAgoTotal
        : null,
    sustainabilityScore: fullMetrics.metrics.sustainability?.overallScore ?? null,
    sustainabilityRating: fullMetrics.metrics.sustainability?.rating ?? 'unknown',
    trendDirection: fullMetrics.metrics.recruiting?.trend ?? 'unknown',
    retentionRate: fullMetrics.metrics.retention?.retentionRate ?? null,
  }
}
