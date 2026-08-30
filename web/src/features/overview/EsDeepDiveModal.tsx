import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { EmptyState, Modal, Tabs, VerdictMark, type VerdictKind } from '../../components/ui'
import type { EsAnalysis } from './useOverviewData'
import { iconFor, mergeRoster, ratingLabel, type ExpiringQual } from './esShared'
import { FactLedger, FactRow, FiguresStrip, ScoreLead } from './overviewShared'

/*
 * The ES deep dive, swept to the Quiet Authority tokens: same six tabs and
 * content as before, restyled to hairlines and ink. This is the drill-down
 * scope, so member names appear here (D9: position at rest outside, names
 * one click deeper). Color remains a verdict; category is never a color.
 */

type Recommendation = EsAnalysis['risks']['recommendations'][number]

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'ES Roster' },
  { id: 'qualifications', label: 'Qualifications' },
  { id: 'expirations', label: 'Expirations' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'insights', label: 'Insights' },
] as const

function OverviewTab({ es }: { es: EsAnalysis }) {
  const teams = [
    es.teams.fieldOps,
    es.teams.aircrew,
    es.teams.suas,
    es.teams.missionBase,
    es.teams.command,
  ]
  return (
    <div className="space-y-6">
      <div>
        <ScoreLead score={es.readinessScore} band={ratingLabel[es.readinessRating]} />
        <p className="mt-2 max-w-[62ch] text-sm text-ink2">{es.quickSummary}</p>
      </div>

      <FiguresStrip
        size="sm"
        figures={[
          { label: 'Team capability', value: Math.round(es.readinessComponents.teamScore) },
          { label: 'Qual health', value: Math.round(es.readinessComponents.qualScore) },
          { label: 'Evaluator coverage', value: Math.round(es.readinessComponents.evaluatorScore) },
          { label: 'Risk mitigation', value: Math.round(es.readinessComponents.riskScore) },
          { label: 'Pipeline', value: Math.round(es.readinessComponents.pipelineScore) },
        ]}
      />

      <FactLedger className="max-w-none">
        {teams.map(team => {
          const Icon = iconFor(team.icon)
          const mainText =
            'groundTeamsFieldable' in team
              ? `${team.groundTeamsFieldable} ground, ${team.udfTeamsFieldable} UDF fieldable`
              : 'isStaffing' in team
                ? `${team.qualifiedCount} qualified, ${team.positionsCovered} of ${team.totalPositionTypes} position types`
                : `${team.teamsFieldable} fieldable`
          const ok = 'isStaffing' in team ? team.qualifiedCount > 0 : team.canField
          return (
            <FactRow
              key={team.name}
              label={
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-ink2" aria-hidden />
                  {team.name}
                </span>
              }
            >
              {mainText}
              {ok && <CheckCircle2 className="h-4 w-4 self-center text-ink2" aria-hidden />}
            </FactRow>
          )
        })}
      </FactLedger>

      <FiguresStrip
        size="sm"
        figures={[
          { label: 'Active operational quals', value: es.qualifications.byStatus.active },
          { label: 'In training', value: es.qualifications.byStatus.training },
          { label: 'Expiring in 90 days', value: es.qualifications.expiringWithin90Days.length },
          { label: 'Potential evaluators', value: es.evaluators.evaluatorCount },
        ]}
      />
      <p className="text-xs text-ink2">
        Potential evaluators are estimated from SET plus one year holding a qualification. Verify
        actual evaluator status in eServices.
      </p>
    </div>
  )
}

