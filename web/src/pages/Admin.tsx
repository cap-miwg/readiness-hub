import { Settings, ShieldAlert } from 'lucide-react'
import { useMe } from '../api/client'
import { Banner, EmptyState, PageHeader } from '../components/ui'

export default function Admin() {
  const meQ = useMe()
  const isAdmin = meQ.data?.role === 'admin'

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Ingest, run history, settings, and audit log"
      />
      {meQ.data && !isAdmin ? (
        <Banner kind="error">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            This page requires the admin role. You are signed in as a viewer; ask a deployment
            admin to add your email to ADMIN_EMAILS.
          </span>
        </Banner>
      ) : (
        <EmptyState
          icon={Settings}
          title="Coming in wave 2"
          message="ZIP upload, eServices fetch trigger, ingest run history, app settings, and the audit log land here."
          diagnostic="route /admin; awaiting /api/admin/*"
        />
      )}
    </div>
  )
}
