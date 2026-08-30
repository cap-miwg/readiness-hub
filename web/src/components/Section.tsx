import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

/*
 * Collapsible disclosure sections (V2-DESIGN-PLAN.md section 6): hairline-
 * opened, status-bearing headers under a hard budget (one score, one state
 * word, one alert count), so the collapsed page is itself a complete brief.
 * A real button carries aria-expanded/aria-controls (not native details, so
 * the status slot stays interactive-safe and state is programmable). Open
 * state persists per user in localStorage keyed by page+section; children
 * lazy-mount on first open.
 */

const STORAGE_PREFIX = 'rh.section.'

export function sectionStorageKey(page: string, id: string): string {
  return `${STORAGE_PREFIX}${page}.${id}`
}

function readStored(page: string, id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(sectionStorageKey(page, id))
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

function writeStored(page: string, id: string, open: boolean): void {
  try {
    window.localStorage.setItem(sectionStorageKey(page, id), open ? '1' : '0')
  } catch {
    // Storage unavailable (private mode, quota): state stays session-local.
  }
}

/** In-page pub/sub so ExpandCollapseAll reaches mounted Sections directly. */
type SectionListener = (page: string, ids: readonly string[] | null, open: boolean) => void
const listeners = new Set<SectionListener>()

function broadcast(page: string, ids: readonly string[] | null, open: boolean): void {
  for (const fn of listeners) fn(page, ids, open)
}

export interface SectionProps {
  /** Persistence namespace, one per page (e.g. "unit-overview"). */
  page: string
  /** Stable section id within the page (e.g. "es"). */
  id: string
  title: ReactNode
  /**
   * Collapsed-header status slot, right-aligned. Budget: one score, one
   * state word, one alert count (VerdictMark), nothing more.
   */
  status?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

export function Section({
  page,
  id,
  title,
  status,
  defaultOpen = false,
  className,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(() => readStored(page, id) ?? defaultOpen)
  const [everOpened, setEverOpened] = useState(open)
  const bodyId = `section-${page}-${id}`

  useEffect(() => {
    const fn: SectionListener = (p, ids, next) => {
      if (p !== page) return
      if (ids !== null && !ids.includes(id)) return
      setOpen(next)
      if (next) setEverOpened(true)
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [page, id])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) setEverOpened(true)
    writeStored(page, id, next)
  }

  return (
    <section className={clsx('border-t border-hairline', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 py-4 text-left"
      >
        <ChevronRight
          aria-hidden
          className={clsx('h-3.5 w-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
        />
        <span className="font-display text-[15px] font-semibold text-ink">{title}</span>
        {status !== undefined && (
          <span className="tnum ml-auto flex shrink-0 items-center gap-2 text-[13px] text-ink">
            {status}
          </span>
        )}
      </button>
      <div id={bodyId} hidden={!open} className="pb-9 pl-6 max-sm:pl-0">
        {everOpened ? children : null}
      </div>
    </section>
  )
}

export interface ExpandCollapseAllProps {
  page: string
  /** The section ids on the page, in any order. */
  ids: readonly string[]
  className?: string
}

/** Quiet text controls that open or close every listed Section at once. */
export function ExpandCollapseAll({ page, ids, className }: ExpandCollapseAllProps) {
  const setAll = (open: boolean) => {
    for (const id of ids) writeStored(page, id, open)
    broadcast(page, ids, open)
  }
  return (
    <span className={clsx('inline-flex items-center gap-2 text-sm', className)}>
      <button type="button" onClick={() => setAll(true)} className="font-medium text-symbol hover:underline">
        Expand all
      </button>
      <span aria-hidden className="text-muted">
        /
      </span>
      <button type="button" onClick={() => setAll(false)} className="font-medium text-symbol hover:underline">
        Collapse all
      </button>
    </span>
  )
}
