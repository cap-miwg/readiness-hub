import { Link } from 'react-router-dom'
import { Github } from 'lucide-react'
import { ApiError, APP_NAME_FALLBACK, useMeta } from '../api/client'
import { BUILD_VERSION } from '../components/Layout'
import { orgScopeSearch, useOrgScope } from '../lib/urlState'
import { Banner, Card } from '../components/ui'
import { useEffectiveScope, useOverview, overviewPath } from '../features/overview/useOverviewData'

function HeroTile({
  label,
  value,
  testid,
}: {
  label: string
  value: string
  testid: string
}) {
  return (
    <div className="rounded-lg bg-white/10 p-3" data-testid={testid}>
      <div className="text-xs uppercase opacity-80">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}

export default function Home() {
  const metaQ = useMeta()
  const { scope } = useOrgScope()
  const { orgid, descendants, resolving, orgsError } = useEffectiveScope()
  const overviewQ = useOverview(orgid, descendants)
  const meta = metaQ.data
  const overview = overviewQ.data

  const scopeSearch = orgScopeSearch(scope)
  const pending = resolving || (orgid !== null && overviewQ.isPending)
  const tileValue = (n: number | undefined): string =>
    pending ? '...' : n !== undefined ? n.toLocaleString() : '--'

  const loadError = orgsError ?? overviewQ.error ?? null
  const noDataset = loadError instanceof ApiError && loadError.status === 404

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide opacity-80">Welcome to</p>
          <h2 className="text-2xl font-bold">{meta?.appName || APP_NAME_FALLBACK}</h2>
          <p className="max-w-xl text-sm text-blue-100">
            One place for commanders, senior members, and cadets to monitor readiness, training,
            and staffing.
          </p>
          {overview && (
            <p className="mt-1 text-xs text-blue-200">
              {overview.org.name} ({overview.org.unitLabel})
              {descendants ? ', including sub-units' : ''}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to={{ pathname: '/seniors', search: scopeSearch }}
              data-testid="home-hero-seniors"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-blue-700 hover:shadow"
            >
              Senior Dashboard
            </Link>
            <Link
              to={{ pathname: '/cadets', search: scopeSearch }}
              data-testid="home-hero-cadets"
              className="rounded-lg border border-white/30 bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400"
            >
              Cadet Dashboard
            </Link>
            <Link
              to={{ pathname: '/unit', search: scopeSearch }}
              data-testid="home-hero-unit"
              className="rounded-lg border border-white/30 bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400"
            >
              Unit Overview
            </Link>
          </div>
        </div>
        <div className="grid min-w-[240px] grid-cols-2 gap-3">
          <HeroTile
            label="Total Strength"
            value={tileValue(overview?.totals.members)}
            testid="home-tile-total-strength"
          />
          <HeroTile
            label="Senior Members"
            value={tileValue(overview?.totals.seniors)}
            testid="home-tile-seniors"
          />
          <HeroTile
            label="Cadets"
            value={tileValue(overview?.totals.cadets)}
            testid="home-tile-cadets"
          />
          <HeroTile
            label="Units in Scope"
            value={tileValue(overview?.totals.unitsInScope)}
            testid="home-tile-units-in-scope"
          />
        </div>
      </div>

      {loadError !== null && (
        <Banner kind={noDataset ? 'warn' : 'error'}>
          {noDataset
            ? `No dashboard data yet: ${loadError.message}. An admin can run the first CAPWATCH ingest from the Admin page.`
            : `Could not load unit stats${orgid !== null ? ` from ${overviewPath(orgid, descendants)}` : ' (unit list unavailable)'}: ${loadError.message}`}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card data-testid="home-card-commanders">
          <h3 className="font-bold text-slate-900">For Commanders</h3>
          <p className="mt-1 text-sm text-slate-600">
            Snapshot of readiness, staffing, and upcoming expirations.
          </p>
          <Link
            to={{ pathname: '/unit', search: scopeSearch }}
            className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline"
          >
            Open Unit Overview
          </Link>
        </Card>
        <Card data-testid="home-card-seniors">
          <h3 className="font-bold text-slate-900">Senior Members</h3>
          <p className="mt-1 text-sm text-slate-600">
            Education and training, promotions, duty coverage.
          </p>
          <Link
            to={{ pathname: '/seniors', search: scopeSearch }}
            className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline"
          >
            Go to Senior Dashboard
          </Link>
        </Card>
        <Card data-testid="home-card-cadets">
          <h3 className="font-bold text-slate-900">Cadets</h3>
          <p className="mt-1 text-sm text-slate-600">
            Milestones, leadership billets, participation.
          </p>
          <Link
            to={{ pathname: '/cadets', search: scopeSearch }}
            className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline"
          >
            Go to Cadet Dashboard
          </Link>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
        <span title={meta ? `Server ${meta.appVersion}` : undefined}>v{BUILD_VERSION}</span>
        <a
          href="https://github.com/cap-miwg/readiness-hub"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-slate-400 transition-colors hover:text-slate-600"
        >
          <Github className="h-3.5 w-3.5" aria-hidden />
          <span>View on GitHub</span>
        </a>
      </div>
    </div>
  )
}
