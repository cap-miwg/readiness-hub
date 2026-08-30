import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type HTMLAttributes,
} from 'react'
import clsx from 'clsx'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Inbox,
  Info,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

/*
 * Quiet Authority UI kit (docs/design/V2-DESIGN-PLAN.md sections 1 and 3;
 * docs/design/mockups/quiet-authority/direction.md). Hairlines over boxes,
 * quiet Rajdhani numerals, and color only as a labeled verdict:
 * scarlet = act now, AF Yellow (bordered diamond) = watch,
 * Symbol Blue = identity / interactive / planned work. Success is silence.
 * Components consume the semantic tokens only; scripts/check-brand.sh bans
 * raw Tailwind hues here.
 */

// ---------------------------------------------------------------------------
// Verdict grammar
// ---------------------------------------------------------------------------

/**
 * v1 tone vocabulary, kept so existing call sites compile; each tone now maps
 * onto the verdict grammar (red = action, amber = watch, blue/indigo =
 * identity, green = quiet neutral because success is silence, slate = muted).
 */
export type Tone = 'blue' | 'indigo' | 'green' | 'amber' | 'red' | 'slate'

export type VerdictKind = 'action' | 'watch' | 'plan' | 'neutral' | 'notRecorded'

/** Screen-reader prefixes: color never appears without words. */
const VERDICT_SR: Record<VerdictKind, string> = {
  action: 'Alert:',
  watch: 'Warning:',
  plan: 'Planned:',
  neutral: '',
  notRecorded: 'Not recorded:',
}

/**
 * The bare mark glyphs. WATCH is the grafted bordered diamond (yellow fill,
 * 1px ink border) so yellow never whispers on white; NOT RECORDED is the
 * dashed neutral circle (a unit that does not log something is never painted
 * red for it). Glyphs are aria-hidden; callers pair them with a visible word.
 */
export function VerdictGlyph({ kind, className }: { kind: VerdictKind; className?: string }) {
  const base = 'inline-block shrink-0'
  switch (kind) {
    case 'action':
      return <span aria-hidden className={clsx(base, 'h-2 w-2 rounded-full bg-scarlet', className)} />
    case 'watch':
      return <span aria-hidden className={clsx(base, 'h-2 w-2 rotate-45 border border-ink bg-afyellow', className)} />
    case 'plan':
      return <span aria-hidden className={clsx(base, 'h-2 w-2 bg-symbol', className)} />
    case 'notRecorded':
      return <span aria-hidden className={clsx(base, 'h-2.5 w-2.5 rounded-full border border-dashed border-muted', className)} />
    case 'neutral':
      return <span aria-hidden className={clsx(base, 'h-2 w-2 rounded-full bg-muted', className)} />
  }
}

export interface VerdictMarkProps {
  kind: VerdictKind
  /** The visible word beside the mark; required so color never stands alone. */
  label: ReactNode
  className?: string
}

/** Mark + word, the only way chromatic verdicts appear in the product. */
export function VerdictMark({ kind, label, className }: VerdictMarkProps) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-ink', className)}>
      <VerdictGlyph kind={kind} />
      {VERDICT_SR[kind] !== '' && <span className="sr-only">{VERDICT_SR[kind]} </span>}
      <span className="min-w-0">{label}</span>
    </span>
  )
}

/** Tone -> verdict restyle for the legacy Badge API. */
const badgeTone: Record<Tone, { wrap: string; glyph: VerdictKind | null; sr: string }> = {
  blue: { wrap: 'bg-symbol-20 text-symbol', glyph: null, sr: '' },
  indigo: { wrap: 'bg-symbol-20 text-symbol', glyph: null, sr: '' },
  green: { wrap: 'border border-hairline text-ink', glyph: null, sr: '' },
  amber: { wrap: 'border border-hairline text-ink', glyph: 'watch', sr: 'Warning: ' },
  red: { wrap: 'border border-hairline text-ink', glyph: 'action', sr: 'Alert: ' },
  slate: { wrap: 'border border-hairline text-ink2', glyph: null, sr: '' },
}

export interface BadgeProps {
  tone?: Tone
  className?: string
  title?: string
  children: ReactNode
}

