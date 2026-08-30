import type { ParticipationResponse, QuietMemberEntry } from '@shared/participationContracts'
import { DataTable, Sparkline, VerdictMark, type Column } from '../../components/ui'
import {
  FactLedger,
  FactRow,
  FiguresStrip,
  fmtDate,
  fmtRate,
  NotRecordedBody,
  plural,
} from './overviewShared'

/*
 * Participation and engagement (D7, accelerated by the owner): counts-first,
 * guests as counts only, quiet-member names at single-unit scope alone (D9).
 * A unit that does not log attendance in eServices gets the neutral NOT
 * RECORDED state, never a red verdict.
 */

export interface ParticipationStatus {
  recorded: boolean
  /** "83%" 90-day average, or meetings count when no rate divides. */
  score: string | null
  /** The state word beside the score ("90-day average" / "90 days"). */
  word: string | null
  quietCount: number
}

/** Collapsed-header inputs for the Section status slot. */
export function participationStatus(p: ParticipationResponse | undefined): ParticipationStatus | null {
  if (p === undefined) return null
  if (!p.recorded) return { recorded: false, score: null, word: null, quietCount: 0 }
  const hasRate = p.last90.avgRate !== null
  return {
    recorded: true,
    score: hasRate
      ? fmtRate(p.last90.avgRate)
      : `${p.last90.meetings} ${plural(p.last90.meetings, 'meeting')}`,
    word: hasRate ? '90-day average' : '90 days',
    quietCount: p.quietMembers.count,
  }
}

const quietColumns: readonly Column<QuietMemberEntry>[] = [
  {
    key: 'name',
    header: 'Member',
    render: m => <span className="font-medium text-ink">{m.fullName}</span>,
    sortValue: m => m.fullName,
  },
  {
    key: 'lastPresent',
    header: 'Last present',
    render: m => (
      <span className="tnum text-ink2">
        {m.lastPresentOn !== null ? fmtDate(m.lastPresentOn) : 'Not in the last 12 months'}
      </span>
    ),
    sortValue: m => (m.lastPresentOn !== null ? new Date(m.lastPresentOn) : null),
  },
]

export function ParticipationSection({ participation }: { participation: ParticipationResponse }) {
  if (!participation.recorded) {
    return (
      <div data-testid="participation-section">
        <NotRecordedBody>
          No attendance recorded in eServices for this unit. Units that do not log attendance are
          never penalized here.
        </NotRecordedBody>
      </div>
    )
  }

  const { last90, monthly, quietMembers } = participation
  const ratedMonths = monthly.filter(m => m.avgAttendanceRate !== null)
  const rateSeries = ratedMonths.map(m => Math.round((m.avgAttendanceRate ?? 0) * 100))
  const firstRated = ratedMonths[0]
  const lastRated = ratedMonths[ratedMonths.length - 1]

  return (
    <div className="space-y-6" data-testid="participation-section">
      <FiguresStrip
        figures={[
          { label: 'Meetings, 90 days', value: last90.meetings },
          { label: 'Avg attendance', value: fmtRate(last90.avgRate) },
          { label: 'Guests, 90 days', value: last90.guests },
        ]}
      />

      {rateSeries.length > 1 && firstRated !== undefined && lastRated !== undefined && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <Sparkline
            data={rateSeries}
            width={220}
            height={48}
            label={`12-month attendance rate, ${fmtRate(firstRated.avgAttendanceRate)} in ${firstRated.month} to ${fmtRate(lastRated.avgAttendanceRate)} in ${lastRated.month}`}
          />
          <div>
            <div className="tnum text-sm text-ink">
              {fmtRate(firstRated.avgAttendanceRate)} to {fmtRate(lastRated.avgAttendanceRate)}
            </div>
            <div className="kicker mt-0.5 text-ink">12-month attendance rate</div>
          </div>
        </div>
      )}

      <FactLedger>
        <FactRow label="Quiet members">
          {quietMembers.count > 0 ? (
            <VerdictMark
              kind="watch"
              label={`${quietMembers.count} ${plural(quietMembers.count, 'member')} not marked present in 60 days`}
            />
          ) : (
            'Every active member has been marked present in the last 60 days'
          )}
        </FactRow>
        <FactRow label="Guests">
          {/* Guest identities are never ingested; counts only (D7). */}
          {`${last90.guests} in the last 90 days, counts only`}
        </FactRow>
      </FactLedger>

      {quietMembers.members !== undefined && quietMembers.members.length > 0 && (
        <div>
          <DataTable
            columns={quietColumns}
            rows={quietMembers.members}
            rowKey={m => m.capid}
            initialSort={{ key: 'lastPresent', dir: 'asc' }}
            mobileCard={m => (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{m.fullName}</span>
                <span className="tnum text-xs text-ink2">
                  {m.lastPresentOn !== null ? fmtDate(m.lastPresentOn) : 'Not in 12 months'}
                </span>
              </div>
            )}
          />
          {/* D9: named lists only at the member's own unit scope. */}
          <p className="mt-2 text-xs text-ink2">
            Names are shown at single-unit scope only; wider scopes carry counts alone.
          </p>
        </div>
      )}

      <p className="max-w-[62ch] text-xs text-ink2">
        Attendance reflects what the unit logs in the eServices attendance module; a meeting that
        was held but not logged does not appear here.
      </p>
    </div>
  )
}
