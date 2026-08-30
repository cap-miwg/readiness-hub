import type { StrengthPoint } from '@shared/contracts'
import { EmptyState, Sparkline, VerdictMark } from '../../components/ui'
import type { OrgStats } from './useOverviewData'
import {
  bandWord,
  FactLedger,
  FactRow,
  FiguresStrip,
  ScoreLead,
  type BandRating,
} from './overviewShared'

/*
 * Recruiting and Retention as a quiet ledger (unit-overview.html mockup,
 * "Recruiting and Retention" section): score lead with the band word and the
 * methodology behind a disclosure, a small component-figures strip, hairline
 * fact rows, the 12-month strength sparkline, and the member breakdown as
 * plain tabular text. No meters, no tinted tiles; the number is the display.
 */

export interface RecruitingAlert {
  kind: 'watch'
  label: string
}

/** Collapsed-header inputs: one score, one band word, the alert list. */
export function recruitingStatus(orgStats: OrgStats | null): {
  score: number | null
  band: string | null
  alerts: RecruitingAlert[]
} {
  const sustainability = orgStats?.metrics.sustainability ?? null
  const growth = orgStats?.metrics.growth ?? null
  const alerts: RecruitingAlert[] = []
  if (sustainability !== null && sustainability.rating === 'needs-attention') {
    alerts.push({ kind: 'watch', label: 'Sustainability needs attention' })
  }
  if (growth !== null && growth.status === 'declining') {
    alerts.push({ kind: 'watch', label: 'Membership declining' })
  }
  return {
    score: sustainability?.overallScore ?? null,
    band: sustainability !== null ? bandWord[sustainability.rating as BandRating] : null,
    alerts,
  }
}

function trendText(trendPercent: number): string {
  const sign = trendPercent > 0 ? '+' : ''
  return `${sign}${trendPercent}% vs the prior period`
}

export function RecruitingSection({
  orgStats,
  strengthSeries,
  strengthDelta12mo,
  emptyDiagnostic,
}: {
  orgStats: OrgStats | null
  strengthSeries: StrengthPoint[] | undefined
  strengthDelta12mo: number | null | undefined
  emptyDiagnostic: string
}) {
  if (orgStats === null) {
    return (
      <div data-testid="recruiting-section">
        <EmptyState
          title="No historical membership data"
          message="ORGStatistics has no monthly counts for this scope, so recruiting and retention cannot be analyzed."
          diagnostic={emptyDiagnostic}
        />
      </div>
    )
  }

  const { recruiting, retention, growth, volatility, sustainability } = orgStats.metrics
  const breakdown = orgStats.summary.memberBreakdown
  const series = strengthSeries ?? []
  const sparkData = series.map(p => p.total)
  const first = series[0]
  const last = series[series.length - 1]

  return (
    <div className="space-y-6" data-testid="recruiting-section">
      {sustainability !== null && (
        <>
          <ScoreLead
            score={sustainability.overallScore}
            band={bandWord[sustainability.rating as BandRating]}
            method="Weighted composite: recruiting 25%, retention 35%, growth 25%, stability 15%. Bands: 80 and above excellent, 65 good, 50 fair. Weights and bands are engineering judgment carried over from v1, not a CAP publication."
            testid="sustainability-score"
          />
          <FiguresStrip
            size="sm"
            figures={[
              {
                label: 'Recruiting',
                value: Math.round(sustainability.components.recruiting),
                testid: 'rr-metric-recruiting-rate',
              },
              {
                label: 'Retention',
                value: Math.round(sustainability.components.retention),
                testid: 'rr-metric-retention-rate',
              },
              {
                label: 'Growth',
                value: Math.round(sustainability.components.growth),
                testid: 'rr-metric-net-growth',
              },
              {
                label: 'Stability',
                value: Math.round(sustainability.components.stability),
                testid: 'rr-metric-stability',
              },
            ]}
          />
        </>
      )}

      <FactLedger>
        <FactRow label="Recruiting rate">
          {recruiting !== null
            ? `${recruiting.monthlyAverage} new ${recruiting.monthlyAverage === 1 ? 'member' : 'members'} per month, 12-month average${recruiting.trendPercent !== 0 ? `, ${trendText(recruiting.trendPercent)}` : ''}`
            : 'Insufficient data'}
        </FactRow>
        <FactRow label="Retention rate">
          {retention !== null && retention.retentionRate !== null
            ? `${retention.retentionRate}% of memberships renewed`
            : 'Insufficient data'}
        </FactRow>
        <FactRow label="Net growth">
          {growth !== null ? (
            <>
              {`${growth.netChangeInPeriod > 0 ? '+' : ''}${growth.netChangeInPeriod} members over the period`}
              {growth.status === 'declining' && <VerdictMark kind="watch" label="Declining" />}
            </>
          ) : (
            'Insufficient data'
          )}
        </FactRow>
        <FactRow label="Roster stability">
          {volatility !== null
            ? `${volatility.coefficientOfVariation}% month-to-month variation`
            : 'Needs 6 or more months of data'}
        </FactRow>
        {breakdown !== null && (
          <FactRow label="Membership">
            {/* Operational total = senior + cadet; FIFTY YEAR and LIFE count as
                seniors (server/src/domain/orgStats.ts MEMBER_TYPE_MAP). */}
            {[
              `${breakdown.senior} seniors`,
              `${breakdown.cadet} cadets`,
              breakdown.cadetSponsor > 0 ? `${breakdown.cadetSponsor} cadet sponsors` : null,
              breakdown.patron > 0 ? `${breakdown.patron} patrons` : null,
            ]
              .filter(v => v !== null)
              .join(' · ')}
          </FactRow>
        )}
      </FactLedger>

      {sparkData.length > 1 && first !== undefined && last !== undefined && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <Sparkline
            data={sparkData}
            width={220}
            height={48}
            label={`12-month total strength, ${first.total} in ${first.month} to ${last.total} in ${last.month}`}
          />
          <div>
            <div className="tnum text-sm text-ink">
              {first.total} to {last.total}
              {typeof strengthDelta12mo === 'number' &&
                ` (${strengthDelta12mo > 0 ? '+' : ''}${strengthDelta12mo})`}
            </div>
            <div className="kicker mt-0.5 text-ink">12-month strength</div>
          </div>
        </div>
      )}

      {sustainability !== null && sustainability.focusArea.score < 70 && (
        <p className="max-w-[62ch] text-[13px] text-ink2">
          Focus area: {sustainability.focusArea.label}. At{' '}
          {Math.round(sustainability.focusArea.score)} it is the lowest component; improving it
          moves the overall score most.
        </p>
      )}

      <p className="text-xs text-ink2">
        Computed from {orgStats.summary.dataPointCount}{' '}
        {orgStats.summary.dataPointCount === 1 ? 'month' : 'months'} of extract history.
      </p>
    </div>
  )
}