export function Badge({ tone = 'slate', className, title, children }: BadgeProps) {
  const t = badgeTone[tone]
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em]',
        t.wrap,
        className,
      )}
    >
      {t.glyph !== null && <VerdictGlyph kind={t.glyph} />}
      {t.sr !== '' && <span className="sr-only">{t.sr}</span>}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Figures and sparklines
// ---------------------------------------------------------------------------

export interface FigureProps {
  /** The numeral, pre-formatted by the caller. */
  value: ReactNode
  /** Kicker label naming the number; renders in ink, never silver (D4). */
  label: ReactNode
  labelPosition?: 'above' | 'below'
  /** Optional band word beside the numeral ("Good"). */
  band?: ReactNode
  /** Optional delta caption below the numeral ("+3 / 12 mo"). */
  delta?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const figureSize: Record<NonNullable<FigureProps['size']>, string> = {
  sm: 'text-[34px]',
  md: 'text-[40px]',
  lg: 'text-[54px]',
}

/** The big quiet numeral: Rajdhani, tabular, hierarchy from size not color. */
export function Figure({
  value,
  label,
  labelPosition = 'below',
  band,
  delta,
  size = 'md',
  className,
}: FigureProps) {
  const kicker = <div className="kicker text-ink">{label}</div>
  return (
    <div className={className}>
      {labelPosition === 'above' && <div className="mb-1.5">{kicker}</div>}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <div className={clsx('tnum font-display font-medium leading-none tracking-tight text-ink', figureSize[size])}>
          {value}
        </div>
        {band !== undefined && (
          <div className="font-display text-[15px] font-semibold text-ink">{band}</div>
        )}
      </div>
      {delta !== undefined && <div className="tnum mt-1 text-xs text-ink2">{delta}</div>}
      {labelPosition === 'below' && <div className="mt-1.5">{kicker}</div>}
    </div>
  )
}

export interface SparklineProps {
  data: readonly number[]
  width?: number
  height?: number
  /** Accessible description; omit to mark the graphic decorative. */
  label?: string
  className?: string
}

/**
 * The one data graphic this direction permits: an ink line over a hairline
 * baseline with an endpoint dot. No fills, no color.
 */
export function Sparkline({ data, width = 120, height = 40, label, className }: SparklineProps) {
  const last = data.length > 0 ? data[data.length - 1] : undefined
  if (data.length === 0 || last === undefined) return null
  const pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min
  const x = (i: number) =>
    data.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (data.length - 1)
  const y = (v: number) =>
    span === 0 ? height / 2 : height - pad - ((v - min) * (height - pad * 2)) / span
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label !== undefined ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={className}
    >
      <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="var(--hairline)" strokeWidth={1} />
      {data.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <circle cx={x(data.length - 1)} cy={y(last)} r={2.5} fill="var(--ink)" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Findings (the Needs Attention grammar)
// ---------------------------------------------------------------------------

export type FindingCategory = 'action' | 'watch' | 'plan'

const findingChip: Record<FindingCategory, { word: string; className: string }> = {
  action: { word: 'Action', className: 'text-scarlet' },
  watch: { word: 'Watch', className: 'text-ink' },
  plan: { word: 'Plan', className: 'text-symbol' },
}

export interface FindingRowProps {
  category: FindingCategory
  /** Optional rank index rendered before the chip. */
  index?: number
  /** One sentence: one verdict, one cause. */
  children: ReactNode
  /** Right-aligned action link; the caller supplies its own Link or anchor. */
  action?: ReactNode
}

export function FindingRow({ category, index, children, action }: FindingRowProps) {
  const chip = findingChip[category]
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-3.5 sm:flex-nowrap">
      {index !== undefined && (
        <span className="tnum w-5 shrink-0 text-right text-xs text-muted" aria-hidden>
          {index}
        </span>
      )}
      <span
        className={clsx(
          'inline-flex w-[4.75rem] shrink-0 items-baseline gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em]',
          chip.className,
        )}
      >
        <VerdictGlyph kind={category} />
        <span className="sr-only">{VERDICT_SR[category]} </span>
        {chip.word}
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-ink">{children}</span>
      {action !== undefined && (
        <span className="shrink-0 whitespace-nowrap text-sm sm:ml-auto">{action}</span>
      )}
    </li>
  )
}

export interface FindingsListProps {
  children?: ReactNode
  /** Calm empty state: neutral ink, no color; the absence is the design. */
  empty?: ReactNode
  className?: string
}

export function FindingsList({ children, empty = 'Unit is healthy.', className }: FindingsListProps) {
  if (Children.toArray(children).length === 0) {
    return <p className={clsx('border-t border-hairline py-4 text-[15px] text-ink2', className)}>{empty}</p>
  }
  return <ol className={clsx('list-none border-t border-hairline', className)}>{children}</ol>
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  actions?: ReactNode
  padded?: boolean
}

/** Flat hairline-bordered surface; nothing on the canvas casts a shadow. */
export function Card({ title, actions, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={clsx('rounded-md border border-hairline bg-paper', className)} {...rest}>
      {(title !== undefined || actions !== undefined) && (
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(padded && 'p-4')}>{children}</div>
    </div>
  )
}

export interface StatTileProps {
  label: ReactNode
  value: ReactNode
  icon?: LucideIcon
  /** Accepted for API compatibility; tiles are quiet now, category is never a color. */
  accent?: Tone
  sublabel?: ReactNode
  onClick?: () => void
}

export function StatTile({ label, value, icon: Icon, sublabel, onClick }: StatTileProps) {
  const body = (
    <>
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-hairline text-ink2">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <div className="kicker truncate text-ink">{label}</div>
        <div className="tnum font-display text-[28px] font-medium leading-tight text-ink">{value}</div>
        {sublabel && <div className="truncate text-xs text-ink2">{sublabel}</div>}
      </div>
    </>
  )
  const base = 'flex w-full items-center gap-3 rounded-md border border-hairline bg-paper p-4'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clsx(base, 'text-left transition-colors hover:border-muted')}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)} role="status">
      <span
        aria-hidden
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-symbol border-t-transparent"
      />
      {label ? <span className="text-sm text-ink2">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: ReactNode
  message?: ReactNode
  /**
   * Always give operators something concrete to act on: which query ran,
   * which filter excluded everything, how old the data is. v1's first
   * external deployment failed with a blank dashboard and nothing to
   * diagnose it with (03-Repositories/readiness-hub.md, Lunsford, 2026-02).
   */
  diagnostic?: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, message, diagnostic, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-paper px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray20">
        <Icon className="h-6 w-6 text-ink2" aria-hidden />
      </div>
      <div className="font-display text-[15px] font-semibold text-ink">{title}</div>
      {message && <div className="max-w-md text-sm text-ink2">{message}</div>}
      {diagnostic && (
        <div className="mt-2 max-w-lg rounded-md bg-gray20 px-3 py-2 font-mono text-xs text-ink2">
          {diagnostic}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

const modalSize: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    panel?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" aria-hidden onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[90vh] w-full flex-col rounded-md border border-hairline bg-paper shadow-xl outline-none',
          modalSize[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink2 hover:bg-gray20 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-hairline px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string
  label?: string
  count?: number
}

export interface FilterMenuProps {
  label: string
  options: readonly FilterOption[]
  selected: readonly string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}

export function FilterMenu({ label, options, selected, onChange, searchable }: FilterMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const showSearch = searchable ?? options.length > 8

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => (o.label ?? o.value).toLowerCase().includes(q))
  }, [options, query])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selected.filter(v => v !== value))
    else onChange([...selected, value])
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
          selected.length > 0
            ? 'border-symbol text-symbol'
            : 'border-hairline bg-paper text-ink hover:border-muted',
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="tnum rounded bg-symbol px-1.5 text-xs font-semibold text-paper">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-md border border-hairline bg-paper p-2 shadow-lg">
          {showSearch && (
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-md border border-hairline py-1.5 pl-7 pr-2 text-sm focus:border-symbol focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-ink2">No matches</div>
            )}
            {visible.map(opt => {
              const checked = selectedSet.has(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray20"
                >
                  <span
                    className={clsx(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-symbol bg-symbol' : 'border-muted bg-paper',
                    )}
                  >
                    {checked && <Check className="h-3 w-3 text-paper" aria-hidden />}
                  </span>
                  <span className="flex-1 truncate text-ink">{opt.label ?? opt.value}</span>
                  {opt.count !== undefined && (
                    <span className="tnum text-xs text-muted">{opt.count}</span>
                  )}
                </button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <div className="mt-1 border-t border-hairline pt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-xs font-semibold text-symbol hover:bg-gray20"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** Present = sortable. null sorts last in either direction. */
  sortValue?: (row: T) => string | number | Date | null
  align?: 'left' | 'right' | 'center'
  /** Numeric column: tabular numerals, right-aligned unless align says otherwise. */
  numeric?: boolean
  headerClassName?: string
  cellClassName?: string
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  initialSort?: SortState
  /** Scroll container height; the header stays stuck within it. */
  maxHeight?: string
  empty?: ReactNode
  /**
   * Mobile card renderer (the below-768px roster contract): when provided,
   * the table renders only from md up and each row renders as a hairline
   * card below it. Rows keep onRowClick tap-through.
   */
  mobileCard?: (row: T) => ReactNode
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  maxHeight,
  empty,
  mobileCard,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find(c => c.key === sort.key)
    const sv = col?.sortValue
    if (!sv) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = sv(a)
      const vb = sv(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [rows, sort, columns])

  const onHeaderClick = (col: Column<T>) => {
    if (!col.sortValue) return
    setSort(prev =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' },
    )
  }

  if (rows.length === 0 && empty !== undefined) return <>{empty}</>

  const colAlign = (col: Column<T>) => alignClass[col.align ?? (col.numeric ? 'right' : 'left')]

  const table = (
    <div
      className={clsx('overflow-auto rounded-md border border-hairline', mobileCard && 'hidden md:block')}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse bg-paper text-sm">
        <thead className="sticky top-0 z-10 bg-paper">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                }
                className={clsx(
                  'kicker border-b border-hairline px-3 py-2 text-ink2',
                  colAlign(col),
                  col.headerClassName,
                )}
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => onHeaderClick(col)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted" aria-hidden />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                'border-b border-hairline last:border-b-0',
                onRowClick && 'cursor-pointer hover:bg-gray20',
              )}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={clsx(
                    'px-3 py-2 text-ink',
                    col.numeric && 'tnum',
                    colAlign(col),
                    col.cellClassName,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (!mobileCard) return table

  return (
    <>
      {table}
      <div className="space-y-2 md:hidden">
        {sorted.map(row =>
          onRowClick ? (
            <button
              key={rowKey(row)}
              type="button"
              onClick={() => onRowClick(row)}
              className="block w-full rounded-md border border-hairline bg-paper p-3 text-left hover:border-muted"
            >
              {mobileCard(row)}
            </button>
          ) : (
            <div key={rowKey(row)} className="rounded-md border border-hairline bg-paper p-3">
              {mobileCard(row)}
            </div>
          ),
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Tabs, banners, progress, page header
// ---------------------------------------------------------------------------

export interface TabDef {
  id: string
  label: ReactNode
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabDef[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto border-b border-hairline">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'whitespace-nowrap px-3 py-2 font-display text-sm transition-colors',
            tab.id === active
              ? 'font-semibold text-symbol shadow-[inset_0_-2px_0_var(--cap-symbol-blue)]'
              : 'font-medium text-ink hover:shadow-[inset_0_-2px_0_var(--hairline)]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export type BannerKind = 'info' | 'warn' | 'error'

const bannerStyle: Record<BannerKind, { wrap: string; glyph: ReactNode; sr: string }> = {
  info: {
    wrap: 'border-hairline bg-paper',
    glyph: <Info className="h-4 w-4 shrink-0 text-symbol" aria-hidden />,
    sr: '',
  },
  warn: {
    wrap: 'border-hairline bg-afyellow-20',
    glyph: <VerdictGlyph kind="watch" />,
    sr: 'Warning: ',
  },
  error: {
    wrap: 'border-scarlet bg-paper',
    glyph: <XCircle className="h-4 w-4 shrink-0 text-scarlet" aria-hidden />,
    sr: 'Alert: ',
  },
}

export function Banner({
  kind,
  children,
  action,
  className,
}: {
  kind: BannerKind
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const s = bannerStyle[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={clsx('flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-ink', s.wrap, className)}
    >
      {s.glyph}
      {s.sr !== '' && <span className="sr-only">{s.sr}</span>}
      <div className="flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number
  max?: number
  /** Accepted for API compatibility; the fill is always Symbol Blue on gray. */
  accent?: Tone
  label?: ReactNode
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-ink2">
          <span>{label}</span>
          <span className="tnum font-semibold">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-gray20"
      >
        <div className="h-full rounded-full bg-symbol" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
