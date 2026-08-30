import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Filter, RefreshCw, Search } from 'lucide-react'
import clsx from 'clsx'
import type { ReportMeta, ReportsListResponse } from '@shared/reportContracts'
import { ApiError, apiFetch, useOrgs } from '../api/client'
import { useListParam, useOrgScope, useStringParam } from '../lib/urlState'
import { Banner, EmptyState, PageHeader, Spinner } from '../components/ui'
import ReportViewer from '../features/reports/ReportViewer'
import { formatTagLabel, reportIcon } from '../features/reports/format'

/*
 * Reports (V2-DESIGN-PLAN.md section 6): a searchable hairline list, not a
 * card grid. Whole-row tap targets, monochrome ink icons (accent colors
 * ignored: category is never a color), one search input plus the tag pill
 * row (AND semantics, v1 parity), and the selected report's viewer below.
 */

const QUIET_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted'

function useReportsList() {
  return useQuery<ReportsListResponse, ApiError>({
    queryKey: ['reports'],
    queryFn: () => apiFetch<ReportsListResponse>('/api/reports'),
    staleTime: 5 * 60_000,
  })
}

/** Case-insensitive match over title, description, and tag labels. */
export function matchesQuery(report: ReportMeta, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return (
    report.title.toLowerCase().includes(q) ||
    report.description.toLowerCase().includes(q) ||
    report.tags.some(t => t.toLowerCase().includes(q))
  )
}

function ReportRow({
  report,
  selected,
  onOpen,
}: {
  report: ReportMeta
  selected: boolean
  onOpen: () => void
}) {
  const Icon = reportIcon(report.icon)
  return (
    <li data-testid={`report-card-${report.id}`} className="border-b border-hairline">
      <button
        type="button"
        data-testid={`report-generate-${report.id}`}
        onClick={onOpen}
        aria-current={selected || undefined}
        className={clsx(
          'flex w-full items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-gray20',
          selected && 'shadow-[inset_2px_0_0_var(--cap-symbol-blue)]',
        )}
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              'block text-[15px] font-medium',
              selected ? 'text-symbol' : 'text-ink',
            )}
          >
            {report.title}
            {selected && <span className="sr-only"> (currently open)</span>}
          </span>
          <span className="mt-0.5 block text-sm text-ink2">{report.description}</span>
        </span>
        <span className="kicker mt-1 hidden shrink-0 text-right text-muted sm:block">
          {report.tags.map(formatTagLabel).join(' · ')}
        </span>
      </button>
    </li>
  )
}

export default function Reports() {
  const listQ = useReportsList()
  const orgsQ = useOrgs()
  const { scope } = useOrgScope()
  const [tagFilter, setTagFilter] = useListParam('tags')
  const [query, setQuery] = useStringParam('q')
  const [selectedId, setSelectedId] = useStringParam('report')
  const [catalogCollapsed, setCatalogCollapsed] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)

  const orgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null
  const reports = listQ.data?.reports ?? []

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const r of reports) for (const t of r.tags) tags.add(t)
    return [...tags].sort()
  }, [reports])

  // Tag filter is AND semantics: a report must carry every selected tag
  // (v1 Index.html:4467-4471). The search input narrows further.
  const filtered = useMemo(() => {
    let out = reports
    if (tagFilter.length > 0) out = out.filter(r => tagFilter.every(t => r.tags.includes(t)))
    if (query !== null) out = out.filter(r => matchesQuery(r, query))
    return out
  }, [reports, tagFilter, query])

  const selected = selectedId !== null ? reports.find(r => r.id === selectedId) ?? null : null

  // The viewer renders below the list; bring it into view on selection so a
  // row tap lands on the result, not on more catalog.
  useEffect(() => {
    if (selectedId !== null) {
      viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedId])

  const toggleTag = (tag: string) => {
    if (tagFilter.includes(tag)) setTagFilter(tagFilter.filter(t => t !== tag))
    else setTagFilter([...tagFilter, tag])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Every export prints the extract date it was generated from"
      />

      {selectedId !== null && listQ.data && selected === null && (
        <Banner kind="warn">
          Unknown report id in the URL: {selectedId}. Pick a report from the catalog below.
        </Banner>
      )}

      <section aria-label="Report catalog">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <input
              type="search"
              value={query ?? ''}
              data-testid="report-search"
              onChange={e => setQuery(e.target.value === '' ? null : e.target.value)}
              placeholder="Search reports..."
              aria-label="Search reports"
              className="w-full rounded-md border border-hairline bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-symbol focus:outline-none"
            />
          </div>
          <button
            type="button"
            data-testid="report-tags-clear"
            onClick={() => setTagFilter([])}
            disabled={tagFilter.length === 0}
            className={clsx(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              tagFilter.length === 0
                ? 'cursor-not-allowed border-hairline text-muted'
                : 'border-hairline text-ink hover:border-muted',
            )}
          >
            Clear tags
          </button>
          <button
            type="button"
            data-testid="report-catalog-toggle"
            onClick={() => setCatalogCollapsed(v => !v)}
            className={QUIET_BUTTON}
          >
            {catalogCollapsed ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden />
            )}
            {catalogCollapsed ? 'Show catalog' : 'Collapse catalog'}
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {allTags.map(tag => {
              const active = tagFilter.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  data-testid={`report-tag-${tag.replace(/[^a-z0-9]+/g, '-')}`}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={clsx(
                    'rounded-full border px-3 py-1 font-display text-xs font-semibold transition-colors',
                    active
                      ? 'border-symbol bg-symbol-20 text-symbol'
                      : 'border-hairline text-ink hover:border-muted',
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
                  className={QUIET_BUTTON}
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
              <ol className="mt-4 list-none border-t border-hairline">
                {filtered.map(report => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    selected={report.id === selectedId}
                    onOpen={() => setSelectedId(report.id)}
                  />
                ))}
              </ol>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={Filter}
                  title="No reports match"
                  message="Clear the search or adjust the tags to see more of the catalog."
                  diagnostic={`q=${query ?? ''} tags=${tagFilter.join(',')} matched 0 of ${reports.length} reports`}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setTagFilter([])
                        setQuery(null)
                      }}
                      className={QUIET_BUTTON}
                    >
                      Clear search and tags
                    </button>
                  }
                />
              </div>
            )}
          </>
        )}
      </section>

      {selected && (
        <div ref={viewerRef} className="scroll-mt-16">
          <ReportViewer
            report={selected}
            orgid={orgid}
            descendants={scope.descendants}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}
