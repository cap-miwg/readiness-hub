import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react'
import type { AdoptionResponse, AdoptionUnitRow, AdoptionUserRow } from '@shared/contracts'
import { DataTable, EmptyState, ProgressBar, type Column } from '../../components/ui'
import { FiguresStrip } from './overviewShared'

/*
 * Workspace Adoption, demoted per the plan (section 6): a collapsed,
 * neutral, admin-leaning section. Adoption is informational, not a verdict:
 * no scarlet bars, no color bands; the one meter is Symbol Blue on gray
 * (identity/interactive, not judgment).
 */

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

export interface AggregateStats {
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

export function aggregateAdoption(units: readonly AdoptionUnitRow[]): AggregateStats {
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
      <span className="inline-flex items-center justify-center">
        <Check className="h-3.5 w-3.5 text-ink2" aria-hidden />
        <span className="sr-only">yes</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center">
      <Minus className="h-3.5 w-3.5 text-muted" aria-hidden />
      <span className="sr-only">{on === null ? 'unknown' : 'no'}</span>
    </span>
  )
}

const unitColumns: readonly Column<AdoptionUnitRow>[] = [
  {
    key: 'unit',
    header: 'Unit',
    render: u => (
      <span className="tnum font-medium text-ink" data-testid={`adoption-unit-${u.unit}`}>
        {u.unit}
      </span>
    ),
    sortValue: u => u.unit,
  },
  {
    key: 'adoption',
    header: 'Adoption',
    numeric: true,
    render: u => {
      const rate = unitRate(u)
      return <span className="text-ink">{rate !== null ? `${rate}%` : '--'}</span>
    },
    sortValue: u => unitRate(u),
  },
  {
    key: 'active',
    header: 'Active / Roster',
    numeric: true,
    render: u => (
      <span className="text-ink2">
        {u.activeUsers ?? '--'}/{u.rosterCount ?? '--'}
      </span>
    ),
    sortValue: u => u.activeUsers,
  },
  {
    key: 'login',
    header: 'Recent Login',
    numeric: true,
    render: u => <span className="text-ink2">{u.recentLogin ?? '--'}</span>,
    sortValue: u => u.recentLogin,
  },
  {
    key: 'gmail',
    header: 'Gmail',
    numeric: true,
    render: u => <span className="text-ink2">{u.gmailActive ?? '--'}</span>,
    sortValue: u => u.gmailActive,
  },
  {
    key: 'drive',
    header: 'Drive',
    numeric: true,
    render: u => <span className="text-ink2">{u.driveActive ?? '--'}</span>,
    sortValue: u => u.driveActive,
  },
  {
    key: 'collected',
    header: 'Collected',
    render: u => <span className="tnum text-ink2">{u.collectionDate ?? '--'}</span>,
    sortValue: u => u.collectionDate,
  },
]

const userColumns: readonly Column<AdoptionUserRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: u => (
      <div data-testid={`adoption-user-${u.email ?? 'unknown'}`}>
        <div className="font-medium text-ink">{u.fullName ?? 'Unknown'}</div>
        <div className="text-xs text-ink2">{u.email ?? ''}</div>
      </div>
    ),
    sortValue: u => u.fullName,
  },
  {
    key: 'active',
    header: 'Active',
    render: u => (
      <span className={u.isActiveUser === true ? 'text-ink' : 'text-ink2'}>
        {u.isActiveUser === true ? 'Active' : 'Inactive'}
      </span>
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
    render: u => <span className="tnum text-ink2">{u.lastLoginDate ?? 'Never'}</span>,
    sortValue: u => u.lastLoginDate,
  },
]

export function AdoptionSection({ adoption }: { adoption: AdoptionResponse }) {
  const [showUsers, setShowUsers] = useState(false)
  const stats = useMemo(() => aggregateAdoption(adoption.units), [adoption.units])
  const collectionDate = adoption.units.map(u => u.collectionDate).find(d => d !== null) ?? null
  const activeUserCount = adoption.users.filter(u => u.isActiveUser === true).length

  return (
    <div className="space-y-6" data-testid="adoption-section">
      <p className="max-w-[62ch] text-[15px] text-ink">
        <span className="tnum" data-testid="adoption-rate">
          {stats.activeUsers} of {stats.rosterCount}
        </span>{' '}
        members signed in to Workspace recently ({stats.adoptionRate}%). Account-level detail lives
        below.
      </p>

      <ProgressBar
        value={stats.adoptionRate}
        label={adoption.units.length > 1 ? 'Combined adoption rate' : 'Workspace adoption rate'}
        className="max-w-md"
      />

      <FiguresStrip
        size="sm"
        figures={[
          {
            label: 'Active users',
            value: stats.activeUsers,
            delta: `of ${stats.rosterCount} roster`,
          },
          {
            label: 'Recent login',
            value: stats.recentLogin,
            delta: `${stats.loginRate}% of accounts`,
          },
          {
            label: 'Gmail active',
            value: stats.gmailActive,
            delta: `${stats.gmailRate}% using`,
          },
          {
            label: 'Drive active',
            value: stats.driveActive,
            delta: `${stats.driveRate}% using`,
          },
        ]}
      />

      {adoption.units.length > 1 && (
        <div>
          <p className="kicker mb-2 text-ink">Breakdown by unit</p>
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
            className="flex items-center gap-1.5 text-sm font-medium text-symbol hover:underline"
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
              <div className="tnum text-xs text-ink2">
                {activeUserCount} of {adoption.users.length} members are actively using their
                Google account
              </div>
            </div>
          )}
        </div>
      )}

      <p className="tnum text-xs text-ink2">Data collected: {collectionDate ?? 'unknown'}</p>
    </div>
  )
}