function RosterTab({ es }: { es: EsAnalysis }) {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('all')
  const roster = useMemo(() => mergeRoster(es), [es])
  const positions = useMemo(() => {
    const all = new Set<string>()
    for (const m of roster) for (const p of m.positions) all.add(p)
    return [...all].sort()
  }, [roster])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return roster.filter(m => {
      const matchesSearch = q === '' || m.name.toLowerCase().includes(q) || String(m.capid).includes(q)
      const matchesPosition = position === 'all' || m.positions.includes(position)
      return matchesSearch && matchesPosition
    })
  }, [roster, search, position])

  if (roster.length === 0) {
    return (
      <EmptyState
        title="No ES-qualified members"
        message="No member in this scope holds an active operational ES qualification."
        diagnostic="es.teams[*].qualifiedMembers all empty"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or CAPID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="es-roster-search"
          className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm focus:border-symbol focus:outline-none"
        />
        <select
          value={position}
          onChange={e => setPosition(e.target.value)}
          data-testid="es-roster-position-filter"
          className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm focus:border-symbol focus:outline-none"
        >
          <option value="all">All Positions</option>
          {positions.map(pos => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </div>
      <div className="tnum text-sm text-ink2">
        Showing {filtered.length} of {roster.length} ES-qualified members
        {es.evaluators.available.length > 0 && (
          <span> ({es.evaluators.available.length} potential evaluators)</span>
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-paper">
            <tr>
              <th className="kicker border-b border-hairline px-3 py-2 text-left text-ink2">
                Member
              </th>
              <th className="kicker border-b border-hairline px-3 py-2 text-left text-ink2">
                CAPID
              </th>
              <th className="kicker border-b border-hairline px-3 py-2 text-left text-ink2">
                ES Qualifications
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.capid} className="border-b border-hairline last:border-b-0" data-testid={`es-roster-row-${m.capid}`}>
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">
                    {m.rank} {m.name}
                  </span>
                  {m.isEvaluator && (
                    <span
                      className="ml-2 rounded bg-symbol-20 px-1.5 py-0.5 font-display text-[10px] font-bold text-symbol"
                      title="Has SET; potential evaluator (verify in eServices)"
                    >
                      SET
                    </span>
                  )}
                </td>
                <td className="tnum px-3 py-2 text-ink2">{m.capid}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {m.positions.map(pos => (
                      <span
                        key={pos}
                        className={clsx(
                          'rounded-full border px-2 py-0.5 text-xs font-medium',
                          m.canEvaluate.has(pos.toUpperCase())
                            ? 'border-symbol text-symbol'
                            : 'border-hairline text-ink',
                        )}
                        title={
                          m.canEvaluate.has(pos.toUpperCase())
                            ? `Potential evaluator for ${pos} (verify in eServices)`
                            : pos
                        }
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QualificationsTab({ es }: { es: EsAnalysis }) {
  const groups: { name: string; counts: [string, number][] }[] = [
    { name: 'Field Operations', counts: Object.entries(es.teams.fieldOps.positionCounts) },
    { name: 'Air Operations', counts: Object.entries(es.teams.aircrew.positionCounts) },
    { name: 'sUAS Operations', counts: Object.entries(es.teams.suas.positionCounts) },
    { name: 'Mission Base', counts: Object.entries(es.teams.missionBase.positionCounts) },
    { name: 'Command Staff', counts: Object.entries(es.teams.command.positionCounts) },
  ]
  return (
    <div className="space-y-5">
      <FactLedger>
        <FactRow label="Qualifications">
          {`${es.qualifications.byStatus.active} active · ${es.qualifications.byStatus.training} in training`}
          {es.qualifications.byStatus.expired > 0 ? (
            <VerdictMark kind="action" label={`${es.qualifications.byStatus.expired} expired`} />
          ) : (
            '0 expired'
          )}
        </FactRow>
      </FactLedger>
      {/* Counts are members per position; GES and SET are tracked separately
          (server/src/domain/esUnit.ts getDisplayedAchievementIds). */}
      <p className="text-xs text-ink2">
        Counts include operational qualifications only (team positions, not GES or SET). One member
        can hold multiple qualifications.
      </p>
      <div className="space-y-4">
        <p className="kicker text-ink">Members by position type</p>
        {groups.map(group => (
          <div key={group.name} className="border-t border-hairline pt-3">
            <h5 className="font-display text-sm font-semibold text-ink">{group.name}</h5>
            <div className="mt-2 grid grid-cols-4 gap-x-4 gap-y-3 md:grid-cols-6 lg:grid-cols-8">
              {group.counts.map(([code, count]) => (
                <div key={code} data-testid={`es-position-${code}`}>
                  <div className={clsx('tnum font-display text-lg font-semibold', count === 0 ? 'text-ink2' : 'text-ink')}>
                    {count}
                  </div>
                  <div className="kicker text-ink">{code}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {es.qualifications.missingGES.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <VerdictMark
            kind="watch"
            label={
              <span className="font-display text-sm font-semibold">
                {es.qualifications.missingGES.length} member
                {es.qualifications.missingGES.length === 1 ? '' : 's'} without GES
              </span>
            }
          />
          <p className="mt-1 max-w-[62ch] text-sm text-ink2">
            These members cannot participate in ES operations without General Emergency Services
            (GES).
          </p>
          <div className="mt-2 space-y-1">
            {es.qualifications.missingGES.slice(0, 10).map(m => (
              <div key={m.capid} className="text-sm text-ink">
                {m.rank} {m.name}
              </div>
            ))}
            {es.qualifications.missingGES.length > 10 && (
              <div className="text-sm text-ink2">
                +{es.qualifications.missingGES.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExpirationGroup({
  items,
  label,
  kind,
}: {
  items: ExpiringQual[]
  label: string
  kind: VerdictKind
}) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <VerdictMark kind={kind} label={<span className="font-display text-sm font-semibold">{label}</span>} />
        <span className="tnum text-sm font-semibold text-ink">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink2">None</p>
      ) : (
        <div className="mt-2">
          {items.map(e => (
            <div
              key={`${e.capid}-${e.achvId}`}
              className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 last:border-b-0"
            >
              <div>
                <div className="text-sm font-medium text-ink">
                  {e.rank} {e.name}
                </div>
                <div className="text-xs text-ink2">{e.qualification}</div>
              </div>
              <div className="text-right">
                <div className="tnum text-sm font-semibold text-ink">{e.daysUntil} days</div>
                <div className="tnum text-xs text-ink2">{e.expiration}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExpirationsTab({ es }: { es: EsAnalysis }) {
  const expiring = es.qualifications.expiringWithin90Days
  if (expiring.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="All clear"
        message="No qualifications expiring in the next 90 days."
        diagnostic="es.qualifications.expiringWithin90Days is empty"
      />
    )
  }
  // Urgency bands 30/60/90 days (server/src/domain/esUnit.ts calculateQualificationSummary).
  return (
    <div className="space-y-4">
      <p className="text-[15px] text-ink">
        <span className="tnum font-semibold">{expiring.length}</span> qualification
        {expiring.length === 1 ? '' : 's'} expiring within the next 90 days.
      </p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'critical')}
          label="Critical (0-30 days)"
          kind="action"
        />
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'warning')}
          label="Warning (31-60 days)"
          kind="watch"
        />
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'notice')}
          label="Notice (61-90 days)"
          kind="neutral"
        />
      </div>
    </div>
  )
}

function PipelineTab({ es }: { es: EsAnalysis }) {
  const byPosition = useMemo(() => {
    const out = new Map<string, EsAnalysis['pipeline']['activeTraining']>()
    for (const t of es.pipeline.activeTraining) {
      const list = out.get(t.position)
      if (list === undefined) out.set(t.position, [t])
      else list.push(t)
    }
    return [...out.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  }, [es.pipeline.activeTraining])

  const gapLines: [string, string[]][] = [
    ['Field Ops', [...es.teams.fieldOps.gaps]],
    ['Aircrew', [...es.teams.aircrew.gaps]],
    ['sUAS', [...es.teams.suas.gaps]],
    ['Mission Base', [...es.teams.missionBase.gaps]],
    ['Command', [...es.teams.command.gaps]],
  ]

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-ink">
        <span className="tnum font-semibold">{es.pipeline.activeTraining.length}</span> member
        {es.pipeline.activeTraining.length === 1 ? '' : 's'} actively working toward ES
        qualifications.
      </p>

      {byPosition.length > 0 ? (
        <div className="space-y-4">
          {byPosition.map(([position, members]) => (
            <div key={position} className="border-t border-hairline pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <h5 className="font-display text-sm font-semibold text-ink">{position}</h5>
                <span className="tnum text-sm text-ink2">{members.length} training</span>
              </div>
              <div className="mt-1">
                {members.map(m => (
                  <div
                    key={`${m.capid}-${m.achvId}`}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-1.5 text-sm last:border-b-0"
                  >
                    <span className="text-ink">
                      {m.rank} {m.name}
                      <span className="tnum ml-2 text-xs text-ink2">({m.capid})</span>
                    </span>
                    <span className="text-xs text-ink2">{m.qualification}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No active training"
          message="No members are currently training for ES qualifications."
          diagnostic="es.pipeline.activeTraining is empty"
        />
      )}

      <div className="border-t border-hairline pt-3">
        <p className="kicker text-ink">Training priorities</p>
        <div className="mt-2 space-y-1 text-sm text-ink">
          {gapLines
            .filter(([, gaps]) => gaps.length > 0)
            .map(([area, gaps]) => (
              <div key={area}>
                {area}: {gaps.join(', ')}
              </div>
            ))}
          {es.evaluators.gaps.length > 0 && (
            <div>Need evaluators for: {es.evaluators.gaps.slice(0, 3).join(', ')}</div>
          )}
          {gapLines.every(([, gaps]) => gaps.length === 0) && es.evaluators.gaps.length === 0 && (
            <span className="text-ink2">No position gaps identified.</span>
          )}
        </div>
      </div>
    </div>
  )
}

const priorityKind: Record<Recommendation['priority'], VerdictKind> = {
  critical: 'action',
  high: 'watch',
  medium: 'plan',
  low: 'neutral',
}

function InsightsTab({ es }: { es: EsAnalysis }) {
  const strengths: string[] = []
  if (es.teams.fieldOps.canFieldGround) strengths.push('Can field ground team')
  if (es.teams.fieldOps.canFieldUDF) strengths.push('Can field UDF team')
  if (es.teams.aircrew.canField) strengths.push('Can field aircrew')
  if (es.teams.suas.canField) strengths.push('sUAS capability')
  if (es.teams.command.hasIC) strengths.push('IC available')
  if (es.evaluators.coverage >= 50) strengths.push('Good potential evaluator coverage')
  if (es.qualifications.expiringWithin90Days.length === 0) strengths.push('No expiring qualifications')

  const improvements: string[] = []
  if (!es.teams.fieldOps.canField) improvements.push('Cannot field ground/UDF team')
  if (!es.teams.aircrew.canField) improvements.push('Cannot field aircrew')
  if (!es.teams.suas.canField) improvements.push('No sUAS capability')
  if (es.risks.singlePointsOfFailure.length > 0) improvements.push('Single points of failure')
  if (es.evaluators.coverage < 50) improvements.push('Limited potential evaluator coverage')
  if (es.qualifications.missingGES.length > 0) improvements.push('Members without GES')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="border-t border-hairline pt-3">
          <p className="kicker text-ink">Strengths</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {strengths.length === 0 && <li className="text-ink2">None identified</li>}
            {strengths.map(s => (
              <li key={s}>+ {s}</li>
            ))}
          </ul>
        </div>
        <div className="border-t border-hairline pt-3">
          <p className="kicker text-ink">Areas for improvement</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {improvements.length === 0 && <li className="text-ink2">None identified</li>}
            {improvements.map(s => (
              <li key={s}>- {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {es.risks.singlePointsOfFailure.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="kicker text-ink">Single points of failure</p>
          <div className="mt-2">
            {/* ACTION mark for every SPOF, matching the findings queue's
                category. Above single-unit self scope the server strips the
                member name (D9); the row degrades to the anonymous phrase. */}
            {es.risks.singlePointsOfFailure.map(spof => (
              <div
                key={`${spof.capid}-${spof.position}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline py-2 text-sm last:border-b-0"
              >
                <VerdictMark
                  kind="action"
                  label={
                    <span className="font-medium">
                      {spof.positionName} ({spof.position})
                    </span>
                  }
                />
                <span className="text-xs text-ink2">
                  {spof.member ?? 'one qualified member'}: {spof.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-hairline pt-3">
        <p className="kicker text-ink">Recommendations</p>
        {es.risks.recommendations.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={CheckCircle2}
              title="Looking good"
              message="No critical recommendations at this time."
              diagnostic="es.risks.recommendations is empty"
            />
          </div>
        ) : (
          <div className="mt-2">
            {es.risks.recommendations.map(rec => (
              <div key={rec.recommendation} className="border-b border-hairline py-2.5 last:border-b-0">
                <VerdictMark
                  kind={priorityKind[rec.priority]}
                  label={<span className="text-sm font-medium">{rec.recommendation}</span>}
                />
                <div className="mt-1 pl-3.5 text-xs text-ink2">
                  Impact: {rec.impact} · Area: {rec.area}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function EsDeepDiveModal({
  es,
  open,
  onClose,
}: {
  es: EsAnalysis
  open: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<string>('overview')
  return (
    <Modal open={open} onClose={onClose} title="Emergency Services Readiness" size="xl">
      <div className="space-y-4" data-testid="es-deep-dive-modal">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'overview' && <OverviewTab es={es} />}
        {tab === 'roster' && <RosterTab es={es} />}
        {tab === 'qualifications' && <QualificationsTab es={es} />}
        {tab === 'expirations' && <ExpirationsTab es={es} />}
        {tab === 'pipeline' && <PipelineTab es={es} />}
        {tab === 'insights' && <InsightsTab es={es} />}
      </div>
    </Modal>
  )
}
