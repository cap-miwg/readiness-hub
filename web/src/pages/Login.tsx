import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogIn, ShieldCheck, User } from 'lucide-react'
import {
  APP_NAME_FALLBACK,
  devLogin,
  fetchDevUsers,
  queryKeys,
  useMe,
  type DevUser,
} from '../api/client'
import { Badge, Banner, Card, Spinner } from '../components/ui'

/**
 * Maps the ?error= code the auth callback redirects with to a readable
 * message. Unknown codes render as text (React-escaped), truncated.
 */
function loginErrorMessage(code: string): string {
  switch (code) {
    case 'domain':
    case 'domain_not_allowed':
    case 'hd_mismatch':
    case 'consumer_account':
    case 'no_hd':
      return 'That Google account is not in an allowed domain. Sign in with your CAP Google Workspace account, not a personal Gmail account.'
    case 'oauth':
    case 'oauth_failed':
    case 'callback':
      return 'Google sign-in did not complete. Try again.'
    case 'session':
    case 'expired':
      return 'Your session expired. Sign in again.'
    default:
      return `Sign-in failed: ${code.slice(0, 120)}`
  }
}

type Probe =
  | { state: 'loading' }
  | { state: 'google' }
  | { state: 'dev'; users: DevUser[] }
  | { state: 'unreachable' }

export default function Login() {
  const meQ = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const errorParam = params.get('error')

  const [probe, setProbe] = useState<Probe>({ state: 'loading' })
  const [probeAttempt, setProbeAttempt] = useState(0)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [devError, setDevError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProbe({ state: 'loading' })
    fetchDevUsers()
      .then(users => {
        if (cancelled) return
        setProbe(users === null ? { state: 'google' } : { state: 'dev', users })
      })
      .catch(() => {
        if (!cancelled) setProbe({ state: 'unreachable' })
      })
    return () => {
      cancelled = true
    }
  }, [probeAttempt])

  if (meQ.data) return <Navigate to="/" replace />

  const onDevLogin = async (email: string) => {
    setPendingEmail(email)
    setDevError(null)
    try {
      await devLogin(email)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      navigate('/', { replace: true })
    } catch (err) {
      setDevError(err instanceof Error ? err.message : 'Sign-in failed')
      setPendingEmail(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-700 to-indigo-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold">{APP_NAME_FALLBACK}</h1>
          <p className="mt-1 text-sm text-blue-200">
            Readiness, training, and staffing in one place
          </p>
        </div>

        <Card className="shadow-xl">
          {errorParam && <Banner kind="error" className="mb-4">{loginErrorMessage(errorParam)}</Banner>}

          {(probe.state === 'loading' || meQ.isPending) && (
            <div className="flex justify-center py-8">
              <Spinner label="Checking sign-in options..." />
            </div>
          )}

          {probe.state === 'unreachable' && !meQ.isPending && (
            <div className="space-y-3">
              <Banner kind="error">
                Could not reach the server to determine sign-in options. Check that the app service
                is running, then try again.
              </Banner>
              <button
                type="button"
                onClick={() => setProbeAttempt(n => n + 1)}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Try again
              </button>
            </div>
          )}

          {probe.state === 'google' && !meQ.isPending && (
            <div className="space-y-4 py-2 text-center">
              <a
                href="/auth/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <LogIn className="h-5 w-5" aria-hidden />
                Continue with Google
              </a>
              <p className="text-xs text-slate-500">
                Access is limited to this deployment's allowed Google Workspace domains (for
                example, your wing's cap.gov domain). Personal Gmail accounts cannot sign in. If
                you have multiple Google accounts, pick your CAP account in the Google chooser.
              </p>
            </div>
          )}

          {probe.state === 'dev' && !meQ.isPending && (
            <div className="space-y-3">
              <Banner kind="warn">Development auth mode: pick a test user.</Banner>
              {devError && <Banner kind="error">{devError}</Banner>}
              {probe.users.length === 0 ? (
                <Banner kind="error">
                  The server is in dev auth mode but /auth/dev/users returned no users. Check
                  DEV_USERS configuration.
                </Banner>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {probe.users.map(u => (
                    <li key={u.email}>
                      <button
                        type="button"
                        disabled={pendingEmail !== null}
                        onClick={() => void onDevLogin(u.email)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50/60 disabled:opacity-50"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                          <User className="h-4 w-4 text-slate-500" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {u.name || u.email}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{u.email}</span>
                        </span>
                        {u.role && <Badge tone={u.role === 'admin' ? 'amber' : 'blue'}>{u.role}</Badge>}
                        {pendingEmail === u.email && <Spinner />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
