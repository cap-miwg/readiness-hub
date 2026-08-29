import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Cloud, Minus } from 'lucide-react'
import type { AdoptionResponse, AdoptionUnitRow, AdoptionUserRow } from '@shared/contracts'
import { Badge, Card, DataTable, EmptyState, ProgressBar, type Column, type Tone } from '../../components/ui'

/** Adoption color bands 80/60/40 (v1 AppUnitOverview.html:1445-1450). */
function rateTone(rate: number | null): Tone {
  if (rate === null) return 'slate'
  if (rate >= 80) return 'green'
  if (rate >= 60) return 'blue'
  if (rate >= 40) return 'amber'
  return 'red'
}

function parseRate(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number.parseFloat(raw.replace('%', ''))
  return Number.isFinite(n) ? n : null
}

function unitRate(u: AdoptionUnitRow): number | null {
  const served = parseRate(u.adoptionRate)
  if (served !== null) return served
  if (u.rosterCount !== null && u.rosterCount > 0 && u.activeUsers !== null) {
    return Math.min(Math.round((u.activeUsers / u.rosterCount) * 100), 100)
  }
  return null
}

interface AggregateStats {
  rosterCount: number
  activeUsers: number
  totalAccounts: number
  recentLogin: number
  gmailActive: number
  driveActive: number
  adoptionRate: number
  loginRate: number
  gmailRate: number
  driveRate: number
}

function aggregate(units: readonly AdoptionUnitRow[]): AggregateStats {
  let rosterCount = 0
  let activeUsers = 0
  let totalAccounts = 0
  let recentLogin = 0
  let gmailActive = 0
  let driveActive = 0
  for (const u of units) {
    rosterCount += u.rosterCount ?? 0
    activeUsers += u.activeUsers ?? 0
    totalAccounts += u.totalAccounts ?? 0
    recentLogin += u.recentLogin ?? 0
    gmailActive += u.gmailActive ?? 0
    driveActive += u.driveActive ?? 0
  }
  // Adoption = active users over roster, capped at 100 (v1 AppUnitOverview.html:1409-1411).
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)
  return {
    rosterCount,
    activeUsers,
    totalAccounts,
    recentLogin,
    gmailActive,
    driveActive,
    adoptionRate: Math.min(pct(activeUsers, rosterCount), 100),
    loginRate: pct(recentLogin, totalAccounts),
    gmailRate: pct(gmailActive, totalAccounts),
    driveRate: pct(driveActive, totalAccounts),
  }
}

function ActivityMark({ on }: { on: boolean | null }) {
  if (on === true) {
    return (
      <span className="inline-flex items-center justify-center rounded bg-emerald-100 px-1.5 py-0.5">
        <Check className="h-3 w-3 text-emerald-700" aria-hidden />
        <span className="sr-only">yes</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded bg-slate-100 px-1.5 py-0.5">
      <Minus className="h-3 w-3 text-slate-400" aria-hidden />
      <span className="sr-only">{on === null ? 'unknown' : 'no'}</span>
    </span>
  )
}

const unitColumns: readonly Column<AdoptionUnitRow>[] = [
  {
    key: 'unit',
    header: 'Unit',
    render: u => (
      <span className="font-medium text-slate-800" data-testid={`adoption-unit-${u.unit}`}>
        {u.unit}
      </span>
    ),
    sortValue: u => u.unit,
  },
  {
    key: 'adoption',
    header: 'Adoption',
    render: u => {
      const rate = unitRate(u)
      return <Badge tone={rateTone(rate)}>{rate !== null ? `${rate}%` : '--'}</Badge>
    },
    sortValue: u => unitRate(u),
  },
  {
    key: 'active',
    header: 'Active / Roster',
    render: u => (
      <span className="text-slate-600">
        {u.activeUsers ?? '--'}/{u.rosterCount ?? '--'}
      </span>
    ),
    sortValue: u => u.activeUsers,
  },
  {
    key: 'login',
    header: 'Recent Login',
    render: u => <span className="text-slate-600">{u.recentLogin ?? '--'}</span>,
    sortValue: u => u.recentLogin,
  },
  {
    key: 'gmail',
    header: 'Gmail',
    render: u => <span className="text-slate-600">{u.gmailActive ?? '--'}</span>,
    sortValue: u => u.gmailActive,
  },
  {
    key: 'drive',
    header: 'Drive',
    render: u => <span className="text-slate-600">{u.driveActive ?? '--'}</span>,
    sortValue: u => u.driveActive,
  },
  {
    key: 'collected',
    header: 'Collected',
    render: u => <span className="text-slate-500">{u.collectionDate ?? '--'}</span>,
    sortValue: u => u.collectionDate,
  },
]

const userColumns: readonly Column<AdoptionUserRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: u => (
      <div data-testid={`adoption-user-${u.email ?? 'unknown'}`}>
        <div className="font-medium text-slate-800">{u.fullName ?? 'Unknown'}</div>
        <div className="text-xs text-slate-500">{u.email ?? ''}</div>
      </div>
    ),
    sortValue: u => u.fullName,
  },
  {
    key: 'active',
    header: 'Active',
    render: u => (
      <Badge tone={u.isActiveUser === true ? 'green' : 'red'}>
        {u.isActiveUser === true ? 'Active' : 'Inactive'}
      </Badge>
    ),
    sortValue: u => (u.isActiveUser === true ? 1 : 0),
  },
  {
    key: 'login',
    header: 'Login',
    align: 'center',
    render: u => <ActivityMark on={u.hasRecentLogin} />,
    sortValue: u => (u.hasRecentLogin === true ? 1 : 0),
  },
  {
    key: 'gmail',
    header: 'Gmail',
    align: 'center',
    render: u => <ActivityMark on={u.hasGmailActivity} />,
    sortValue: u => (u.hasGmailActivity === true ? 1 : 0),
  },
  {
    key: 'drive',
    header: 'Drive',
    align: 'center',
    render: u => <ActivityMark on={u.hasDriveActivity} />,
    sortValue: u => (u.hasDriveActivity === true ? 1 : 0),
  },
  {
    key: 'lastLogin',
    header: 'Last Login',
    render: u => <span className="text-slate-600">{u.lastLoginDate ?? 'Never'}</span>,
    sortValue: u => u.lastLoginDate,
  },
]

