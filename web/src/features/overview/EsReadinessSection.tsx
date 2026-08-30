import { useState, type ReactNode } from 'react'
import { VerdictMark, type VerdictKind } from '../../components/ui'
import type { EsAnalysis } from './useOverviewData'
import { ratingLabel } from './esShared'
import { FactLedger, FactRow, FiguresStrip, ScoreLead, plural } from './overviewShared'
import { EsDeepDiveModal } from './EsDeepDiveModal'

/*
 * Emergency Services in the Quiet Authority grammar (unit-overview.html
 * mockup, "Emergency Services" section; Mission Brief's concrete content
 * spec grafted per the plan): the capability sentence always leads and
 * always outranks the score; teams are hairline ledger rows with named
 * deficits as WATCH marks; SPOF renders as ACTION (the findings queue's
 * category) and names the position at rest (D9), the member name lives in
 * the deep dive.
 */

export interface EsAlert {
  kind: VerdictKind
  label: string
}

/** Collapsed-header inputs: one score, one band word, the alert list. */
export function esStatus(es: EsAnalysis): { score: number; band: string; alerts: EsAlert[] } {
  const alerts: EsAlert[] = []
  if (es.qualifications.byStatus.expired > 0) {
    alerts.push({
      kind: 'action',
      label: `${es.qualifications.byStatus.expired} expired ${plural(es.qualifications.byStatus.expired, 'qualification')}`,
    })
  }
  // ACTION, matching the findings queue's SPOF category (api/findings.ts).
  for (const spof of es.risks.singlePointsOfFailure) {
    alerts.push({ kind: 'action', label: `${spof.positionName} single point of failure` })
  }
  return { score: es.readinessScore, band: ratingLabel[es.readinessRating], alerts }
}

function GapMarks({ gaps }: { gaps: readonly string[] }) {
  if (gaps.length === 0) return null
  return (
    <>
      {gaps.slice(0, 2).map(gap => (
        <VerdictMark key={gap} kind="watch" label={gap} />
      ))}
      {gaps.length > 2 && <span className="text-ink2">+{gaps.length - 2} more</span>}
    </>
  )
}

function TeamRow({
  name,
  gaps,
  children,
}: {
  name: string
  gaps: readonly string[]
  children: ReactNode
}) {
  return (
    <FactRow label={name} testid={`es-team-${name.toLowerCase().replace(/\s+/g, '-')}`}>
      {children}
      <GapMarks gaps={gaps} />
    </FactRow>
  )
}

