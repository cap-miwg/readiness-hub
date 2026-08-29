import { FileText } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

export default function Reports() {
  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generated readiness reports with PDF export"
      />
      <EmptyState
        icon={FileText}
        title="Coming in wave 2"
        message="The report catalog (tag-filterable) and the report viewer with PDF export land here."
        diagnostic="route /reports; awaiting /api/reports"
      />
    </div>
  )
}
