import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { ApiError, setUnauthorizedHandler, useMe } from './api/client'
import Layout from './components/Layout'
import SettingsStub from './components/SettingsStub'
import { Banner, EmptyState, Spinner } from './components/ui'
import Admin from './pages/Admin'
import Cadets from './pages/Cadets'
import Home from './pages/Home'
import Login from './pages/Login'
import OrgChart from './pages/OrgChart'
import Reports from './pages/Reports'
import Seniors from './pages/Seniors'
import UnitOverview from './pages/UnitOverview'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [400, 401, 403, 404, 422, 501].includes(error.status)) {
          return false
        }
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

/** Any API 401 outside the auth gate sends the user back to /login. */
function UnauthorizedRedirector() {
  const navigate = useNavigate()
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (window.location.pathname !== '/login') {
        queryClient.clear()
        navigate('/login', { replace: true })
      }
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate])
  return null
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  )
}

function RequireAuth() {
  const meQ = useMe()
  const location = useLocation()

  if (meQ.isPending) {
    return (
      <FullScreen>
        <Spinner label="Checking session..." />
      </FullScreen>
    )
  }

  if (meQ.error) {
    if (meQ.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location }} />
    }
    return (
      <FullScreen>
        <div className="space-y-3">
          <Banner kind="error">
            Could not load your session from /api/me ({meQ.error.status || 'network'}):{' '}
            {meQ.error.message}
          </Banner>
          <button
            type="button"
            onClick={() => void meQ.refetch()}
            className="rounded-md border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-muted"
          >
            Try again
          </button>
        </div>
      </FullScreen>
    )
  }

  if (!meQ.data) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <Layout me={meQ.data}>
      <Outlet />
    </Layout>
  )
}

function NotFound() {
  const location = useLocation()
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      message="That address does not match any Readiness Hub page."
      diagnostic={`no route for ${location.pathname}`}
    />
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UnauthorizedRedirector />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Home />} />
            <Route path="/unit" element={<UnitOverview />} />
            <Route path="/seniors" element={<Seniors />} />
            <Route path="/cadets" element={<Cadets />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/orgchart" element={<OrgChart />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings" element={<SettingsStub />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
