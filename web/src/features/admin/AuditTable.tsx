import { RefreshCw, ScrollText } from 'lucide-react'
import type { AuditEntry } from '@shared/contracts'
import { Banner, DataTable, EmptyState, Spinner, type Column } from '../../components/ui'
import { useAudit } from './adminApi'

function detailText(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail)
  if (entries.length === 0) return ''
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

const COLUMNS: Column<AuditEntry>[] = [
  {
    key: 'at',
    header: 'When',
    render: r => <span data-testid={`audit-row-${r.id}`}>{new Date(r.at).toLocaleString()}</span>,
    sortValue: r => r.at,
  },
  {
    key: 'actorEmail',
    header: 'Actor',
    render: r => r.actorEmail,
    sortValue: r => r.actorEmail,
  },
  {
    key: 'action',
    header: 'Action',
    render: r => <span className="font-mono text-xs">{r.action}</span>,
    sortValue: r => r.action,
  },
  {
    key: 'detail',
    header: 'Detail',
    render: r => {
      const text = detailText(r.detail)
      return text ? (
        <span className="block max-w-[420px] truncate font-mono text-xs text-ink2" title={text}>
          {text}
        </span>
      ) : (
        ''
      )
    },
  },
]

export default function AuditTable() {
  const auditQ = useAudit()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink2">
          Latest 200 admin actions. Every mutation writes an entry; details carry no member data.
        </p>
        <button
          type="button"
          data-testid="audit-refresh"
          onClick={() => void auditQ.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      {auditQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading audit log..." />
        </div>
      )}
      {auditQ.error && (
        <Banner kind="error">
          Could not load the audit log ({auditQ.error.status || 'network'}): {auditQ.error.message}
        </Banner>
      )}
      {auditQ.data && (
        <DataTable
          columns={COLUMNS}
          rows={auditQ.data.entries}
          rowKey={r => r.id}
          maxHeight="65vh"
          empty={
            <EmptyState
              icon={ScrollText}
              title="No audit entries yet"
              message="Admin actions (ingest, settings changes, session revocations) will appear here."
              diagnostic="GET /api/admin/audit returned 0 entries"
            />
          }
        />
      )}
    </div>
  )
}