export function EsReadinessSection({ es }: { es: EsAnalysis }) {
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const q = es.qualifications
  const expiring = q.expiringWithin90Days
  const spofs = es.risks.singlePointsOfFailure
  const c = es.readinessComponents
  const gtm =
    es.teams.fieldOps.positionCounts.GTM1 +
    es.teams.fieldOps.positionCounts.GTM2 +
    es.teams.fieldOps.positionCounts.GTM3

  const pipelineByPosition = new Map<string, number>()
  for (const t of es.pipeline.activeTraining) {
    pipelineByPosition.set(t.position, (pipelineByPosition.get(t.position) ?? 0) + 1)
  }
  const pipelineRanked = [...pipelineByPosition.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )

  return (
    <div className="space-y-6" data-testid="es-readiness-section">
      {/* The capability sentence always leads. The score never outranks it. */}
      <p className="max-w-[56ch] text-[19px] font-medium leading-normal text-ink">
        {es.quickSummary}
      </p>

      <ScoreLead
        score={es.readinessScore}
        band={ratingLabel[es.readinessRating]}
        method="Weighted composite: teams 35%, qualification health 25%, evaluators 15%, risk 15%, pipeline 10%. Bands: 80 and above excellent, 65 good, 50 fair. Weights and bands are engineering judgment carried over from v1, not a CAP publication."
        testid="es-readiness-score"
      />

      <FiguresStrip
        size="sm"
        figures={[
          { label: 'Teams', value: Math.round(c.teamScore) },
          { label: 'Quals', value: Math.round(c.qualScore) },
          { label: 'Evaluators', value: Math.round(c.evaluatorScore) },
          { label: 'Risk', value: Math.round(c.riskScore) },
          { label: 'Pipeline', value: Math.round(c.pipelineScore) },
        ]}
      />

      <div>
        <p className="kicker text-ink">Team capability</p>
        <FactLedger className="mt-1">
          <TeamRow name={es.teams.fieldOps.name} gaps={es.teams.fieldOps.gaps}>
            {`${es.teams.fieldOps.groundTeamsFieldable} ground, ${es.teams.fieldOps.udfTeamsFieldable} UDF ${plural(es.teams.fieldOps.udfTeamsFieldable, 'team')} fieldable (${es.teams.fieldOps.positionCounts.GTL} GTL, ${gtm} GTM, ${es.teams.fieldOps.positionCounts.UDF} UDF)`}
          </TeamRow>
          <TeamRow name={es.teams.aircrew.name} gaps={es.teams.aircrew.gaps}>
            {`${es.teams.aircrew.teamsFieldable} ${plural(es.teams.aircrew.teamsFieldable, 'aircrew')} fieldable`}
          </TeamRow>
          <TeamRow name={es.teams.suas.name} gaps={es.teams.suas.gaps}>
            {`${es.teams.suas.teamsFieldable} ${plural(es.teams.suas.teamsFieldable, 'team')} fieldable`}
          </TeamRow>
          <TeamRow name={es.teams.missionBase.name} gaps={es.teams.missionBase.gaps}>
            {`${es.teams.missionBase.qualifiedCount} qualified, ${es.teams.missionBase.positionsCovered} of ${es.teams.missionBase.totalPositionTypes} position types covered`}
          </TeamRow>
          <TeamRow name={es.teams.command.name} gaps={es.teams.command.gaps}>
            {`${es.teams.command.qualifiedCount} qualified, ${es.teams.command.positionsCovered} of ${es.teams.command.totalPositionTypes} position types covered`}
          </TeamRow>
        </FactLedger>
      </div>

      <FactLedger>
        <FactRow label="Qualifications">
          {`${q.byStatus.active} active · ${q.byStatus.training} in training`}
          {q.byStatus.expired > 0 ? (
            <VerdictMark kind="action" label={`${q.byStatus.expired} expired`} />
          ) : (
            '0 expired'
          )}
        </FactRow>
        <FactRow label="Expiring within 90 days">
          {expiring.length > 0 ? (
            <VerdictMark
              kind="watch"
              label={`${expiring.length} ${plural(expiring.length, 'qualification')}`}
            />
          ) : (
            'None'
          )}
        </FactRow>
        <FactRow label="General Emergency Services">
          {q.missingGES.length > 0
            ? `${q.missingGES.length} ${plural(q.missingGES.length, 'member')} not yet GES qualified`
            : 'All members GES qualified'}
        </FactRow>
        <FactRow label="Evaluator coverage">
          {`${es.evaluators.evaluatorCount} potential ${plural(es.evaluators.evaluatorCount, 'evaluator')}, ${es.evaluators.coverage}% of qualifications covered`}
        </FactRow>
        {spofs.length > 0 && (
          <FactRow label={plural(spofs.length, 'Single point of failure', 'Single points of failure')} testid="es-alerts">
            {/* Position at rest (D9); the member name is one click deeper.
                ACTION mark, matching the findings queue's SPOF category. */}
            {spofs.map(spof => (
              <VerdictMark key={`${spof.position}-${spof.capid}`} kind="action" label={spof.positionName} />
            ))}
          </FactRow>
        )}
        <FactRow label="Training pipeline">
          {es.pipeline.activeTraining.length > 0 ? (
            <>
              {`${es.pipeline.activeTraining.length} ${plural(es.pipeline.activeTraining.length, 'member')} actively training`}
              {pipelineRanked.length > 0 && (
                <span className="text-ink2">
                  ({pipelineRanked.map(([pos, n]) => `${pos} ${n}`).join(', ')})
                </span>
              )}
            </>
          ) : (
            'No members in training'
          )}
        </FactRow>
      </FactLedger>

      {/* Estimate only: SET qual + 1yr holding; actual evaluator keying lives
          in eServices (v1 ServicesESUnitAnalysisService.html:570-646). */}
      <p className="text-xs text-ink2">
        Evaluator counts are estimates from SET plus one year holding a qualification; verify
        evaluator status in eServices.
      </p>

      <button
        type="button"
        onClick={() => setDeepDiveOpen(true)}
        data-testid="es-deep-dive-button"
        className="text-sm font-medium text-symbol hover:underline"
      >
        Open the ES deep dive
      </button>

      <EsDeepDiveModal es={es} open={deepDiveOpen} onClose={() => setDeepDiveOpen(false)} />
    </div>
  )
}
