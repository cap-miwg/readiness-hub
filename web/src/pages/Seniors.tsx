import { Users } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

export default function Seniors() {
  return (
    <div>
      <PageHeader
        title="Senior Dashboard"
        subtitle="Education and training, promotion readiness, duty coverage"
      />
      <EmptyState
        icon={Users}
        title="Coming in wave 2"
        message="The senior member roster with level, track, duty, and promotion filters lands here."
        diagnostic="route /seniors; awaiting /api/orgs/:orgid/seniors"
      />
    </div>
  )
}
