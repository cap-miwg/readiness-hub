import { Building2, Info } from 'lucide-react'
import type { OverviewResponse } from '@shared/contracts'
import { Badge, Banner, EmptyState, PageHeader, Spinner } from '../components/ui'
import { useOrgScope } from '../lib/urlState'
import { AdoptionSection } from '../features/overview/AdoptionSection'
import { AggregateStatsHeader, ComparisonTable } from '../features/overview/ComparisonTable'
import { EsReadinessSection } from '../features/overview/EsReadinessSection'
import { RecruitingSection } from '../features/overview/RecruitingSection'
import {
  adoptionPath,
  overviewPath,
  useAdoption,
  useEffectiveScope,
  useOverview,
} from '../features/overview/useOverviewData'

/**
 * View mode headline, ported from v1 AppUnitOverview.html:2144-2162. Mode B
 * (command-only) prompts for the Sub-Units toggle because an HQ ORGID has
 * almost no members of its own.
 */
function headerInfo(overview: OverviewResponse): { label: string; description: string } {
  const type = overview.org.type.toUpperCase()
  const hqLabel = type.includes('WING')
    ? 'Wing'
    : type.includes('GROUP')
      ? 'Group'
      : type.includes('REGION')
        ? 'Region'
        : 'Headquarters'
  if (overview.viewMode === 'aggregate') {
    return {
      label: `${hqLabel} Dashboard`,
      description: `Aggregate view of membership health across ${overview.comparison?.length ?? 0} subordinate units.`,
    }
  }
  if (overview.viewMode === 'command-only') {
    return {
      label: 'Headquarters View',
      description: 'Command/administrative unit staff overview.',
    }
  }
  return {
    label: 'Unit Overview',
    description: `Combined view of membership health and readiness for ${
      overview.descendants ? 'unit and subordinates' : 'the selected unit'
    }.`,
  }
}

function StatBlock({ label, value, wrap, text }: { label: string; value: string; wrap: string; text: string }) {
  return (
    <div className={`rounded-lg border p-3 ${wrap}`} data-testid={`overview-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${text}`}>{value}</div>
    </div>
  )
}

function OverviewBody({ overview }: { overview: OverviewResponse }) {
  const { setDescendants } = useOrgScope()
  const adoptionQ = useAdoption(overview.orgid, overview.descendants)
  const info = headerInfo(overview)
  const recruitingTitle =
    overview.viewMode === 'aggregate'
      ? 'Aggregate Recruiting and Retention'
      : overview.viewMode === 'command-only'
        ? 'HQ Staff: Recruiting and Retention'
        : 'Recruiting and Retention'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Commander Snapshot
              </p>
              {overview.viewMode === 'aggregate' && <Badge tone="indigo">Aggregate View</Badge>}
              {overview.viewMode === 'command-only' && <Badge tone="slate">Headquarters</Badge>}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{info.label}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {overview.org.name} ({overview.org.unitLabel}), {overview.org.type}
            </p>
            <p className="mt-1 text-sm text-slate-500">{info.description}</p>
          </div>
          {overview.viewMode !== 'aggregate' && (
            <div className="grid min-w-[280px] grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBlock
                label="Total Members"
                value={overview.totals.members.toLocaleString()}
                wrap="border-blue-100 bg-blue-50"
                text="text-blue-900"
              />
              <StatBlock
                label="Seniors"
                value={overview.totals.seniors.toLocaleString()}
                wrap="border-emerald-100 bg-emerald-50"
                text="text-emerald-900"
              />
              <StatBlock
                label="Cadets"
                value={overview.totals.cadets.toLocaleString()}
                wrap="border-amber-100 bg-amber-50"
                text="text-amber-900"
              />
              <StatBlock
                label="Units in Scope"
                value={overview.totals.unitsInScope.toLocaleString()}
                wrap="border-indigo-100 bg-indigo-50"
                text="text-indigo-900"
              />
            </div>
          )}
        </div>
        {overview.viewMode === 'aggregate' && overview.comparison !== null && (
          <div className="mt-4">
            <AggregateStatsHeader
              comparison={overview.comparison}
              totalMembers={overview.totals.members}
            />
          </div>
        )}
      </div>

      {overview.viewMode === 'command-only' && (
        <Banner
          kind="info"
          action={
            <button
              type="button"
              onClick={() => setDescendants(true)}
              data-testid="enable-subunits-button"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Include Sub-Units
            </button>
          }
        >
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            This is a command/administrative headquarters with few members of its own. Enable
            Include Sub-Units to see aggregate data for all subordinate units.
          </span>
        </Banner>
      )}

      {overview.viewMode === 'aggregate' && overview.comparison !== null && (
        <ComparisonTable comparison={overview.comparison} />
      )}

      <RecruitingSection
        title={recruitingTitle}
        orgStats={overview.orgStats}
        emptyDiagnostic={`OverviewResponse.orgStats is null for orgid ${overview.orgid} (scope ${overview.scope})`}
      />

      <EsReadinessSection es={overview.es} />

      {adoptionQ.data != null && <AdoptionSection adoption={adoptionQ.data} />}
      {adoptionQ.error && (
        <Banner kind="warn">
          Google adoption data could not be loaded from{' '}
          {adoptionPath(overview.orgid, overview.descendants)}: {adoptionQ.error.message}
        </Banner>
      )}
    </div>
  )
}

export default function UnitOverview() {
  const { orgid, descendants, resolving, orgsError } = useEffectiveScope()
  const overviewQ = useOverview(orgid, descendants)

  return (
    <div>
      <PageHeader
        title="Unit Overview"
        subtitle="Readiness, staffing, recruiting and retention for the selected unit"
      />

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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Try again
          </button>
        </div>
      )}

      {overviewQ.data && <OverviewBody overview={overviewQ.data} />}
    </div>
  )
}
