import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type HTMLAttributes,
} from 'react'
import clsx from 'clsx'
import {
  AlertTriangle,
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

export type Tone = 'blue' | 'indigo' | 'green' | 'amber' | 'red' | 'slate'

// Full literal class strings per tone: Tailwind's scanner cannot see
// dynamically assembled class names.
const badgeTone: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  slate: 'bg-slate-100 text-slate-700',
}

const tileAccent: Record<Tone, { icon: string; ring: string }> = {
  blue: { icon: 'bg-blue-100 text-blue-700', ring: 'hover:border-blue-300' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700', ring: 'hover:border-indigo-300' },
  green: { icon: 'bg-green-100 text-green-700', ring: 'hover:border-green-300' },
  amber: { icon: 'bg-amber-100 text-amber-700', ring: 'hover:border-amber-300' },
  red: { icon: 'bg-red-100 text-red-700', ring: 'hover:border-red-300' },
  slate: { icon: 'bg-slate-100 text-slate-700', ring: 'hover:border-slate-300' },
}

const progressAccent: Record<Tone, string> = {
  blue: 'bg-blue-600',
  indigo: 'bg-indigo-600',
  green: 'bg-green-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  slate: 'bg-slate-500',
}

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  actions?: ReactNode
  padded?: boolean
}

export function Card({ title, actions, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}
      {...rest}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
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
  accent?: Tone
  sublabel?: ReactNode
  onClick?: () => void
}

export function StatTile({ label, value, icon: Icon, accent = 'blue', sublabel, onClick }: StatTileProps) {
  const a = tileAccent[accent]
  const body = (
    <>
      {Icon && (
        <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', a.icon)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-2xl font-bold leading-tight text-slate-900">{value}</div>
        {sublabel && <div className="truncate text-xs text-slate-500">{sublabel}</div>}
      </div>
    </>
  )
  const base = 'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clsx(base, 'text-left transition-colors', a.ring)}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

export interface BadgeProps {
  tone?: Tone
  className?: string
  title?: string
  children: ReactNode
}

export function Badge({ tone = 'slate', className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        badgeTone[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)} role="status">
      <span
        aria-hidden
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
      />
      {label ? <span className="text-sm text-slate-500">{label}</span> : <span className="sr-only">Loading</span>}
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" aria-hidden />
      </div>
      <div className="text-sm font-bold text-slate-700">{title}</div>
      {message && <div className="max-w-md text-sm text-slate-500">{message}</div>}
      {diagnostic && (
        <div className="mt-2 max-w-lg rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600">
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
      <div className="absolute inset-0 bg-slate-900/50" aria-hidden onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl outline-none',
          modalSize[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

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
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
          selected.length > 0
            ? 'border-blue-300 bg-blue-50 text-blue-800'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {showSearch && (
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded border border-slate-300 py-1.5 pl-7 pr-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-slate-500">No matches</div>
            )}
            {visible.map(opt => {
              const checked = selectedSet.has(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span
                    className={clsx(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white',
                    )}
                  >
                    {checked && <Check className="h-3 w-3 text-white" aria-hidden />}
                  </span>
                  <span className="flex-1 truncate text-slate-700">{opt.label ?? opt.value}</span>
                  {opt.count !== undefined && (
                    <span className="text-xs text-slate-400">{opt.count}</span>
                  )}
                </button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50"
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

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** Present = sortable. null sorts last in either direction. */
  sortValue?: (row: T) => string | number | Date | null
  align?: 'left' | 'right' | 'center'
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

  return (
    <div className="overflow-auto rounded-lg border border-slate-200" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse bg-white text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                }
                className={clsx(
                  'border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600',
                  alignClass[col.align ?? 'left'],
                  col.headerClassName,
                )}
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => onHeaderClick(col)}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-300" aria-hidden />
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
                'border-b border-slate-100 last:border-b-0',
                onRowClick && 'cursor-pointer hover:bg-blue-50/50',
              )}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={clsx('px-3 py-2 text-slate-700', alignClass[col.align ?? 'left'], col.cellClassName)}
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
}

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
    <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'whitespace-nowrap rounded px-3 py-1.5 text-sm font-semibold transition-colors',
            tab.id === active ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export type BannerKind = 'info' | 'warn' | 'error'

const bannerStyle: Record<BannerKind, { wrap: string; icon: LucideIcon; iconColor: string }> = {
  info: { wrap: 'border-blue-200 bg-blue-50 text-blue-900', icon: Info, iconColor: 'text-blue-600' },
  warn: { wrap: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle, iconColor: 'text-amber-600' },
  error: { wrap: 'border-red-200 bg-red-50 text-red-900', icon: XCircle, iconColor: 'text-red-600' },
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
  const Icon = s.icon
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={clsx('flex items-center gap-3 rounded-lg border px-3 py-2 text-sm', s.wrap, className)}
    >
      <Icon className={clsx('h-4 w-4 shrink-0', s.iconColor)} aria-hidden />
      <div className="flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  max = 100,
  accent = 'blue',
  label,
  className,
}: {
  value: number
  max?: number
  accent?: Tone
  label?: ReactNode
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
          <span>{label}</span>
          <span className="font-semibold">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={clsx('h-full rounded-full', progressAccent[accent])} style={{ width: `${pct}%` }} />
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
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