export function AdoptionSection({ adoption }: { adoption: AdoptionResponse }) {
  const [showUsers, setShowUsers] = useState(false)
  const stats = useMemo(() => aggregate(adoption.units), [adoption.units])
  const tone = rateTone(stats.adoptionRate)
  const collectionDate = adoption.units.map(u => u.collectionDate).find(d => d !== null) ?? null
  const activeUserCount = adoption.users.filter(u => u.isActiveUser === true).length

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blue-700" aria-hidden />
          Google Workspace Adoption
        </span>
      }
      actions={
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>
            {stats.activeUsers} of {stats.rosterCount} active
          </span>
          <Badge tone={tone}>{stats.adoptionRate}%</Badge>
        </div>
      }
      data-testid="adoption-section"
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold text-slate-800">
              {adoption.units.length > 1 ? 'Combined Adoption Rate' : 'Workspace Adoption Rate'}
            </h4>
            <span className="text-2xl font-bold text-slate-900" data-testid="adoption-rate">
              {stats.adoptionRate}%
            </span>
          </div>
          <ProgressBar value={stats.adoptionRate} accent={tone} />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>0%</span>
            <span>Target: 80%+</span>
            <span>100%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Active Users
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.activeUsers}</div>
            <div className="text-xs text-slate-500">of {stats.rosterCount} roster</div>
          </div>
          <div
            className={clsx(
              'rounded-lg border px-3 py-2.5',
              stats.loginRate >= 70
                ? 'border-emerald-100 bg-emerald-50'
                : stats.loginRate >= 40
                  ? 'border-amber-100 bg-amber-50'
                  : 'border-rose-100 bg-rose-50',
            )}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Recent Login
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.recentLogin}</div>
            <div className="text-xs text-slate-500">{stats.loginRate}% of accounts</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Gmail Active
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.gmailActive}</div>
            <div className="text-xs text-slate-500">{stats.gmailRate}% using</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Drive Active
            </div>
            <div className="text-xl font-bold text-slate-800">{stats.driveActive}</div>
            <div className="text-xs text-slate-500">{stats.driveRate}% using</div>
          </div>
        </div>

        {adoption.units.length > 1 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Breakdown by Unit</h4>
            <DataTable
              columns={unitColumns}
              rows={adoption.units}
              rowKey={u => u.unit}
              initialSort={{ key: 'adoption', dir: 'desc' }}
              empty={
                <EmptyState
                  title="No unit adoption rows"
                  message="The adoption sideload has no rows for the units in scope."
                  diagnostic={`adoption.units empty for orgid ${adoption.orgid}`}
                />
              }
            />
          </div>
        )}

        {adoption.users.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowUsers(v => !v)}
              aria-expanded={showUsers}
              data-testid="adoption-users-toggle"
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              {showUsers ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
              {showUsers ? 'Hide' : 'Show'} member details ({adoption.users.length} accounts
              {adoption.unitKey !== null ? `, ${adoption.unitKey}` : ''})
            </button>
            {showUsers && (
              <div className="mt-3 space-y-2">
                <DataTable
                  columns={userColumns}
                  rows={adoption.users}
                  rowKey={u => u.email ?? u.fullName ?? 'unknown'}
                  initialSort={{ key: 'name', dir: 'asc' }}
                  maxHeight="24rem"
                />
                <div className="text-xs text-slate-500">
                  {activeUserCount} of {adoption.users.length} members are actively using their
                  Google account
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-right text-xs text-slate-400">
          Data collected: {collectionDate ?? 'unknown'}
        </div>
      </div>
    </Card>
  )
}
