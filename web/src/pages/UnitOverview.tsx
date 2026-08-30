import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import type { FindingsResponse, OverviewResponse } from '@shared/contracts'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ParticipationResponse } from '@shared/participationContracts'
import type { LogisticsResponse } from '@shared/logisticsContracts'
import {
  Banner,
  EmptyState,
  FindingRow,
  FindingsList,
  Spinner,
  VerdictMark,
} from '../components/ui'
import { ExpandCollapseAll, Section } from '../components/Section'
import type { ApiError } from '../api/client'
import { useOrgScope } from '../lib/urlState'
import { AdoptionSection, aggregateAdoption } from '../features/overview/AdoptionSection'
import { AggregateStatsHeader, ComparisonTable } from '../features/overview/ComparisonTable'
import { EsReadinessSection, esStatus } from '../features/overview/EsReadinessSection'
import { LogisticsSection, logisticsStatus } from '../features/overview/LogisticsSection'
import { ParticipationSection, participationStatus } from '../features/overview/ParticipationSection'
import { RecruitingSection, recruitingStatus } from '../features/overview/RecruitingSection'
import { ratingLabel } from '../features/overview/esShared'
import { bandWord, FiguresStrip, plural, type BandRating } from '../features/overview/overviewShared'
import {
  adoptionPath,
  findingsPath,
  logisticsPath,
  overviewPath,
  participationPath,
  useAdoption,
  useEffectiveScope,
  useFindings,
  useLogistics,
  useOverview,
  useParticipation,
} from '../features/overview/useOverviewData'

/*
 * Unit Overview in the Quiet Authority grammar (V2-DESIGN-PLAN.md section 6;
 * docs/design/mockups/quiet-authority/unit-overview.html): calm masthead,
 * verdict sentence, figures strip, the ranked Needs Attention queue, then
 * collapsible sections whose collapsed headers are themselves a complete
 * brief. A healthy unit reads as a colorless page.
 */

const SECTION_PAGE = 'unit'

// --- Masthead ---

function verdictSentence(findings: FindingsResponse): {
  lead: string
  linkText: string | null
  tail: string
} {
  const n = findings.findings.length
  if (n === 0) {
    return { lead: 'Broadly healthy.', linkText: null, tail: ' Everything reads clean.' }
  }
  const anyAction = findings.findings.some(f => f.category === 'action')
  return {
    lead: anyAction ? 'Needs attention.' : 'Broadly healthy.',
    linkText: `${n} ${plural(n, 'finding needs', 'findings need')} attention`,
    tail: '; everything else reads clean.',
  }
}

