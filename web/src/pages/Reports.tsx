import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronDown, ChevronUp, FileText, Filter, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import type { ReportMeta, ReportsListResponse } from '@shared/reportContracts'
import { ApiError, apiFetch, useOrgs } from '../api/client'
import { useListParam, useOrgScope, useStringParam } from '../lib/urlState'
import { Banner, EmptyState, PageHeader, Spinner } from '../components/ui'
import ReportViewer from '../features/reports/ReportViewer'
import { formatTagLabel, reportAccent, reportIcon } from '../features/reports/format'

function useReportsList() {
  return useQuery<ReportsListResponse, ApiError>({
    queryKey: ['reports'],
    queryFn: () => apiFetch<ReportsListResponse>('/api/reports'),
    staleTime: 5 * 60_000,
  })
}

function ReportCard({
  report,
  selected,
  onOpen,
}: {
  report: ReportMeta
  selected: boolean
  onOpen: () => void
}) {
  const Icon = reportIcon(report.icon)
  const accent = reportAccent(report.accent)
  return (
    <div
      data-testid={`report-card-${report.id}`}
      className={clsx(
        'flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        selected ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', accent.iconBox)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900">{report.title}</h3>
          <p className="mt-1 text-xs text-slate-600">{report.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.tags.map(tag => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
              >
                {formatTagLabel(tag)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        data-testid={`report-generate-${report.id}`}
        onClick={onOpen}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        <BarChart3 className="h-4 w-4" aria-hidden />
        {selected ? 'Viewing' : 'Generate'}
      </button>
    </div>
  )
}

export default function Reports() {
  const listQ = useReportsList()
  const orgsQ = useOrgs()
  const { scope } = useOrgScope()
  const [tagFilter, setTagFilter] = useListParam('tags')
  const [selectedId, setSelectedId] = useStringParam('report')
  const [catalogCollapsed, setCatalogCollapsed] = useState(false)

  const orgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null
  const reports = listQ.data?.reports ?? []

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const r of reports) for (const t of r.tags) tags.add(t)
    return [...tags].sort()
  }, [reports])

  // Tag filter is AND semantics: a report must carry every selected tag
  // (v1 Index.html:4467-4471).
  const filtered = useMemo(() => {
    if (tagFilter.length === 0) return reports
    return reports.filter(r => tagFilter.every(t => r.tags.includes(t)))
  }, [reports, tagFilter])

  const selected = selectedId !== null ? reports.find(r => r.id === selectedId) ?? null : null

  const toggleTag = (tag: string) => {
    if (tagFilter.includes(tag)) setTagFilter(tagFilter.filter(t => t !== tag))
    else setTagFilter([...tagFilter, tag])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Generate insights and identify action items for unit improvement"
      />

      {selectedId !== null && listQ.data && selected === null && (
        <Banner kind="warn">
          Unknown report id in the URL: {selectedId}. Pick a report from the catalog below.
        </Banner>
      )}

      {selected && (
        <ReportViewer
          report={selected}
          orgid={orgid}
          descendants={scope.descendants}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="font-bold text-slate-900">Report Catalog</h2>
            {tagFilter.length > 0 && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {tagFilter.length} tag{tagFilter.length > 1 ? 's' : ''} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="report-tags-clear"
              onClick={() => setTagFilter([])}
              disabled={tagFilter.length === 0}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                tagFilter.length === 0
                  ? 'cursor-not-allowed border-slate-200 text-slate-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50',
              )}
            >
              Clear tags
            </button>
            <button
              type="button"
              data-testid="report-catalog-toggle"
              onClick={() => setCatalogCollapsed(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {catalogCollapsed ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronUp className="h-4 w-4" aria-hidden />
              )}
              {catalogCollapsed ? 'Show catalog' : 'Collapse catalog'}
            </button>
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {allTags.map(tag => {
              const active = tagFilter.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  data-testid={`report-tag-${tag.replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={() => toggleTag(tag)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
                  )}
                >
                  {formatTagLabel(tag)}
                </button>
              )
            })}
          </div>
        )}

        {listQ.isPending && (
          <div className="flex justify-center py-10">
            <Spinner label="Loading report catalog..." />
          </div>
        )}

        {listQ.error && (
          <div className="mt-4">
            <Banner
              kind="error"
              action={
                <button
                  type="button"
                  onClick={() => void listQ.refetch()}
                  className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden /> Retry
                </button>
              }
            >
              Could not load the report catalog from /api/reports (
              {listQ.error.status || 'network'}): {listQ.error.message}
            </Banner>
          </div>
        )}

        {!catalogCollapsed && listQ.data && (
          <>
            {filtered.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    selected={report.id === selectedId}
                    onOpen={() => setSelectedId(report.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={Filter}
                  title="No reports match the selected tags"
                  message="Clear or adjust tags to see more of the catalog."
                  diagnostic={`tags=${tagFilter.join(',')} matched 0 of ${reports.length} reports`}
                  action={
                    <button
                      type="button"
                      onClick={() => setTagFilter([])}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear tags
                    </button>
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
