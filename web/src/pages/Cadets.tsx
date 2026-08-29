import { GraduationCap } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

export default function Cadets() {
  return (
    <div>
      <PageHeader
        title="Cadet Dashboard"
        subtitle="Milestones, promotion eligibility, HFZ, leadership billets"
      />
      <EmptyState
        icon={GraduationCap}
        title="Coming in wave 2"
        message="The cadet roster with phase, achievement, and eligibility filters lands here."
        diagnostic="route /cadets; awaiting /api/orgs/:orgid/cadets"
      />
    </div>
  )
}
