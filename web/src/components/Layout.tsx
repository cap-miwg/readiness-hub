import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  LogOut,
  Menu,
  RefreshCw,
  User,
} from 'lucide-react'
import clsx from 'clsx'
import type { MeResponse, OrgTreeNode } from '@shared/contracts'
import { APP_NAME_FALLBACK, logout, useMeta, useOrgs } from '../api/client'
import { orgScopeSearch, useOrgScope } from '../lib/urlState'
import { Badge, Banner, Spinner } from './ui'

const NAV_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/unit', label: 'Unit Overview' },
  { path: '/seniors', label: 'Seniors' },
  { path: '/cadets', label: 'Cadets' },
  { path: '/reports', label: 'Reports' },
  { path: '/orgchart', label: 'Org Chart' },
] as const

const ADMIN_ITEM = { path: '/admin', label: 'Admin' } as const

export const BUILD_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'

interface FlatOrg {
  orgid: number
  label: string
  depth: number
}

function flattenOrgTree(node: OrgTreeNode, depth = 0, out: FlatOrg[] = []): FlatOrg[] {
  out.push({ orgid: node.orgid, label: node.name, depth })
  for (const child of node.children) flattenOrgTree(child, depth + 1, out)
  return out
}

// 26h: the scheduled ingest is daily (04:00, docs/ARCHITECTURE.md Ingest);
// anything older than one cycle plus slack means the pipeline is stalled.
const STALE_AFTER_HOURS = 26

interface DataAge {
  text: string
  stale: boolean
  exact: string
}

function dataAge(downloadDate: string | null, nowMs: number): DataAge | null {
  if (!downloadDate) return null
  const parsed = new Date(downloadDate)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = (nowMs - parsed.getTime()) / 3_600_000
  let text: string
  if (hours < 1) text = 'under 1h old'
  else if (hours < 48) text = `${Math.floor(hours)}h old`
  else text = `${Math.floor(hours / 24)}d old`
  return { text, stale: hours > STALE_AFTER_HOURS, exact: parsed.toLocaleString() }
}

