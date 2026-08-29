import clsx from 'clsx'
import { Lightbulb, TrendingDown, TrendingUp, UserPlus } from 'lucide-react'
import { Badge, Card, EmptyState, ProgressBar, type Tone } from '../../components/ui'
import type { OrgStats } from './useOverviewData'

type Sustainability = NonNullable<OrgStats['metrics']['sustainability']>

/** Bands 80/65/50 (v1 ServicesOrgStatsDataService.html:525-581, engineering judgment). */
const sustainabilityTone: Record<Sustainability['rating'], Tone> = {
  excellent: 'green',
  good: 'blue',
  fair: 'amber',
  'needs-attention': 'red',
}

const metricWrap: Record<Tone, string> = {
  blue: 'border-blue-100 bg-blue-50',
  indigo: 'border-indigo-100 bg-indigo-50',
  green: 'border-emerald-100 bg-emerald-50',
  amber: 'border-amber-100 bg-amber-50',
  red: 'border-rose-100 bg-rose-50',
  slate: 'border-slate-100 bg-slate-50',
}

function MetricCard({
  label,
  value,
  sub,
  tone,
  trend,
}: {
  label: string
  value: string
  sub?: string
  tone: Tone
  trend?: { text: string; direction: 'up' | 'down' | 'stable' }
}) {
  return (
    <div
      className={clsx('rounded-lg border px-3 py-2.5', metricWrap[tone])}
      data-testid={`rr-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-slate-800">{value}</span>
        {trend && (
          <span
            className={clsx(
              'text-xs font-medium',
              trend.direction === 'up'
                ? 'text-emerald-600'
                : trend.direction === 'down'
                  ? 'text-rose-600'
                  : 'text-slate-500',
            )}
          >
            {trend.text}
          </span>
        )}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function prettyStability(rating: string): string {
  return rating
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function RecruitingSection({
  title,
  orgStats,
  emptyDiagnostic,
}: {
  title: string
  orgStats: OrgStats | null
  emptyDiagnostic: string
}) {
  if (orgStats === null) {
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-700" aria-hidden />
            {title}
          </span>
        }
        data-testid="recruiting-section"
      >
        <EmptyState
          title="No historical membership data"
          message="ORGStatistics has no monthly counts for this scope, so recruiting and retention cannot be analyzed."
          diagnostic={emptyDiagnostic}
        />
      </Card>
    )
  }

  const { recruiting, retention, growth, volatility, sustainability } = orgStats.metrics
  const breakdown = orgStats.summary.memberBreakdown
  const yoy =
    orgStats.summary.yearAgoTotal !== null
      ? orgStats.summary.currentTotal - orgStats.summary.yearAgoTotal
      : null

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-700" aria-hidden />
          {title}
        </span>
      }
      actions={
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold">{orgStats.summary.currentTotal} members</span>
          {yoy !== null && (
            <span
              className={clsx(
                'text-xs font-semibold',
                yoy > 0 ? 'text-emerald-600' : yoy < 0 ? 'text-rose-600' : 'text-slate-500',
              )}
            >
              ({yoy > 0 ? '+' : ''}
              {yoy} YoY)
            </span>
          )}
          {sustainability !== null && (
            <Badge tone={sustainabilityTone[sustainability.rating]}>
              {sustainability.overallScore}
            </Badge>
          )}
        </div>
      }
      data-testid="recruiting-section"
    >
      <div className="space-y-4">
        {sustainability !== null && (
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-semibold text-slate-800">Sustainability Score</h4>
              <span className="text-2xl font-bold text-slate-900" data-testid="sustainability-score">
                {sustainability.overallScore}
              </span>
            </div>
            <ProgressBar
              value={sustainability.overallScore}
              accent={sustainabilityTone[sustainability.rating]}
            />
            <p className="mt-2 text-sm text-slate-600">{sustainability.summary}</p>
            <div className="mt-3 grid grid-cols-4 gap-1 text-xs">
              {(
                [
                  ['Recruiting', sustainability.components.recruiting],
                  ['Retention', sustainability.components.retention],
                  ['Growth', sustainability.components.growth],
                  ['Stability', sustainability.components.stability],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="text-center">
                  <div className="font-bold text-slate-700">{value}</div>
                  <div className="text-slate-400">{label}</div>
                </div>
              ))}
            </div>
            {/* Weights 25/35/25/15 and bands 80/65/50 are v1 engineering judgment,
                not a CAP publication (server/src/domain/orgStats.ts calculateSustainability). */}
            <p className="mt-2 text-xs text-slate-400">
              Weighted composite: 25% recruiting, 35% retention, 25% growth, 15% stability. Bands:
              80+ excellent, 65+ good, 50+ fair.
            </p>
            {sustainability.focusArea.score < 70 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Focus Area: {sustainability.focusArea.label}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      The {sustainability.focusArea.label.toLowerCase()} score (
                      {Math.round(sustainability.focusArea.score)}) is the lowest component.
                      Improving it has the biggest impact on the overall score.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard
            label="Recruiting Rate"
            value={recruiting !== null ? String(recruiting.monthlyAverage) : '--'}
            sub="avg new members/month"
            tone="blue"
            {...(recruiting !== null && recruiting.trendPercent !== 0
              ? {
                  trend: {
                    text: `${recruiting.trendPercent > 0 ? '+' : ''}${recruiting.trendPercent}%`,
                    direction:
                      recruiting.trend === 'increasing'
                        ? ('up' as const)
                        : recruiting.trend === 'decreasing'
                          ? ('down' as const)
                          : ('stable' as const),
                  },
                }
              : {})}
          />
          <MetricCard
            label="Retention Rate"
            value={retention !== null && retention.retentionRate !== null ? `${retention.retentionRate}%` : '--'}
            sub={
              retention === null || retention.healthIndicator === 'unknown'
                ? 'insufficient data'
                : retention.healthIndicator === 'healthy'
                  ? 'Healthy'
                  : retention.healthIndicator === 'moderate'
                    ? 'Moderate'
                    : 'Needs attention'
            }
            tone={
              retention === null || retention.healthIndicator === 'unknown'
                ? 'slate'
                : retention.healthIndicator === 'healthy'
                  ? 'green'
                  : retention.healthIndicator === 'moderate'
                    ? 'amber'
                    : 'red'
            }
          />
          <MetricCard
            label="Net Growth"
            value={
              growth !== null
                ? `${growth.netChangeInPeriod > 0 ? '+' : ''}${growth.netChangeInPeriod}`
                : '--'
            }
            sub="change over the period"
            tone={
              growth === null
                ? 'slate'
                : growth.status === 'growing'
                  ? 'green'
                  : growth.status === 'declining'
                    ? 'red'
                    : 'slate'
            }
          />
          <MetricCard
            label="Stability"
            value={volatility !== null ? prettyStability(volatility.stabilityRating) : '--'}
            sub={volatility !== null ? `${volatility.coefficientOfVariation}% variation` : 'needs 6+ months of data'}
            tone={
              volatility === null
                ? 'slate'
                : volatility.stabilityRating === 'very-stable'
                  ? 'green'
                  : volatility.stabilityRating === 'stable'
                    ? 'blue'
                    : volatility.stabilityRating === 'moderate'
                      ? 'amber'
                      : 'red'
            }
          />
        </div>

        {breakdown !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {/* Operational total = senior + cadet; FIFTY YEAR and LIFE count as
                seniors (server/src/domain/orgStats.ts MEMBER_TYPE_MAP). */}
            <h4 className="mb-3 text-sm font-semibold text-slate-700">Member Breakdown</h4>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="flex items-center justify-between rounded bg-emerald-50 px-2 py-1">
                <span className="text-slate-600">Senior Program</span>
                <span className="font-bold text-emerald-700">{breakdown.senior}</span>
              </div>
              <div className="flex items-center justify-between rounded bg-amber-50 px-2 py-1">
                <span className="text-slate-600">Cadets</span>
                <span className="font-bold text-amber-700">{breakdown.cadet}</span>
              </div>
              {breakdown.cadetSponsor > 0 && (
                <div className="flex items-center justify-between rounded bg-blue-50 px-2 py-1">
                  <span className="text-slate-600">Cadet Sponsors</span>
                  <span className="font-bold text-blue-700">{breakdown.cadetSponsor}</span>
                </div>
              )}
              {breakdown.patron > 0 && (
                <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                  <span className="text-slate-600">Patrons</span>
                  <span className="font-bold text-slate-700">{breakdown.patron}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{orgStats.summary.dataPointCount} months of data analyzed</span>
          {growth !== null && (
            <span className="flex items-center gap-1">
              {growth.status === 'growing' ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              ) : growth.status === 'declining' ? (
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" aria-hidden />
              ) : null}
              {growth.status}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
