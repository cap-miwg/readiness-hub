import { useNavigate } from 'react-router-dom'
import type { UnitComparisonRow } from '@shared/contracts'
import { DataTable, EmptyState, type Column } from '../../components/ui'
import { orgScopeSearch } from '../../lib/urlState'
import { bandWord, FiguresStrip, type BandRating } from './overviewShared'

/*
 * Mode C, the command view (V2-DESIGN-PLAN.md section 6): subordinate units
 * as a typeset ledger. Band words render as text, never colored badges;
 * scores are quiet tabular numerals; a row is a drill-down link into that
 * unit's own overview. The full command deck (deltas, sparklines per row)
 * is the 2.1 snapshot work.
 */

function band(rating: string | null): string {
  if (rating === null) return '--'
  return bandWord[rating as BandRating] ?? rating
}

const columns: readonly Column<UnitComparisonRow>[] = [
  {
    key: 'unit',
    header: 'Unit',
    render: r => (
      <div data-testid={`comparison-row-${r.orgid}`}>
        <div className="text-sm font-medium text-ink">{r.name}</div>
        <div className="tnum text-xs text-ink2">
          {r.unitLabel} · {r.seniorCount} Sr / {r.cadetCount} Cdt
        </div>
      </div>
    ),
    sortValue: r => r.name,
  },
  {
    key: 'members',
    header: 'Members',
    numeric: true,
    render: r => <span className="font-semibold text-ink">{r.memberCount}</span>,
    sortValue: r => r.memberCount,
  },
  {
    key: 'es',
    header: 'ES Readiness',
    numeric: true,
    render: r => (
      <span className="whitespace-nowrap text-ink" title={r.quickSummary}>
        {r.readinessScore} <span className="text-ink2">{band(r.readinessRating)}</span>
      </span>
    ),
    sortValue: r => r.readinessScore,
  },
  {
    key: 'capability',
    header: 'ES Capability',
    render: r => <span className="text-xs text-ink2">{r.quickSummary}</span>,
  },
  {
    key: 'sustainability',
    header: 'Sustainability',
    numeric: true,
    render: r => (
      <span className="whitespace-nowrap text-ink">
        {r.sustainabilityScore ?? '--'}{' '}
        <span className="text-ink2">{band(r.sustainabilityRating)}</span>
      </span>
    ),
    sortValue: r => r.sustainabilityScore,
  },
  {
    key: 'retention',
    header: 'Retention',
    numeric: true,
    render: r =>
      r.retentionRate !== null ? (
        <span className="text-ink">{r.retentionRate}%</span>
      ) : (
        <span className="text-ink2">--</span>
      ),
    sortValue: r => r.retentionRate,
  },
  {
    key: 'recruiting',
    header: 'Recruiting',
    numeric: true,
    render: r =>
      r.recruitingMonthlyAverage !== null ? (
        <span className="text-ink">{r.recruitingMonthlyAverage}/mo</span>
      ) : (
        <span className="text-ink2">--</span>
      ),
    sortValue: r => r.recruitingMonthlyAverage,
  },
  {
    key: 'growth',
    header: 'Growth',
    render: r => (
      <span className={r.growthStatus === 'declining' ? 'text-ink' : 'text-ink2'}>
        {r.growthStatus ?? '--'}
      </span>
    ),
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
    <div data-testid="aggregate-stats-header">
      <FiguresStrip
        size="sm"
        figures={[
          { label: 'Members', value: totalMembers.toLocaleString() },
          { label: 'Subordinate units', value: comparison.length },
          { label: 'Avg sustainability', value: avgSustainability ?? '--' },
          {
            label: 'Avg retention',
            value: avgRetention !== null ? `${avgRetention}%` : '--',
          },
          {
            label: 'Growth trend',
            value: `${growing} / ${declining}`,
            delta: 'growing / declining',
          },
        ]}
      />
    </div>
  )
}

export function ComparisonTable({ comparison }: { comparison: readonly UnitComparisonRow[] }) {
  // Row drill-down lands on that unit's own overview scope (descendants off).
  const navigate = useNavigate()

  return (
    <section data-testid="comparison-table">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <p className="kicker text-ink">Subordinate units</p>
        <span className="tnum text-xs text-ink2">{comparison.length} units · select a row to drill down</span>
      </div>
      <DataTable
        columns={columns}
        rows={comparison}
        rowKey={r => r.orgid}
        initialSort={{ key: 'sustainability', dir: 'desc' }}
        onRowClick={r =>
          navigate({
            pathname: '/unit',
            search: orgScopeSearch({ orgid: r.orgid, descendants: false }),
          })
        }
        mobileCard={r => (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{r.name}</span>
              <span className="tnum text-xs text-ink2">{r.unitLabel}</span>
            </div>
            <div className="tnum mt-1 text-xs text-ink2">
              {r.memberCount} members · ES {r.readinessScore} {band(r.readinessRating)} ·
              sustainability {r.sustainabilityScore ?? '--'}
            </div>
          </div>
        )}
        empty={
          <EmptyState
            title="No subordinate operational units"
            message="Every unit under this headquarters is itself an HQ type or is excluded from the picker, so there is nothing to compare."
            diagnostic="OverviewResponse.comparison is an empty array (HQ types and excluded units are dropped)"
          />
        }
      />
    </section>
  )
}