function Masthead({
  overview,
  findings,
}: {
  overview: OverviewResponse
  findings: FindingsResponse | undefined
}) {
  const kicker = [
    overview.org.unitLabel,
    overview.org.type,
    overview.meetingLine ?? null,
    overview.descendants ? 'Including sub-units' : null,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')

  const sustainability = overview.orgStats?.metrics.sustainability ?? null
  const verdict = findings !== undefined ? verdictSentence(findings) : null

  return (
    <section aria-label="Unit masthead" data-testid="overview-masthead">
      <p className="kicker tnum text-ink2">{kicker}</p>
      <h1 className="mt-1.5 font-display text-[32px] font-semibold leading-tight tracking-tight text-ink">
        {overview.org.name}
      </h1>
      {verdict !== null && (
        <p className="mt-2 max-w-[58ch] text-[19px] leading-normal text-ink" data-testid="overview-verdict">
          {verdict.lead}{' '}
          {verdict.linkText !== null && (
            <a href="#queue" className="text-symbol hover:underline">
              {verdict.linkText}
            </a>
          )}
          {verdict.tail}
        </p>
      )}

      <FiguresStrip
        size="lg"
        className="mt-8"
        figures={[
          {
            label: 'Members',
            value: overview.totals.members.toLocaleString(),
            testid: 'overview-stat-total-members',
            ...(typeof overview.strengthDelta12mo === 'number'
              ? {
                  delta: `${overview.strengthDelta12mo > 0 ? '+' : ''}${overview.strengthDelta12mo} / 12 mo`,
                }
              : {}),
          },
          {
            label: 'Sustainability',
            value: sustainability?.overallScore ?? '--',
            testid: 'overview-stat-sustainability',
            ...(sustainability !== null
              ? { delta: bandWord[sustainability.rating as BandRating] }
              : {}),
          },
          {
            label: 'ES readiness',
            value: overview.es.readinessScore,
            testid: 'overview-stat-es-readiness',
            delta: ratingLabel[overview.es.readinessRating],
          },
          {
            label: 'Open findings',
            value: findings !== undefined ? findings.findings.length : '--',
            testid: 'overview-stat-open-findings',
          },
        ]}
      />
    </section>
  )
}

// --- Needs Attention queue ---

function NeedsAttention({
  findingsQ,
  orgid,
  descendants,
}: {
  findingsQ: UseQueryResult<FindingsResponse, ApiError>
  orgid: number
  descendants: boolean
}) {
  return (
    <section className="mt-11 scroll-mt-20" id="queue" aria-labelledby="lbl-queue" data-testid="findings-queue">
      <div className="flex items-baseline gap-3 pb-1">
        <p className="kicker text-ink" id="lbl-queue">
          Needs attention
        </p>
        <span className="ml-auto text-xs text-ink2">Ranked by severity</span>
      </div>
      {findingsQ.error !== null && (
        <Banner kind="warn">
          The findings queue could not be loaded from {findingsPath(orgid, descendants)}:{' '}
          {findingsQ.error.message}
        </Banner>
      )}
      {findingsQ.isPending && (
        <div className="border-t border-hairline py-4">
          <Spinner label="Ranking findings..." />
        </div>
      )}
      {findingsQ.data !== undefined && (
        <FindingsList empty="Nothing needs your attention. The unit is healthy.">
          {findingsQ.data.findings.map(f => (
            <FindingRow
              key={f.id}
              category={f.category}
              index={f.rank}
              action={
                <Link to={f.href} className="text-symbol hover:underline">
                  {f.actionLabel}
                </Link>
              }
            >
              {f.text}
            </FindingRow>
          ))}
        </FindingsList>
      )}
    </section>
  )
}

// --- Section status slots (budget: one score, one word, one alert count) ---

function NoAlerts() {
  return <span className="text-muted">No alerts</span>
}

// --- Page body ---

function OverviewBody({
  overview,
  findingsQ,
  participationQ,
  logisticsQ,
}: {
  overview: OverviewResponse
  findingsQ: UseQueryResult<FindingsResponse, ApiError>
  participationQ: UseQueryResult<ParticipationResponse, ApiError>
  logisticsQ: UseQueryResult<LogisticsResponse, ApiError>
}) {
  const { setDescendants } = useOrgScope()
  const adoptionQ = useAdoption(overview.orgid, overview.descendants)

  const recruiting = recruitingStatus(overview.orgStats)
  const es = esStatus(overview.es)
  const esWorst = es.alerts.some(a => a.kind === 'action') ? 'action' : 'watch'
  const pStatus = participationStatus(participationQ.data)
  const lStatus = logisticsStatus(logisticsQ.data)
  const adoption = adoptionQ.data ?? null
  const adoptionRate = adoption !== null ? aggregateAdoption(adoption.units).adoptionRate : null

  const recruitingTitle =
    overview.viewMode === 'aggregate'
      ? 'Aggregate Recruiting and Retention'
      : overview.viewMode === 'command-only'
        ? 'HQ Staff: Recruiting and Retention'
        : 'Recruiting and Retention'

  const sectionIds = [
    'recruiting',
    'es',
    'participation',
    'logistics',
    ...(adoption !== null ? ['workspace'] : []),
  ]

  return (
    <div>
      <Masthead overview={overview} findings={findingsQ.data} />

      {overview.viewMode === 'command-only' && (
        <Banner
          kind="info"
          className="mt-8"
          action={
            <button
              type="button"
              onClick={() => setDescendants(true)}
              data-testid="enable-subunits-button"
              className="rounded-md bg-symbol px-3 py-1.5 text-xs font-semibold text-paper hover:bg-symbol/90"
            >
              Include Sub-Units
            </button>
          }
        >
          This is a command headquarters with few members of its own. Include sub-units to see
          aggregate data for everything under it.
        </Banner>
      )}

      <NeedsAttention
        findingsQ={findingsQ}
        orgid={overview.orgid}
        descendants={overview.descendants}
      />

      {overview.viewMode === 'aggregate' && overview.comparison !== null && (
        <section className="mt-11 space-y-5">
          <AggregateStatsHeader
            comparison={overview.comparison}
            totalMembers={overview.totals.members}
          />
          <ComparisonTable comparison={overview.comparison} />
        </section>
      )}

      <div className="mt-10 flex justify-end pb-1">
        <ExpandCollapseAll page={SECTION_PAGE} ids={sectionIds} />
      </div>

      <Section
        page={SECTION_PAGE}
        id="recruiting"
        title={recruitingTitle}
        defaultOpen={recruiting.alerts.length > 0}
        status={
          <>
            {recruiting.score !== null && <span className="font-semibold">{recruiting.score}</span>}
            {recruiting.band !== null && <span>{recruiting.band}</span>}
            {recruiting.alerts.length > 0 ? (
              <VerdictMark
                kind="watch"
                label={`${recruiting.alerts.length} ${plural(recruiting.alerts.length, 'alert')}`}
              />
            ) : (
              <NoAlerts />
            )}
          </>
        }
      >
        <RecruitingSection
          orgStats={overview.orgStats}
          strengthSeries={overview.strengthSeries}
          strengthDelta12mo={overview.strengthDelta12mo}
          emptyDiagnostic={`OverviewResponse.orgStats is null for orgid ${overview.orgid} (scope ${overview.scope})`}
        />
      </Section>

      <Section
        page={SECTION_PAGE}
        id="es"
        title="Emergency Services"
        status={
          <>
            <span className="font-semibold">{es.score}</span>
            <span>{es.band}</span>
            {es.alerts.length > 0 ? (
              <VerdictMark
                kind={esWorst}
                label={`${es.alerts.length} ${plural(es.alerts.length, 'alert')}`}
              />
            ) : (
              <NoAlerts />
            )}
          </>
        }
      >
        <EsReadinessSection es={overview.es} />
      </Section>

      <Section
        page={SECTION_PAGE}
        id="participation"
        title="Participation"
        status={
          pStatus === null ? undefined : !pStatus.recorded ? (
            <VerdictMark kind="notRecorded" label={<span className="text-ink2">Not recorded</span>} />
          ) : (
            <>
              {pStatus.score !== null && <span className="font-semibold">{pStatus.score}</span>}
              {pStatus.word !== null && <span>{pStatus.word}</span>}
              {pStatus.quietCount > 0 ? (
                <VerdictMark kind="watch" label={`${pStatus.quietCount} quiet`} />
              ) : (
                <NoAlerts />
              )}
            </>
          )
        }
      >
        {participationQ.isPending && <Spinner label="Loading attendance..." />}
        {participationQ.error !== null && (
          <Banner kind="warn">
            Attendance data could not be loaded from{' '}
            {participationPath(overview.orgid, overview.descendants)}:{' '}
            {participationQ.error.message}
          </Banner>
        )}
        {participationQ.data !== undefined && (
          <ParticipationSection participation={participationQ.data} />
        )}
      </Section>

      <Section
        page={SECTION_PAGE}
        id="logistics"
        title="Logistics"
        status={
          lStatus === null ? undefined : !lStatus.recorded ? (
            <VerdictMark kind="notRecorded" label={<span className="text-ink2">Not recorded</span>} />
          ) : (
            <>
              {lStatus.score !== null && <span className="font-semibold">{lStatus.score}</span>}
              {lStatus.downCount > 0 ? (
                <VerdictMark
                  kind="action"
                  label={`${lStatus.downCount} down`}
                />
              ) : (
                <NoAlerts />
              )}
            </>
          )
        }
      >
        {logisticsQ.isPending && <Spinner label="Loading logistics..." />}
        {logisticsQ.error !== null && (
          <Banner kind="warn">
            Logistics data could not be loaded from{' '}
            {logisticsPath(overview.orgid, overview.descendants)}: {logisticsQ.error.message}
          </Banner>
        )}
        {logisticsQ.data !== undefined && <LogisticsSection logistics={logisticsQ.data} />}
      </Section>

      {adoption !== null && (
        <Section
          page={SECTION_PAGE}
          id="workspace"
          title="Workspace Adoption"
          status={
            <>
              {adoptionRate !== null && <span className="font-semibold">{adoptionRate}%</span>}
              <span className="text-muted">Informational</span>
            </>
          }
        >
          <AdoptionSection adoption={adoption} />
        </Section>
      )}
      {adoptionQ.error !== null && (
        <Banner kind="warn" className="mt-4">
          Google adoption data could not be loaded from{' '}
          {adoptionPath(overview.orgid, overview.descendants)}: {adoptionQ.error.message}
        </Banner>
      )}
    </div>
  )
}

export default function UnitOverview() {
  const { orgid, descendants, resolving, orgsError } = useEffectiveScope()
  // Parallel queries: the masthead, queue, and sections stream in together.
  const overviewQ = useOverview(orgid, descendants)
  const findingsQ = useFindings(orgid, descendants)
  const participationQ = useParticipation(orgid, descendants)
  const logisticsQ = useLogistics(orgid, descendants)

  return (
    <div>
      {resolving && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading units..." />
        </div>
      )}

      {orgsError && (
        <EmptyState
          icon={Building2}
          title="Unit list unavailable"
          message="The org tree could not be loaded, so no unit can be selected."
          diagnostic={`GET /api/orgs -> ${orgsError.status || 'network'}: ${orgsError.message}`}
        />
      )}

      {orgid !== null && overviewQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading unit overview..." />
        </div>
      )}

      {orgid !== null && overviewQ.error && overviewQ.error.status === 404 && (
        <EmptyState
          icon={Building2}
          title="No data for this unit"
          message="The server has no computed dataset for this unit yet. Run a CAPWATCH ingest from the Admin page, or pick another unit."
          diagnostic={`GET ${overviewPath(orgid, descendants)} -> 404: ${overviewQ.error.message}`}
        />
      )}

      {orgid !== null && overviewQ.error && overviewQ.error.status !== 404 && (
        <div className="space-y-3">
          <Banner kind="error">
            Could not load the unit overview from {overviewPath(orgid, descendants)}:{' '}
            {overviewQ.error.message}
          </Banner>
          <button
            type="button"
            onClick={() => void overviewQ.refetch()}
            className="rounded-md border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-muted"
          >
            Try again
          </button>
        </div>
      )}

      {overviewQ.data && (
        <OverviewBody
          overview={overviewQ.data}
          findingsQ={findingsQ}
          participationQ={participationQ}
          logisticsQ={logisticsQ}
        />
      )}
    </div>
  )
}
