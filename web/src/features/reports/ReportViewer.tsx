import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileDown, FileX, RefreshCw, X } from 'lucide-react'
import type { ReportMeta, ReportResult } from '@shared/reportContracts'
import { ApiError, apiFetch } from '../../api/client'
import { Badge, Banner, Card, DataTable, EmptyState, Spinner, type Column } from '../../components/ui'
import { exportReportCsv } from './exportCsv'
import { exportReportPdf } from './exportPdf'
import { formatCell, formatTagLabel, reportAccent, reportIcon } from './format'

interface IndexedRow {
  i: number
  cells: Record<string, unknown>
}

function reportPath(id: string, orgid: number | null, descendants: boolean): string {
  const params = new URLSearchParams()
  if (orgid !== null) params.set('orgid', String(orgid))
  if (descendants) params.set('descendants', '1')
  const qs = params.toString()
  return `/api/reports/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
}

function useReportResult(id: string, orgid: number | null, descendants: boolean) {
  return useQuery<ReportResult, ApiError>({
    queryKey: ['report', id, orgid, descendants],
    queryFn: () => apiFetch<ReportResult>(reportPath(id, orgid, descendants)),
    staleTime: 60_000,
  })
}

function metaChips(meta: Record<string, unknown> | undefined): [string, string][] {
  if (!meta) return []
  const out: [string, string][] = []
  for (const [key, value] of Object.entries(meta)) {
    if (value === null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out.push([key, formatCell(value)])
    }
  }
  return out
}

export interface ReportViewerProps {
  report: ReportMeta
  orgid: number | null
  descendants: boolean
  onClose: () => void
}

export default function ReportViewer({ report, orgid, descendants, onClose }: ReportViewerProps) {
  const resultQ = useReportResult(report.id, orgid, descendants)
  const result = resultQ.data

  const columns = useMemo<Column<IndexedRow>[]>(() => {
    if (!result) return []
    return result.columns.map((col, colIndex) => ({
      key: col.key,
      header: col.header,
      render: (row: IndexedRow) =>
        colIndex === 0 ? (
          <span data-testid={`report-row-${row.i}`}>{formatCell(row.cells[col.key])}</span>
        ) : (
          formatCell(row.cells[col.key])
        ),
      sortValue: (row: IndexedRow) => {
        const v = row.cells[col.key]
        if (v === null || v === undefined) return null
        if (typeof v === 'number') return v
        return formatCell(v)
      },
    }))
  }, [result])

  const rows = useMemo<IndexedRow[]>(
    () => (result ? result.rows.map((cells, i) => ({ i, cells })) : []),
    [result],
  )

  const Icon = reportIcon(report.icon)
  const accent = reportAccent(report.accent)
  const chips = metaChips(result?.meta)

  return (
    <Card
      data-testid="report-viewer"
      title={
        <span className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent.iconBox}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {report.title}
        </span>
      }
      actions={
        <>
          {result && (
            <>
              <Badge tone="slate" title={`Generated ${new Date(result.generatedAt).toLocaleString()}`}>
                {result.rows.length} rows
              </Badge>
              <button
                type="button"
                data-testid="report-export-csv"
                onClick={() => exportReportCsv(report, result)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" aria-hidden /> CSV
              </button>
              <button
                type="button"
                data-testid="report-export-pdf"
                onClick={() => void exportReportPdf(report, result)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <FileDown className="h-4 w-4" aria-hidden /> PDF
              </button>
            </>
          )}
          <button
            type="button"
            data-testid="report-viewer-close"
            onClick={onClose}
            aria-label="Close report"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </>
      }
    >
      {resultQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label={`Generating ${report.title}...`} />
        </div>
      )}

      {resultQ.error && (
        <Banner
          kind="error"
          action={
            <button
              type="button"
              onClick={() => void resultQ.refetch()}
              className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Retry
            </button>
          }
        >
          Could not generate this report ({resultQ.error.status || 'network'}):{' '}
          {resultQ.error.message}
        </Banner>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{result.scope.orgName}</span>
            {result.scope.descendants && <Badge tone="indigo">including sub-units</Badge>}
            <span className="text-slate-400">|</span>
            <span>{result.scope.memberCount} members in scope</span>
            <span className="text-slate-400">|</span>
            <span>Generated {new Date(result.generatedAt).toLocaleString()}</span>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map(([key, value]) => (
                <Badge key={key} tone="slate" title={key}>
                  {key}: {value}
                </Badge>
              ))}
            </div>
          )}

          <DataTable<IndexedRow>
            columns={columns}
            rows={rows}
            rowKey={row => row.i}
            maxHeight="65vh"
            empty={
              <EmptyState
                icon={FileX}
                title="No rows in this report"
                message="The report generated successfully but produced no rows for the current scope."
                diagnostic={`report=${report.id} orgid=${result.scope.orgid} descendants=${result.scope.descendants ? '1' : '0'} members=${result.scope.memberCount} generatedAt=${result.generatedAt}`}
              />
            }
          />
        </div>
      )}
    </Card>
  )
}
