import { Building2 } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

export default function UnitOverview() {
  return (
    <div>
      <PageHeader
        title="Unit Overview"
        subtitle="Readiness, staffing, recruiting and retention for the selected unit"
      />
      <EmptyState
        icon={Building2}
        title="Coming in wave 2"
        message="The Unit Overview dashboard (strength, ES readiness, recruiting and retention, Workspace adoption) lands here."
        diagnostic="route /unit; awaiting /api/orgs/:orgid/overview"
      />
    </div>
  )
}
