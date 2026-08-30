import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LogOut, Menu, MessageSquare, RefreshCw, Settings, X } from 'lucide-react'
import clsx from 'clsx'
import type { MeResponse } from '@shared/contracts'
import { APP_NAME_FALLBACK, logout, useMeta, useOrgs } from '../api/client'
import FeedbackModal from '../features/feedback/FeedbackModal'
import { orgScopeSearch, useOrgScope } from '../lib/urlState'
import AsOfChip, { dataAgeOf } from './AsOfChip'
import BrandMark from './BrandMark'
import UnitSelector from './UnitSelector'
import { flattenOrgTree } from './charter'
import { Badge, Banner } from './ui'

/*
 * The Quiet Authority shell (V2-DESIGN-PLAN.md section 4): one white 56px
 * row with a bottom hairline. Logo slot + wordmark, six tabs on desktop
 * (D2), right cluster of unit selector, as-of chip, user menu. Below lg the
 * tabs collapse into a hamburger drawer and the unit selector opens as a
 * full-height sheet. Admin is an operator surface: it lives in the user
 * menu and the drawer, not the tab row.
 */

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

function initialsOf(name: string, email: string): string {
  const src = (name.trim() || email).trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? ''
    const last = parts[parts.length - 1]?.[0] ?? ''
    return (first + last).toUpperCase()
  }
  return src.slice(0, 2).toUpperCase()
}

interface UserMenuProps {
  me: MeResponse
  onFeedback: () => void
  onLogout: () => void
  signingOut: boolean
}

