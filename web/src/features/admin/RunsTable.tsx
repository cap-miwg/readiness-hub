import { useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import type { IngestRunSummary } from '@shared/contracts'
import {
  Badge,
  Banner,
  DataTable,
  EmptyState,
  Modal,
  Spinner,
  VerdictMark,
  type Column,
  type Tone,
} from '../../components/ui'
import { IngestResultSummary } from './IngestPanel'
import { useRuns } from './adminApi'

// Tones ride the restyled Badge verdict grammar: succeeded stays quiet ink
// (success is silence), failed carries the scarlet mark, running the watch
// diamond, aborted muted.
const STATUS_TONE: Record<IngestRunSummary['status'], Tone> = {
  succeeded: 'green',
  failed: 'red',
  running: 'amber',
  aborted: 'slate',
}

function totalRows(run: IngestRunSummary): number | null {
  if (!run.fileStats) return null
  return run.fileStats.files.reduce((sum, f) => sum + f.rows, 0)
}

function totalRejects(run: IngestRunSummary): number | null {
  if (!run.fileStats) return null
  return run.fileStats.files.reduce((sum, f) => sum + f.rejects, 0)
}

const COLUMNS: Column<IngestRunSummary>[] = [
  {
    key: 'id',
    header: 'Run',
    numeric: true,
    align: 'left',
    render: r => <span data-testid={`runs-row-${r.id}`}>{r.id}</span>,
    sortValue: r => r.id,
  },
  {
    key: 'startedAt',
    header: 'Started',
    numeric: true,
    align: 'left',
    render: r => new Date(r.startedAt).toLocaleString(),
    sortValue: r => r.startedAt,
  },
  {
    key: 'status',
    header: 'Status',
    render: r => (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
        {r.forced && <Badge tone="slate">forced</Badge>}
      </span>
    ),
    sortValue: r => r.status,
  },
  { key: 'source', header: 'Source', render: r => r.source, sortValue: r => r.source },
  {
    key: 'downloadDate',
    header: 'Extract date',
    numeric: true,
    align: 'left',
    render: r => (r.downloadDate ? r.downloadDate.slice(0, 10) : ''),
    sortValue: r => r.downloadDate,
  },
  {
    key: 'files',
    header: 'Files',
    numeric: true,
    render: r => (r.fileStats ? r.fileStats.files.length : ''),
    sortValue: r => r.fileStats?.files.length ?? null,
  },
  {
    key: 'rows',
    header: 'Rows',
    numeric: true,
    render: r => totalRows(r)?.toLocaleString() ?? '',
    sortValue: r => totalRows(r),
  },
  {
    key: 'rejects',
    header: 'Rejects',
    numeric: true,
    render: r => {
      const n = totalRejects(r)
      if (n === null) return ''
      return n > 0 ? <VerdictMark kind="action" label={n.toLocaleString()} /> : '0'
    },
    sortValue: r => totalRejects(r),
  },
  {
    key: 'error',
    header: 'Error',
    render: r =>
      r.error ? (
        <span className="block max-w-[280px] truncate text-scarlet" title={r.error}>
          {r.error}
        </span>
      ) : (
        ''
      ),
  },
]

/** Below 768px each run renders as a hairline card (the mobile roster contract). */
function RunCard({ run }: { run: IngestRunSummary }) {
  const rejects = totalRejects(run)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-sm font-medium text-ink">
          Run {run.id} · {run.source}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
          {run.forced && <Badge tone="slate">forced</Badge>}
        </span>
      </div>
      <div className="tnum text-xs text-ink2">
        {new Date(run.startedAt).toLocaleString()}
        {run.downloadDate ? ` · extract ${run.downloadDate.slice(0, 10)}` : ''}
      </div>
      <div className="tnum flex items-center gap-3 text-xs text-ink2">
        {run.fileStats && <span>{run.fileStats.files.length} files</span>}
        {totalRows(run) !== null && <span>{totalRows(run)?.toLocaleString()} rows</span>}
        {rejects !== null &&
          (rejects > 0 ? (
            <VerdictMark kind="action" label={`${rejects.toLocaleString()} rejects`} />
          ) : (
            <span>0 rejects</span>
          ))}
      </div>
      {run.error && (
        <div className="truncate text-xs text-scarlet" title={run.error}>
          {run.error}
        </div>
      )}
    </div>
  )
}

export default function RunsTable() {
  const runsQ = useRuns()
  const [selected, setSelected] = useState<IngestRunSummary | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink2">Latest 50 ingest runs, newest first.</p>
        <button
          type="button"
          data-testid="runs-refresh"
          onClick={() => void runsQ.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      {runsQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading ingest runs..." />
        </div>
      )}
      {runsQ.error && (
        <Banner kind="error">
          Could not load ingest runs ({runsQ.error.status || 'network'}): {runsQ.error.message}
        </Banner>
      )}
      {runsQ.data && (
        <DataTable
          columns={COLUMNS}
          rows={runsQ.data.runs}
          rowKey={r => r.id}
          onRowClick={setSelected}
          maxHeight="65vh"
          mobileCard={run => <RunCard run={run} />}
          empty={
            <EmptyState
              icon={History}
              title="No ingest runs yet"
              message="Upload a CAPWATCH zip or trigger an eServices fetch from the Ingest tab."
              diagnostic="GET /api/admin/runs returned 0 runs"
            />
          }
        />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        size="xl"
        title={selected ? `Ingest run ${selected.id} (${selected.source})` : ''}
      >
        {selected && (
          <div className="space-y-3">
            <div className="tnum flex flex-wrap items-center gap-2 text-sm text-ink2">
              <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>
              {selected.forced && <Badge tone="slate">forced</Badge>}
              <span>Started {new Date(selected.startedAt).toLocaleString()}</span>
              {selected.finishedAt && (
                <span>Finished {new Date(selected.finishedAt).toLocaleString()}</span>
              )}
              {selected.downloadDate && (
                <Badge tone="blue">extract {selected.downloadDate.slice(0, 10)}</Badge>
              )}
            </div>
            {selected.status === 'running' ? (
              <Banner kind="info">This run is still in progress. Refresh the table to update.</Banner>
            ) : (
              <IngestResultSummary
                result={{
                  ok: selected.status === 'succeeded',
                  runId: selected.id,
                  anchorOrgid: null,
                  downloadDate: selected.downloadDate,
                  fileStats: selected.fileStats?.files ?? [],
                  skippedEntries: selected.fileStats?.skippedEntries ?? [],
                  error: selected.error,
                }}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
