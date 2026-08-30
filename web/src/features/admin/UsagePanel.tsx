import { Activity, RefreshCw } from 'lucide-react'
import { Banner, EmptyState, Figure, Sparkline, Spinner } from '../../components/ui'
import { useUsage } from './adminApi'

/*
 * The success-metric baseline panel (V2-DESIGN-PLAN.md section 10): the admin
 * usage rollup ships in 2.0 so the v1-vs-v2 comparison starts at cutover.
 * Targets to revisit after 60 days: 150+ distinct 60-day actives (v1 lifetime
 * baseline: 148), 20+ units viewed weekly.
 */

const QUIET_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted'

export default function UsagePanel() {
  const usageQ = useUsage()
  const usage = usageQ.data

  return (
    <div className="space-y-6" data-testid="usage-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink2">
          Access-log rollup for the success-metric baseline. Retention is 90 days; every figure
          fits inside it.
        </p>
        <button
          type="button"
          data-testid="usage-refresh"
          onClick={() => void usageQ.refetch()}
          className={QUIET_BUTTON}
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      {usageQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading usage..." />
        </div>
      )}
      {usageQ.error && (
        <Banner kind="error">
          Could not load usage ({usageQ.error.status || 'network'}): {usageQ.error.message}
        </Banner>
      )}

      {usage &&
        (usage.requests30d === 0 && usage.distinctUsers60d === 0 ? (
          <EmptyState
            icon={Activity}
            title="No usage recorded yet"
            message="The access log fills as signed-in members use the app; the baseline starts at cutover."
            diagnostic="GET /api/admin/usage returned 0 requests in 30 days and 0 distinct users in 60 days"
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-hairline pt-5 sm:grid-cols-4">
              <Figure
                size="sm"
                value={<span data-testid="usage-active-7d">{usage.distinctUsers7d}</span>}
                label="Active users, 7 days"
              />
              <Figure size="sm" value={usage.distinctUsers30d} label="Active users, 30 days" />
              <Figure
                size="sm"
                value={usage.distinctUsers60d}
                label="Active users, 60 days"
                delta="target 150+ at day 60"
              />
              <Figure
                size="sm"
                value={usage.unitsViewed7d}
                label="Units viewed, 7 days"
                delta="target 20+ weekly"
              />
            </div>

            <div className="border-t border-hairline pt-5">
              <p className="kicker text-ink">Daily active users, last 30 days</p>
              <div className="mt-3 overflow-x-auto">
                <Sparkline
                  data={usage.dailyUsers.map(p => p.users)}
                  width={480}
                  height={56}
                  label={`Daily distinct users over the last 30 days, most recent day ${
                    usage.dailyUsers[usage.dailyUsers.length - 1]?.users ?? 0
                  }`}
                />
              </div>
              <p className="tnum mt-2 text-xs text-ink2">
                {usage.requests30d.toLocaleString()} API requests in the last 30 days.
              </p>
            </div>

            <div className="border-t border-hairline pt-5">
              <p className="kicker text-ink">Top routes, last 30 days</p>
              {usage.topRoutes30d.length === 0 ? (
                <p className="mt-2 text-sm text-ink2">No requests recorded in the window.</p>
              ) : (
                <ol className="mt-2 list-none border-t border-hairline">
                  {usage.topRoutes30d.map(r => (
                    <li
                      key={r.route}
                      className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-mono text-xs text-ink">{r.route}</span>
                      <span className="tnum shrink-0 text-ink">{r.hits.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <p className="text-xs text-ink2">
              Success targets committed at cutover (design plan section 10): 150+ distinct 60-day
              actives, 20+ units viewed weekly, My Progress reached by 30% of sessions, p75 page
              render under 1s on the wing dataset.
            </p>
          </>
        ))}
    </div>
  )
}