function UserMenu({ me, onFeedback, onLogout, signingOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
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

  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-gray20'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-symbol-20 font-display text-xs font-semibold text-symbol"
      >
        {initialsOf(me.name, me.email)}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-hairline bg-paper p-2 shadow-lg">
          <div className="border-b border-hairline px-2 pb-2 pt-1.5">
            <div className="truncate text-sm font-semibold text-ink">{me.name || me.email}</div>
            <div className="truncate text-xs text-ink2">{me.email}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={me.role === 'admin' ? 'blue' : 'slate'}>{me.role}</Badge>
              {me.authMode === 'dev' && <Badge tone="amber">dev auth</Badge>}
            </div>
          </div>
          <div className="mt-1">
            {me.role === 'admin' && (
              <NavLink to="/admin" onClick={() => setOpen(false)} className={itemClass}>
                <Settings className="h-4 w-4 text-ink2" aria-hidden />
                Admin
              </NavLink>
            )}
            <NavLink to="/settings" onClick={() => setOpen(false)} className={itemClass}>
              <Settings className="h-4 w-4 text-ink2" aria-hidden />
              Settings
            </NavLink>
            <button
              type="button"
              data-testid="feedback-open"
              onClick={() => {
                setOpen(false)
                onFeedback()
              }}
              className={itemClass}
            >
              <MessageSquare className="h-4 w-4 text-ink2" aria-hidden />
              Send feedback
            </button>
            <button type="button" onClick={onLogout} disabled={signingOut} className={clsx(itemClass, 'disabled:opacity-50')}>
              <LogOut className="h-4 w-4 text-ink2" aria-hidden />
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
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

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

  // Scope reconciliation once the org tree is known. No orgid in the URL:
  // default to the viewer's home unit when it is in the tree (else fall
  // through to the anchor as before). An orgid that is not in the tree (unit
  // gone after a re-ingest, or a stale shared link): reset to the default so
  // the picker never renders an empty selection and pages never 404 against
  // a dead scope. -1 stays valid whenever the synthetic Unassigned node is in
  // the tree, because flattenOrgTree then includes it. Writes replace the
  // history entry: neither adjustment is a user navigation.
  useEffect(() => {
    if (!orgsQ.data) return
    const known = new Set(flatOrgs.map(o => o.orgid))
    if (scope.orgid === null) {
      if (me.homeOrgid !== undefined && known.has(me.homeOrgid)) {
        setOrgid(me.homeOrgid, { replace: true })
      }
    } else if (!known.has(scope.orgid)) {
      setOrgid(null, { replace: true })
    }
  }, [orgsQ.data, flatOrgs, scope.orgid, me.homeOrgid, setOrgid])

  const selectedOrgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null
  const versionMismatch =
    !dismissedVersionPrompt &&
    meta !== undefined &&
    BUILD_VERSION !== 'dev' &&
    meta.appVersion !== BUILD_VERSION

  const scopeSearch = orgScopeSearch(scope)
  const drawerItems = me.role === 'admin' ? [...NAV_ITEMS, ADMIN_ITEM] : [...NAV_ITEMS]
  const age = dataAgeOf(meta?.downloadDate ?? null, nowMs)

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
    <div className="min-h-screen bg-paper pb-16 font-sans text-ink">
      <header className="sticky top-0 z-50 border-b border-hairline bg-paper">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-3 sm:px-4 lg:gap-4">
          <button
            type="button"
            onClick={() => setNavOpen(v => !v)}
            aria-expanded={navOpen}
            aria-controls="nav-drawer"
            aria-label="Menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink hover:bg-gray20 lg:hidden"
          >
            {navOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>

          <NavLink
            to={{ pathname: '/', search: scopeSearch }}
            className="flex min-w-0 items-center gap-2.5"
            aria-label={`${appName} home`}
          >
            <BrandMark />
            <span className="truncate font-display text-base font-bold text-ink">{appName}</span>
          </NavLink>

          <nav aria-label="Primary" className="hidden self-stretch lg:ml-2 lg:flex">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={{ pathname: item.path, search: scopeSearch }}
                end={item.path === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center whitespace-nowrap px-3 font-display text-[15px]',
                    isActive
                      ? 'font-semibold text-symbol shadow-[inset_0_-2px_0_var(--cap-symbol-blue)]'
                      : 'font-medium text-ink hover:shadow-[inset_0_-2px_0_var(--hairline)]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <UnitSelector
              tree={orgsQ.data?.tree}
              loading={orgsQ.isPending}
              error={orgsQ.error ? orgsQ.error.message : null}
              selectedOrgid={selectedOrgid}
              descendants={scope.descendants}
              onSelect={orgid => setOrgid(orgid)}
              onDescendantsChange={setDescendants}
            />
            <div className="hidden lg:block">
              <AsOfChip meta={meta} pending={metaQ.isPending} nowMs={nowMs} />
            </div>
            <div className="hidden lg:block">
              <UserMenu
                me={me}
                onFeedback={() => setFeedbackOpen(true)}
                onLogout={() => void onLogout()}
                signingOut={signingOut}
              />
            </div>
          </div>
        </div>

        {navOpen && (
          <div id="nav-drawer" className="border-t border-hairline bg-paper px-4 pb-6 lg:hidden">
            <nav aria-label="Primary, mobile" className="flex flex-col">
              {drawerItems.map(item => (
                <NavLink
                  key={item.path}
                  to={{ pathname: item.path, search: scopeSearch }}
                  end={item.path === '/'}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'border-b border-hairline py-3 font-display text-base',
                      isActive ? 'font-semibold text-symbol' : 'font-medium text-ink',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="pt-3 text-sm">
              <div className="truncate font-semibold text-ink">{me.name || me.email}</div>
              <div className="truncate text-xs text-ink2">
                {me.email} ({me.role})
              </div>
              {age !== null && meta?.downloadDate && (
                <div className={clsx('tnum mt-1 text-xs', age.stale ? 'text-scarlet' : 'text-ink2')}>
                  {age.stale && <span className="sr-only">Alert: data may be stale. </span>}
                  Data as of{' '}
                  {new Date(meta.downloadDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-col">
              <NavLink
                to="/settings"
                onClick={() => setNavOpen(false)}
                className="flex items-center gap-2 border-t border-hairline py-3 text-sm font-medium text-ink"
              >
                <Settings className="h-4 w-4 text-ink2" aria-hidden />
                Settings
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setNavOpen(false)
                  setFeedbackOpen(true)
                }}
                className="flex items-center gap-2 border-t border-hairline py-3 text-left text-sm font-medium text-ink"
              >
                <MessageSquare className="h-4 w-4 text-ink2" aria-hidden />
                Send feedback
              </button>
              <button
                type="button"
                onClick={() => void onLogout()}
                disabled={signingOut}
                className="flex items-center gap-2 border-t border-hairline py-3 text-left text-sm font-medium text-ink disabled:opacity-50"
              >
                <LogOut className="h-4 w-4 text-ink2" aria-hidden />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        )}
      </header>

      {me.authMode === 'dev' && (
        <div className="mx-auto max-w-[1024px] px-4 pt-3 sm:px-6">
          <Banner kind="warn">
            Development auth mode is active: no Google sign-in, sessions are local test users. Not
            for production use.
          </Banner>
        </div>
      )}

      {versionMismatch && meta && (
        <div className="mx-auto max-w-[1024px] px-4 pt-3 sm:px-6">
          <Banner
            kind="info"
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-symbol px-2.5 py-1 text-xs font-semibold text-paper hover:opacity-90"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden /> Reload
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedVersionPrompt(true)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-symbol hover:bg-gray20"
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

      <main className="mx-auto w-full max-w-[1024px] px-4 pb-6 pt-8 sm:px-6">{children}</main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
