import clsx from 'clsx'
import { LayoutList, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { UnitComparisonRow } from '@shared/contracts'
import { Badge, Card, DataTable, EmptyState, type Column, type Tone } from '../../components/ui'

/** ES bands 80/65/50 and sustainability bands 80/65/50 share the tone map. */
const bandTone: Record<string, Tone> = {
  excellent: 'green',
  good: 'blue',
  fair: 'amber',
  'needs-attention': 'red',
}

function GrowthCell({ status }: { status: string | null }) {
  if (status === 'growing') {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
        <TrendingUp className="h-4 w-4" aria-hidden /> growing
      </span>
    )
  }
  if (status === 'declining') {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-rose-600">
        <TrendingDown className="h-4 w-4" aria-hidden /> declining
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-sm text-slate-400">
      <Minus className="h-4 w-4" aria-hidden /> {status ?? '--'}
    </span>
  )
}

const columns: readonly Column<UnitComparisonRow>[] = [
  {
    key: 'unit',
    header: 'Unit',
    render: r => (
      <div data-testid={`comparison-row-${r.orgid}`}>
        <div className="text-sm font-medium text-slate-800">{r.name}</div>
        <div className="text-xs text-slate-500">
          {r.unitLabel}, {r.seniorCount} Sr / {r.cadetCount} Cdt
        </div>
      </div>
    ),
    sortValue: r => r.name,
  },
  {
    key: 'members',
    header: 'Members',
    render: r => <span className="font-semibold text-slate-800">{r.memberCount}</span>,
    sortValue: r => r.memberCount,
  },
  {
    key: 'es',
    header: 'ES Score',
    render: r => (
      <Badge tone={bandTone[r.readinessRating] ?? 'slate'} title={r.quickSummary}>
        {r.readinessScore}
      </Badge>
    ),
    sortValue: r => r.readinessScore,
  },
  {
    key: 'capability',
    header: 'ES Capability',
    render: r => <span className="text-xs text-slate-600">{r.quickSummary}</span>,
  },
  {
    key: 'sustainability',
    header: 'Sustainability',
    render: r => (
      <Badge tone={(r.sustainabilityRating !== null && bandTone[r.sustainabilityRating]) || 'slate'}>
        {r.sustainabilityScore ?? '--'}
      </Badge>
    ),
    sortValue: r => r.sustainabilityScore,
  },
  {
    key: 'retention',
    header: 'Retention',
    render: r =>
      r.retentionRate !== null ? (
        <span
          className={clsx(
            // Retention color bands 80/60 (v1 AppUnitOverview.html:171).
            r.retentionRate >= 80
              ? 'text-emerald-600'
              : r.retentionRate >= 60
                ? 'text-amber-600'
                : 'text-rose-600',
          )}
        >
          {r.retentionRate}%
        </span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
    sortValue: r => r.retentionRate,
  },
  {
    key: 'recruiting',
    header: 'Recruiting',
    render: r =>
      r.recruitingMonthlyAverage !== null ? (
        <span className="text-slate-700">{r.recruitingMonthlyAverage}/mo</span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
    sortValue: r => r.recruitingMonthlyAverage,
  },
  {
    key: 'growth',
    header: 'Growth',
    render: r => <GrowthCell status={r.growthStatus} />,
    sortValue: r => r.growthStatus,
  },
]

export function AggregateStatsHeader({
  comparison,
  totalMembers,
}: {
  comparison: readonly UnitComparisonRow[]
  totalMembers: number
}) {
  const withSustainability = comparison.filter(r => r.sustainabilityScore !== null)
  const avgSustainability =
    withSustainability.length > 0
      ? Math.round(
          withSustainability.reduce((sum, r) => sum + (r.sustainabilityScore ?? 0), 0) /
            withSustainability.length,
        )
      : null
  const withRetention = comparison.filter(r => r.retentionRate !== null)
  const avgRetention =
    withRetention.length > 0
      ? Math.round(
          (withRetention.reduce((sum, r) => sum + (r.retentionRate ?? 0), 0) / withRetention.length) * 10,
        ) / 10
      : null
  const growing = comparison.filter(r => r.growthStatus === 'growing').length
  const declining = comparison.filter(r => r.growthStatus === 'declining').length

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="aggregate-stats-header">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
        <div className="text-[10px] font-bold uppercase text-blue-700">Total Members</div>
        <div className="text-2xl font-bold text-blue-900">{totalMembers}</div>
      </div>
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
        <div className="text-[10px] font-bold uppercase text-indigo-700">Subordinate Units</div>
        <div className="text-2xl font-bold text-indigo-900">{comparison.length}</div>
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <div className="text-[10px] font-bold uppercase text-emerald-700">Avg Sustainability</div>
        <div className="text-2xl font-bold text-emerald-900">{avgSustainability ?? '--'}</div>
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
        <div className="text-[10px] font-bold uppercase text-amber-700">Avg Retention</div>
        <div className="text-2xl font-bold text-amber-900">
          {avgRetention !== null ? `${avgRetention}%` : '--'}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] font-bold uppercase text-slate-600">Growth Trend</div>
        <div className="mt-1 flex items-center gap-3">
          <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
            <TrendingUp className="h-4 w-4" aria-hidden /> {growing}
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-rose-600">
            <TrendingDown className="h-4 w-4" aria-hidden /> {declining}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ComparisonTable({ comparison }: { comparison: readonly UnitComparisonRow[] }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-blue-700" aria-hidden />
          Subordinate Units Performance
        </span>
      }
      actions={<span className="text-xs text-slate-500">{comparison.length} units</span>}
      data-testid="comparison-table"
    >
      <DataTable
        columns={columns}
        rows={comparison}
        rowKey={r => r.orgid}
        initialSort={{ key: 'sustainability', dir: 'desc' }}
        empty={
          <EmptyState
            title="No subordinate operational units"
            message="Every unit under this headquarters is itself an HQ type or is excluded from the picker, so there is nothing to compare."
            diagnostic="OverviewResponse.comparison is an empty array (HQ types and excluded units are dropped)"
          />
        }
      />
    </Card>
  )
}
