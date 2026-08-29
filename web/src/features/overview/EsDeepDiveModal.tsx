import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Lightbulb, ThumbsUp } from 'lucide-react'
import { Badge, EmptyState, Modal, Tabs } from '../../components/ui'
import type { EsAnalysis } from './useOverviewData'
import {
  iconFor,
  mergeRoster,
  ratingLabel,
  ratingTone,
  teamStyle,
  type ExpiringQual,
} from './esShared'

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
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Overall ES Readiness</h3>
            <p className="mt-1 text-sm text-slate-600">{es.quickSummary}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-center">
            <div className="text-3xl font-bold text-slate-900">{es.readinessScore}</div>
            <Badge tone={ratingTone[es.readinessRating]}>{ratingLabel[es.readinessRating]}</Badge>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ['Team Capability', es.readinessComponents.teamScore],
              ['Qual Health', es.readinessComponents.qualScore],
              ['Evaluator Coverage', es.readinessComponents.evaluatorScore],
              ['Risk Mitigation', es.readinessComponents.riskScore],
              ['Pipeline', es.readinessComponents.pipelineScore],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-2 text-center">
              <div className="text-xl font-bold text-slate-800">{Math.round(value)}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {teams.map(team => {
          const s = teamStyle[team.color]
          const Icon = iconFor(team.icon)
          const mainValue =
            'groundTeamsFieldable' in team
              ? team.groundTeamsFieldable + team.udfTeamsFieldable
              : 'isStaffing' in team
                ? team.qualifiedCount
                : team.teamsFieldable
          const subText =
            'groundTeamsFieldable' in team
              ? `${team.groundTeamsFieldable} ground, ${team.udfTeamsFieldable} UDF`
              : 'isStaffing' in team
                ? `${team.positionsCovered}/${team.totalPositionTypes} position types`
                : 'teams'
          const ok = 'isStaffing' in team ? team.qualifiedCount > 0 : team.canField
          return (
            <div key={team.name} className={clsx('rounded-lg border p-3', s.wrap)}>
              <div className="mb-1 flex items-center justify-between">
                <Icon className={clsx('h-5 w-5', s.icon)} aria-hidden />
                {ok && <CheckCircle2 className={clsx('h-5 w-5', s.icon)} aria-hidden />}
              </div>
              <div className={clsx('text-sm font-semibold', s.text)}>{team.name}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{mainValue}</div>
              <div className="text-xs text-slate-500">{subText}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-2xl font-bold text-emerald-700">{es.qualifications.byStatus.active}</div>
          <div className="text-sm text-emerald-600">Active Operational Quals</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-2xl font-bold text-amber-700">{es.qualifications.byStatus.training}</div>
          <div className="text-sm text-amber-600">In Training</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div className="text-2xl font-bold text-rose-700">
            {es.qualifications.expiringWithin90Days.length}
          </div>
          <div className="text-sm text-rose-600">Expiring in 90 Days</div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div className="text-2xl font-bold text-indigo-700">{es.evaluators.evaluatorCount}</div>
          <div className="text-sm text-indigo-600">Potential Evaluators</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
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
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={position}
          onChange={e => setPosition(e.target.value)}
          data-testid="es-roster-position-filter"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Positions</option>
          {positions.map(pos => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </div>
      <div className="text-sm text-slate-500">
        Showing {filtered.length} of {roster.length} ES-qualified members
        {es.evaluators.available.length > 0 && (
          <span> ({es.evaluators.available.length} potential evaluators)</span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-600">
                Member
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-600">
                CAPID
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-600">
                ES Qualifications
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.capid} className="border-b border-slate-100 last:border-b-0" data-testid={`es-roster-row-${m.capid}`}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">
                    {m.rank} {m.name}
                  </span>
                  {m.isEvaluator && (
                    <span
                      className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                      title="Has SET; potential evaluator (verify in eServices)"
                    >
                      SET
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{m.capid}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {m.positions.map(pos => (
                      <span
                        key={pos}
                        className={clsx(
                          'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700',
                          m.canEvaluate.has(pos.toUpperCase()) && 'ring-2 ring-emerald-500 ring-offset-1',
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
  const groups: { name: string; wrap: string; counts: [string, number][] }[] = [
    {
      name: 'Field Operations',
      wrap: 'border-emerald-200 bg-emerald-50',
      counts: Object.entries(es.teams.fieldOps.positionCounts),
    },
    {
      name: 'Air Operations',
      wrap: 'border-blue-200 bg-blue-50',
      counts: Object.entries(es.teams.aircrew.positionCounts),
    },
    {
      name: 'sUAS Operations',
      wrap: 'border-indigo-200 bg-indigo-50',
      counts: Object.entries(es.teams.suas.positionCounts),
    },
    {
      name: 'Mission Base',
      wrap: 'border-amber-200 bg-amber-50',
      counts: Object.entries(es.teams.missionBase.positionCounts),
    },
    {
      name: 'Command Staff',
      wrap: 'border-purple-200 bg-purple-50',
      counts: Object.entries(es.teams.command.positionCounts),
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-2xl font-bold text-emerald-800">{es.qualifications.byStatus.active}</div>
          <div className="text-sm text-emerald-600">Active</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-2xl font-bold text-amber-800">{es.qualifications.byStatus.training}</div>
          <div className="text-sm text-amber-600">Training</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div className="text-2xl font-bold text-rose-800">{es.qualifications.byStatus.expired}</div>
          <div className="text-sm text-rose-600">Expired</div>
        </div>
      </div>
      {/* Counts are members per position; GES and SET are tracked separately
          (server/src/domain/esUnit.ts getDisplayedAchievementIds). */}
      <p className="text-xs text-slate-500">
        Counts include operational qualifications only (team positions, not GES or SET). One member
        can hold multiple qualifications.
      </p>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-700">Members by Position Type</h4>
        {groups.map(group => (
          <div key={group.name} className={clsx('rounded-lg border p-4', group.wrap)}>
            <h5 className="mb-3 font-semibold text-slate-700">{group.name}</h5>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-6 lg:grid-cols-8">
              {group.counts.map(([code, count]) => (
                <div
                  key={code}
                  className={clsx(
                    'rounded border border-slate-200 bg-white p-2 text-center',
                    count === 0 && 'opacity-60',
                  )}
                  data-testid={`es-position-${code}`}
                >
                  <div className={clsx('text-lg font-bold', count === 0 ? 'text-rose-600' : 'text-slate-800')}>
                    {count}
                  </div>
                  <div className="text-xs text-slate-500">{code}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {es.qualifications.missingGES.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
            <h5 className="font-semibold text-rose-700">Members Without GES</h5>
          </div>
          <p className="mb-2 text-sm text-rose-600">
            These members cannot participate in ES operations without General Emergency Services
            (GES).
          </p>
          <div className="space-y-1">
            {es.qualifications.missingGES.slice(0, 10).map(m => (
              <div key={m.capid} className="text-sm text-rose-800">
                {m.rank} {m.name}
              </div>
            ))}
            {es.qualifications.missingGES.length > 10 && (
              <div className="text-sm text-rose-600">
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
  wrap,
  text,
}: {
  items: ExpiringQual[]
  label: string
  wrap: string
  text: string
}) {
  return (
    <div className={clsx('rounded-lg border p-4', wrap)}>
      <div className="mb-3 flex items-center justify-between">
        <h5 className={clsx('font-semibold', text)}>{label}</h5>
        <span className={clsx('text-sm font-bold', text)}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">None</p>
      ) : (
        <div className="space-y-2">
          {items.map(e => (
            <div
              key={`${e.capid}-${e.achvId}`}
              className="flex items-center justify-between rounded border border-slate-200 bg-white p-2"
            >
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {e.rank} {e.name}
                </div>
                <div className="text-xs text-slate-500">{e.qualification}</div>
              </div>
              <div className="text-right">
                <div className={clsx('text-sm font-bold', text)}>{e.daysUntil} days</div>
                <div className="text-xs text-slate-500">{e.expiration}</div>
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
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
        <CalendarClock className="h-8 w-8 text-slate-400" aria-hidden />
        <div>
          <div className="text-lg font-bold text-slate-800">
            {expiring.length} qualification{expiring.length === 1 ? '' : 's'} expiring
          </div>
          <div className="text-sm text-slate-600">Within the next 90 days</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'critical')}
          label="Critical (0-30 days)"
          wrap="border-rose-200 bg-rose-50"
          text="text-rose-700"
        />
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'warning')}
          label="Warning (31-60 days)"
          wrap="border-amber-200 bg-amber-50"
          text="text-amber-700"
        />
        <ExpirationGroup
          items={expiring.filter(e => e.urgency === 'notice')}
          label="Notice (61-90 days)"
          wrap="border-yellow-200 bg-yellow-50"
          text="text-yellow-700"
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
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [es.pipeline.activeTraining])

  const gapLines: [string, string[]][] = [
    ['Field Ops', [...es.teams.fieldOps.gaps]],
    ['Aircrew', [...es.teams.aircrew.gaps]],
    ['sUAS', [...es.teams.suas.gaps]],
    ['Mission Base', [...es.teams.missionBase.gaps]],
    ['Command', [...es.teams.command.gaps]],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <ThumbsUp className="h-8 w-8 text-indigo-600" aria-hidden />
        <div>
          <div className="text-lg font-bold text-indigo-800">
            {es.pipeline.activeTraining.length} member
            {es.pipeline.activeTraining.length === 1 ? '' : 's'} in training
          </div>
          <div className="text-sm text-indigo-600">Actively working toward ES qualifications</div>
        </div>
      </div>

      {byPosition.length > 0 ? (
        <div className="space-y-3">
          {byPosition.map(([position, members]) => (
            <div key={position} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="font-semibold text-slate-700">{position}</h5>
                <Badge tone="indigo">{members.length} training</Badge>
              </div>
              <div className="space-y-1">
                {members.map(m => (
                  <div
                    key={`${m.capid}-${m.achvId}`}
                    className="flex items-center justify-between rounded bg-slate-50 p-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {m.rank} {m.name}
                      <span className="ml-2 text-xs font-normal text-slate-500">({m.capid})</span>
                    </span>
                    <span className="text-xs text-indigo-600">{m.qualification}</span>
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

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-slate-600" aria-hidden />
          <h5 className="font-semibold text-slate-700">Training Priorities</h5>
        </div>
        <div className="space-y-1 text-sm text-slate-600">
          {gapLines
            .filter(([, gaps]) => gaps.length > 0)
            .map(([area, gaps]) => (
              <div key={area} className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>
                  {area}: {gaps.join(', ')}
                </span>
              </div>
            ))}
          {es.evaluators.gaps.length > 0 && (
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>Need evaluators for: {es.evaluators.gaps.slice(0, 3).join(', ')}</span>
            </div>
          )}
          {gapLines.every(([, gaps]) => gaps.length === 0) && es.evaluators.gaps.length === 0 && (
            <span>No position gaps identified.</span>
          )}
        </div>
      </div>
    </div>
  )
}

const priorityStyle: Record<Recommendation['priority'], { wrap: string; text: string; badge: string }> = {
  critical: { wrap: 'border-rose-200 bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800' },
  high: { wrap: 'border-amber-200 bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  medium: { wrap: 'border-blue-200 bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  low: { wrap: 'border-slate-200 bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-800' },
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <ThumbsUp className="mb-2 h-6 w-6 text-emerald-600" aria-hidden />
          <h5 className="mb-2 font-semibold text-emerald-700">Strengths</h5>
          <ul className="space-y-1 text-sm text-emerald-600">
            {strengths.length === 0 && <li>None identified</li>}
            {strengths.map(s => (
              <li key={s}>+ {s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mb-2 h-6 w-6 text-amber-600" aria-hidden />
          <h5 className="mb-2 font-semibold text-amber-700">Areas for Improvement</h5>
          <ul className="space-y-1 text-sm text-amber-600">
            {improvements.length === 0 && <li>None identified</li>}
            {improvements.map(s => (
              <li key={s}>- {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {es.risks.singlePointsOfFailure.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <h5 className="mb-2 font-semibold text-orange-700">Single Points of Failure</h5>
          <div className="space-y-2">
            {es.risks.singlePointsOfFailure.map(spof => (
              <div
                key={`${spof.capid}-${spof.position}`}
                className="rounded border border-orange-200 bg-white p-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {spof.positionName} ({spof.position})
                  </span>
                  <Badge tone={spof.severity === 'high' ? 'red' : 'amber'}>{spof.severity}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {spof.member}: {spof.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Recommendations</h4>
        {es.risks.recommendations.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Looking good"
            message="No critical recommendations at this time."
            diagnostic="es.risks.recommendations is empty"
          />
        ) : (
          <div className="space-y-2">
            {es.risks.recommendations.map(rec => {
              const s = priorityStyle[rec.priority]
              return (
                <div key={rec.recommendation} className={clsx('rounded-lg border p-3', s.wrap)}>
                  <div className="flex items-start gap-3">
                    <span className={clsx('rounded px-2 py-0.5 text-xs font-bold uppercase', s.badge)}>
                      {rec.priority}
                    </span>
                    <div className="flex-1">
                      <div className={clsx('text-sm font-medium', s.text)}>{rec.recommendation}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-medium">Impact:</span> {rec.impact}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">Area: {rec.area}</div>
                    </div>
                  </div>
                </div>
              )
            })}
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
