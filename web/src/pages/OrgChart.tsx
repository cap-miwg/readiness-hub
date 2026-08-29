import { Network } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

export default function OrgChart() {
  return (
    <div>
      <PageHeader
        title="Org Chart"
        subtitle="Duty position chart for the selected unit, with PNG and PDF export"
      />
      <EmptyState
        icon={Network}
        title="Coming in wave 2"
        message="The interactive org chart (command chain, committees, vacancy view, image export) lands here."
        diagnostic="route /orgchart; awaiting /api/orgs/:orgid/orgchart"
      />
    </div>
  )
}
