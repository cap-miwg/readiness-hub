import { ShieldAlert } from 'lucide-react'
import { useMe } from '../api/client'
import { Banner, PageHeader, Spinner, Tabs } from '../components/ui'
import AuditTable from '../features/admin/AuditTable'
import IngestPanel from '../features/admin/IngestPanel'
import RunsTable from '../features/admin/RunsTable'
import SecurityPanel from '../features/admin/SecurityPanel'
import SettingsPanel from '../features/admin/SettingsPanel'
import { useStringParam } from '../lib/urlState'

const TABS = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'runs', label: 'Runs' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit' },
  { id: 'security', label: 'Security' },
] as const

type TabId = (typeof TABS)[number]['id']

function isTabId(v: string | null): v is TabId {
  return v !== null && TABS.some(t => t.id === v)
}

export default function Admin() {
  const meQ = useMe()
  const [tabParam, setTabParam] = useStringParam('tab')
  const tab: TabId = isTabId(tabParam) ? tabParam : 'ingest'

  if (meQ.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Checking permissions..." />
      </div>
    )
  }

  // The shell hides the Admin nav item for viewers and every /api/admin route
  // is guarded server-side; this gate is the belt to those braces.
  if (!meQ.data || meQ.data.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Admin" subtitle="Ingest, run history, settings, and audit log" />
        <div data-testid="admin-denied">
          <Banner kind="error">
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              This page requires the admin role. You are signed in as{' '}
              {meQ.data ? `${meQ.data.email} (${meQ.data.role})` : 'an unknown user'}; ask a
              deployment admin to add your email to ADMIN_EMAILS.
            </span>
          </Banner>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin"
        subtitle="Ingest, run history, settings, audit log, and session control"
        actions={
          <Tabs
            tabs={TABS.map(t => ({
              id: t.id,
              label: <span data-testid={`admin-tab-${t.id}`}>{t.label}</span>,
            }))}
            active={tab}
            onChange={id => setTabParam(id === 'ingest' ? null : id)}
          />
        }
      />

      {tab === 'ingest' && <IngestPanel devAuth={meQ.data.authMode === 'dev'} />}
      {tab === 'runs' && <RunsTable />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'audit' && <AuditTable />}
      {tab === 'security' && <SecurityPanel />}
    </div>
  )
}