function UserMenu({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onLogout = async () => {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      // Full reload clears all client cache regardless of logout outcome.
      window.location.href = '/login'
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg border border-blue-700 bg-blue-800 px-2.5 py-1.5 text-sm text-blue-100 hover:bg-blue-700"
      >
        <User className="h-4 w-4" aria-hidden />
        <span className="hidden max-w-[160px] truncate sm:inline">{me.name || me.email}</span>
        <ChevronDown className="h-3.5 w-3.5 text-blue-300" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 text-slate-800 shadow-lg">
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-bold">{me.name || me.email}</div>
            <div className="truncate text-xs text-slate-500">{me.email}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={me.role === 'admin' ? 'amber' : 'blue'}>{me.role}</Badge>
              {me.authMode === 'dev' && <Badge tone="red">dev auth</Badge>}
            </div>
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout({ me, children }: { me: MeResponse; children: ReactNode }) {
  const metaQ = useMeta()
  const orgsQ = useOrgs()
  const { scope, setOrgid, setDescendants } = useOrgScope()
  const [navOpen, setNavOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [dismissedVersionPrompt, setDismissedVersionPrompt] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const meta = metaQ.data
  const appName = meta?.appName || APP_NAME_FALLBACK
  const flatOrgs = useMemo(
    () => (orgsQ.data ? flattenOrgTree(orgsQ.data.tree) : []),
    [orgsQ.data],
  )
  const selectedOrgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null
  const age = dataAge(meta?.downloadDate ?? null, nowMs)
  const versionMismatch =
    !dismissedVersionPrompt &&
    meta !== undefined &&
    BUILD_VERSION !== 'dev' &&
    meta.appVersion !== BUILD_VERSION

  const navItems = me.role === 'admin' ? [...NAV_ITEMS, ADMIN_ITEM] : [...NAV_ITEMS]
  const scopeSearch = orgScopeSearch(scope)

  return (
    <div className="min-h-screen bg-slate-50 pb-16 font-sans text-slate-900">
      <header className="sticky top-0 z-50 bg-blue-900 text-white shadow">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <NavLink to={{ pathname: '/', search: scopeSearch }} className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">{appName}</h1>
            </NavLink>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(v => !v)}
              aria-expanded={navOpen}
              className="flex items-center gap-2 rounded-lg border border-blue-700 bg-blue-800 px-3 py-1.5 text-sm md:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden /> Menu
            </button>

            <nav className="hidden max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg bg-blue-800 p-1 md:flex">
              {navItems.map(item => (
                <NavLink
                  key={item.path}
                  to={{ pathname: item.path, search: scopeSearch }}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap rounded px-3 py-1.5 text-sm font-semibold transition-all',
                      isActive ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-200 hover:text-white',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <UserMenu me={me} />
          </div>

          {navOpen && (
            <nav className="flex w-full flex-col gap-1 rounded-lg bg-blue-800 p-2 md:hidden">
              {navItems.map(item => (
                <NavLink
                  key={item.path}
                  to={{ pathname: item.path, search: scopeSearch }}
                  end={item.path === '/'}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'rounded px-3 py-2 text-left text-sm font-semibold transition-colors',
                      isActive ? 'bg-white text-blue-900' : 'text-blue-100 hover:bg-blue-700',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="border-t border-blue-800 bg-blue-900/95">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
            <div className="relative min-w-[220px] flex-1 sm:max-w-[360px]">
              {orgsQ.isPending ? (
                <div className="flex items-center gap-2 rounded border border-blue-700 bg-blue-800 px-2 py-2 text-sm text-blue-200">
                  <Spinner /> Loading units...
                </div>
              ) : orgsQ.error ? (
                <div
                  className="truncate rounded border border-red-400 bg-red-900/40 px-2 py-2 text-sm text-red-100"
                  title={orgsQ.error.message}
                >
                  Units unavailable: {orgsQ.error.message}
                </div>
              ) : (
                <>
                  <label className="sr-only" htmlFor="org-select">
                    Unit
                  </label>
                  <select
                    id="org-select"
                    value={selectedOrgid ?? ''}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setOrgid(Number.isSafeInteger(v) ? v : null)
                    }}
                    className="w-full cursor-pointer appearance-none truncate rounded border border-blue-700 bg-blue-800 py-2 pl-2 pr-8 text-sm font-bold text-white focus:ring-1 focus:ring-blue-400"
                  >
                    {flatOrgs.map(o => (
                      <option key={o.orgid} value={o.orgid}>
                        {'\u00A0'.repeat(o.depth * 3)}
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-blue-300"
                    aria-hidden
                  />
                </>
              )}
            </div>

            <label
              className="group flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg border border-blue-600 bg-blue-800/80 px-3 py-2 text-xs font-semibold text-blue-50 shadow-sm transition-colors hover:bg-blue-800"
              title="Aggregate data from subordinate units"
            >
              <input
                type="checkbox"
                checked={scope.descendants}
                onChange={e => setDescendants(e.target.checked)}
                className="sr-only"
              />
              <span
                className={clsx(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  scope.descendants ? 'border-green-400 bg-green-500' : 'border-blue-300 bg-blue-900/60',
                )}
              >
                {scope.descendants && <Check className="h-3 w-3 text-white" aria-hidden />}
              </span>
              <span className="whitespace-nowrap">Include Sub-Units</span>
            </label>

            <div className="ml-auto flex items-center gap-2">
              {metaQ.isPending ? null : age === null ? (
                <Badge tone="amber" title="No CAPWATCH extract has been ingested yet">
                  <AlertTriangle className="h-3 w-3" aria-hidden /> No data
                </Badge>
              ) : age.stale ? (
                <Badge tone="red" title={`CAPWATCH extract generated ${age.exact}; expected a daily refresh`}>
                  <AlertTriangle className="h-3 w-3" aria-hidden /> Data {age.text} (stale)
                </Badge>
              ) : (
                <Badge tone="blue" title={`CAPWATCH extract generated ${age.exact}`}>
                  <Clock className="h-3 w-3" aria-hidden /> Data {age.text}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {me.authMode === 'dev' && (
        <div className="mx-auto max-w-[1440px] px-3 pt-3 sm:px-4">
          <Banner kind="warn">
            Development auth mode is active: no Google sign-in, sessions are local test users. Not
            for production use.
          </Banner>
        </div>
      )}

      {versionMismatch && meta && (
        <div className="mx-auto max-w-[1440px] px-3 pt-3 sm:px-4">
          <Banner
            kind="info"
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden /> Reload
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedVersionPrompt(true)}
                  className="rounded px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                >
                  Later
                </button>
              </div>
            }
          >
            A newer version is available (you are on {BUILD_VERSION}, the server is on{' '}
            {meta.appVersion}). Reload to update.
          </Banner>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-4">{children}</main>
    </div>
  )
}
