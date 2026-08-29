import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  SearchCode,
  TrendingUp,
} from 'lucide-react'
import { Badge, Card, ProgressBar } from '../../components/ui'
import type { EsAnalysis } from './useOverviewData'
import {
  iconFor,
  ratingLabel,
  ratingTone,
  teamStyle,
  urgencyStyle,
  type Aircrew,
  type Command,
  type FieldOps,
  type MissionBase,
  type Suas,
} from './esShared'
import { EsDeepDiveModal } from './EsDeepDiveModal'

function GapList({ gaps }: { gaps: readonly string[] }) {
  if (gaps.length === 0) return null
  return (
    <div className="mt-2 space-y-0.5 text-xs text-slate-600">
      {gaps.slice(0, 2).map(gap => (
        <div key={gap} className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
          <span>{gap}</span>
        </div>
      ))}
      {gaps.length > 2 && <span className="text-slate-400">+{gaps.length - 2} more</span>}
    </div>
  )
}

function TeamCardShell({
  color,
  icon,
  name,
  ok,
  children,
}: {
  color: FieldOps['color']
  icon: string
  name: string
  ok: boolean
  children: ReactNode
}) {
  const s = teamStyle[color]
  const Icon = iconFor(icon)
  return (
    <div
      className={clsx('rounded-lg border p-3', s.wrap)}
      data-testid={`es-team-${name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={clsx('h-4 w-4', s.icon)} aria-hidden />
          <h5 className={clsx('text-sm font-semibold', s.text)}>{name}</h5>
        </div>
        {ok ? (
          <CheckCircle2 className={clsx('h-5 w-5', s.icon)} aria-hidden />
        ) : (
          <AlertCircle className="h-5 w-5 text-slate-400" aria-hidden />
        )}
      </div>
      {children}
    </div>
  )
}

function FieldOpsCard({ team }: { team: FieldOps }) {
  const gtm = team.positionCounts.GTM1 + team.positionCounts.GTM2 + team.positionCounts.GTM3
  return (
    <TeamCardShell color={team.color} icon={team.icon} name={team.name} ok={team.canField}>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">Ground Teams:</span>
          <span className={clsx('text-sm font-bold', team.canFieldGround ? teamStyle[team.color].text : 'text-slate-400')}>
            {team.groundTeamsFieldable}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">UDF Teams:</span>
          <span className={clsx('text-sm font-bold', team.canFieldUDF ? teamStyle[team.color].text : 'text-slate-400')}>
            {team.udfTeamsFieldable}
          </span>
        </div>
      </div>
      <div className="mt-2 border-t border-slate-200/60 pt-2 text-xs text-slate-500">
        {team.positionCounts.GTL} GTL, {gtm} GTM, {team.positionCounts.UDF} UDF
      </div>
      <GapList gaps={team.gaps} />
    </TeamCardShell>
  )
}

function CrewCard({ team }: { team: Aircrew | Suas }) {
  return (
    <TeamCardShell color={team.color} icon={team.icon} name={team.name} ok={team.canField}>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-800">{team.teamsFieldable}</span>
        <span className="text-xs text-slate-500">{team.canField ? 'teams' : 'available'}</span>
      </div>
      <GapList gaps={team.gaps} />
    </TeamCardShell>
  )
}

function StaffingCard({ team }: { team: MissionBase | Command }) {
  return (
    <TeamCardShell color={team.color} icon={team.icon} name={team.name} ok={team.qualifiedCount > 0}>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-800">{team.qualifiedCount}</span>
        <span className="text-xs text-slate-500">qualified</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {team.positionsCovered}/{team.totalPositionTypes} position types
      </div>
      <GapList gaps={team.gaps} />
    </TeamCardShell>
  )
}

function ScoreCard({ es }: { es: EsAnalysis }) {
  const tone = ratingTone[es.readinessRating]
  const c = es.readinessComponents
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-slate-800">ES Readiness Score</h4>
        <span className="text-2xl font-bold text-slate-900" data-testid="es-readiness-score">
          {es.readinessScore}
        </span>
      </div>
      <ProgressBar value={es.readinessScore} accent={tone} />
      <div className="mt-2 flex items-center gap-2">
        <Badge tone={tone}>{ratingLabel[es.readinessRating]}</Badge>
        <span className="text-sm text-slate-600">{es.quickSummary}</span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1 text-xs">
        {(
          [
            ['Teams', c.teamScore],
            ['Quals', c.qualScore],
            ['SET', c.evaluatorScore],
            ['Risk', c.riskScore],
            ['Pipeline', c.pipelineScore],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="text-center">
            <div className="font-bold text-slate-700">{Math.round(value)}</div>
            <div className="text-slate-400">{label}</div>
          </div>
        ))}
      </div>
      {/* Weights and bands are v1 engineering judgment, not a CAP publication
          (server/src/domain/esUnit.ts calculateReadinessScore). */}
      <p className="mt-2 text-xs text-slate-400">
        Weighted composite: 35% teams, 25% qual health, 15% evaluators, 15% risk, 10% pipeline.
        Bands: 80+ excellent, 65+ good, 50+ fair.
      </p>
    </div>
  )
}

function QualHealthCard({ es }: { es: EsAnalysis }) {
  const q = es.qualifications
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-700">Qualification Health</h4>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-center">
          <div className="text-xl font-bold text-emerald-700">{q.byStatus.active}</div>
          <div className="text-xs text-slate-600">Active</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-center">
          <div className="text-xl font-bold text-amber-700">{q.byStatus.training}</div>
          <div className="text-xs text-slate-600">Training</div>
        </div>
        <div className="rounded-lg bg-rose-50 p-2 text-center">
          <div className="text-xl font-bold text-rose-700">{q.byStatus.expired}</div>
          <div className="text-xs text-slate-600">Expired</div>
        </div>
      </div>
      {q.missingGES.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2">
          <div className="flex items-center gap-1 text-xs text-rose-700">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            <span className="font-medium">
              {q.missingGES.length} member{q.missingGES.length === 1 ? '' : 's'} without GES
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AlertsCard({ es }: { es: EsAnalysis }) {
  const expiring = es.qualifications.expiringWithin90Days
  const spofs = es.risks.singlePointsOfFailure
  if (expiring.length === 0 && spofs.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="es-alerts">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
        <h4 className="text-sm font-semibold text-amber-800">Attention Required</h4>
      </div>
      {expiring.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-xs font-medium text-amber-700">
            Qualifications Expiring Within 90 Days
          </div>
          <div className="space-y-1">
            {expiring.slice(0, 4).map(e => (
              <div
                key={`${e.capid}-${e.achvId}`}
                className={clsx(
                  'flex items-center justify-between rounded px-2 py-1.5 text-xs',
                  urgencyStyle[e.urgency],
                )}
              >
                <span className="font-medium">
                  {e.rank} {e.name}
                </span>
                <span>
                  {e.qualification}, {e.daysUntil}d
                </span>
              </div>
            ))}
            {expiring.length > 4 && (
              <div className="mt-1 text-xs text-amber-600">+{expiring.length - 4} more</div>
            )}
          </div>
        </div>
      )}
      {spofs.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-amber-700">Single Points of Failure</div>
          <div className="space-y-1">
            {spofs.map(spof => (
              <div
                key={`${spof.capid}-${spof.position}`}
                className="flex items-center justify-between rounded bg-orange-100 px-2 py-1.5 text-xs text-orange-800"
              >
                <span className="font-medium">{spof.positionName}</span>
                <span>{spof.member}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvaluatorCard({ es }: { es: EsAnalysis }) {
  const ev = es.evaluators
  const accent = ev.coverage >= 80 ? 'green' : ev.coverage >= 50 ? 'amber' : 'red'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">Potential Evaluators</h4>
        <span
          className={clsx(
            'text-sm font-bold',
            ev.coverage >= 80 ? 'text-emerald-600' : ev.coverage >= 50 ? 'text-amber-600' : 'text-rose-600',
          )}
        >
          {ev.coverage}% coverage
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-800">{ev.evaluatorCount}</div>
          <div className="text-xs text-slate-500">Potential</div>
        </div>
        <ProgressBar value={ev.coverage} accent={accent} className="flex-1" />
      </div>
      {ev.gaps.length > 0 && (
        <div className="mt-3 text-xs text-slate-500">
          <span className="font-medium">Gaps:</span> {ev.gaps.slice(0, 3).join(', ')}
          {ev.gaps.length > 3 && ` +${ev.gaps.length - 3} more`}
        </div>
      )}
      {/* Estimate only: SET qual + 1yr holding; actual evaluator keying lives in
          eServices (v1 ServicesESUnitAnalysisService.html:570-646). */}
      <div className="mt-2 text-[10px] text-slate-400">Verify evaluator status in eServices</div>
    </div>
  )
}

export function EsReadinessSection({ es }: { es: EsAnalysis }) {
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const expiringCount = es.qualifications.expiringWithin90Days.length
  const topRecommendation = es.risks.recommendations[0]
  const trainingPositions = [...new Set(es.pipeline.activeTraining.map(t => t.position))]

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-700" aria-hidden />
          Emergency Services Readiness
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          {expiringCount > 0 && <Badge tone="amber">{expiringCount} expiring</Badge>}
          <Badge tone={ratingTone[es.readinessRating]}>{es.readinessScore}</Badge>
          <button
            type="button"
            onClick={() => setDeepDiveOpen(true)}
            data-testid="es-deep-dive-button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <SearchCode className="h-3.5 w-3.5" aria-hidden /> Deep Dive
          </button>
        </div>
      }
      data-testid="es-readiness-section"
    >
      <div className="space-y-4">
        <ScoreCard es={es} />

        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Team Capabilities</h4>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <FieldOpsCard team={es.teams.fieldOps} />
            <CrewCard team={es.teams.aircrew} />
            <CrewCard team={es.teams.suas} />
            <StaffingCard team={es.teams.missionBase} />
            <StaffingCard team={es.teams.command} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QualHealthCard es={es} />
          <EvaluatorCard es={es} />
        </div>

        <AlertsCard es={es} />

        {es.pipeline.activeTraining.length > 0 && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" aria-hidden />
              <h4 className="text-sm font-semibold text-indigo-800">Training Pipeline</h4>
            </div>
            <p className="text-sm text-indigo-700">
              {es.pipeline.activeTraining.length} member
              {es.pipeline.activeTraining.length === 1 ? '' : 's'} actively training for ES
              qualifications
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {trainingPositions.map(pos => (
                <span key={pos} className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                  {pos}
                </span>
              ))}
            </div>
          </div>
        )}

        {topRecommendation !== undefined && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-slate-600" aria-hidden />
              <h4 className="text-sm font-semibold text-slate-700">Top Recommendation</h4>
            </div>
            <p className="text-sm text-slate-600">{topRecommendation.recommendation}</p>
            {es.risks.recommendations.length > 1 && (
              <p className="mt-1 text-xs text-slate-400">
                +{es.risks.recommendations.length - 1} more in the Deep Dive
              </p>
            )}
          </div>
        )}
      </div>

      <EsDeepDiveModal es={es} open={deepDiveOpen} onClose={() => setDeepDiveOpen(false)} />
    </Card>
  )
}
