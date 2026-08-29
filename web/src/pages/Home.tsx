import { Link } from 'react-router-dom'
import { Building2, Clock, Github, Users } from 'lucide-react'
import { APP_NAME_FALLBACK, useMeta } from '../api/client'
import { BUILD_VERSION } from '../components/Layout'
import { Banner, Card, Spinner, StatTile } from '../components/ui'

export default function Home() {
  const metaQ = useMeta()
  const meta = metaQ.data

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
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/seniors"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-blue-700 hover:shadow"
            >
              Senior Dashboard
            </Link>
            <Link
              to="/cadets"
              className="rounded-lg border border-white/30 bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400"
            >
              Cadet Dashboard
            </Link>
            <Link
              to="/unit"
              className="rounded-lg border border-white/30 bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400"
            >
              Unit Overview
            </Link>
          </div>
        </div>
        <div className="grid min-w-[240px] grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs uppercase opacity-80">Members</div>
            <div className="text-xl font-bold">
              {metaQ.isPending ? '...' : (meta?.memberCount ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs uppercase opacity-80">Units</div>
            <div className="text-xl font-bold">
              {metaQ.isPending ? '...' : (meta?.orgCount ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {metaQ.error && (
        <Banner kind="error">
          Could not load dashboard metadata from /api/meta: {metaQ.error.message}
        </Banner>
      )}

      {metaQ.isPending && (
        <div className="flex justify-center py-4">
          <Spinner label="Loading metadata..." />
        </div>
      )}

      {meta && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total members" value={meta.memberCount.toLocaleString()} icon={Users} accent="blue" />
          <StatTile
            label="Units in scope"
            value={meta.orgCount.toLocaleString()}
            icon={Building2}
            accent="indigo"
          />
          <StatTile
            label="Data as of"
            value={meta.downloadDate ? new Date(meta.downloadDate).toLocaleDateString() : 'No data'}
            sublabel={
              meta.lastIngestAt
                ? `Ingested ${new Date(meta.lastIngestAt).toLocaleString()}`
                : 'No ingest has completed yet'
            }
            icon={Clock}
            accent={meta.downloadDate ? 'green' : 'amber'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <h3 className="font-bold text-slate-900">For Commanders</h3>
          <p className="mt-1 text-sm text-slate-600">
            Snapshot of readiness, staffing, and upcoming expirations.
          </p>
          <Link to="/unit" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline">
            Open Unit Overview
          </Link>
        </Card>
        <Card>
          <h3 className="font-bold text-slate-900">Senior Members</h3>
          <p className="mt-1 text-sm text-slate-600">
            Education and training, promotions, duty coverage.
          </p>
          <Link to="/seniors" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline">
            Go to Senior Dashboard
          </Link>
        </Card>
        <Card>
          <h3 className="font-bold text-slate-900">Cadets</h3>
          <p className="mt-1 text-sm text-slate-600">
            Milestones, leadership billets, participation.
          </p>
          <Link to="/cadets" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline">
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
