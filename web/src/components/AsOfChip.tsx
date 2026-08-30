import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { Meta } from '../api/client'
import { formatExtractDateTime, formatExtractDay } from './dates'
import { VerdictGlyph } from './ui'

/*
 * The data-age chip (V2-DESIGN-PLAN.md D10), a three-step ladder so red is
 * never the default:
 *   neutral - muted dot, "As of 28 Aug" in ink2. Provenance, not alarm.
 *   aging   - the ingest is older than the server's staleness threshold:
 *             AF Yellow WATCH glyph plus the visible word "aging".
 *   failed  - the last ingest run failed: scarlet, "Ingest failed".
 * Age is measured from lastIngestAt (when the pipeline last ran), never from
 * downloadDate: CAPWATCH generates extracts on its own clock, and an extract
 * a day older than the ingest that loaded it is normal, not a stall.
 * Extract dates render in UTC (components/dates.ts) so the calendar day
 * shown matches the day the extract carries.
 */

/** Fallback threshold until the server serves staleAfterHours (26h = one daily cycle plus slack). */
export const DEFAULT_STALE_AFTER_HOURS = 26

/**
 * The meta facts the ladder reads, structurally typed so the chip works
 * against MetaResponse both with and without the run-status fields.
 */
export interface ChipMeta {
  downloadDate: string | null
  lastIngestAt: string | null
  lastRunStatus?: 'succeeded' | 'failed' | null
  staleAfterHours?: number
}

export type ChipState = 'neutral' | 'aging' | 'failed'

/** The D10 ladder: failed > aging > neutral. Pure; exported for tests. */
export function chipStateOf(meta: ChipMeta, nowMs: number): ChipState {
  if (meta.lastRunStatus === 'failed') return 'failed'
  if (meta.lastIngestAt !== null) {
    const ingested = new Date(meta.lastIngestAt).getTime()
    if (!Number.isNaN(ingested)) {
      const hours = (nowMs - ingested) / 3_600_000
      if (hours > (meta.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS)) return 'aging'
    }
  }
  return 'neutral'
}

/** Full local timestamp for run facts (last ingest, next expected). */
function fullStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-[13px] last:border-b-0">
      <span className="shrink-0 text-ink">{label}</span>
      <span className="tnum text-right text-ink">{value}</span>
    </div>
  )
}

export interface AsOfChipProps {
  meta: Meta | undefined
  pending: boolean
  nowMs: number
  /** Dot-only trigger for the below-lg bar; the popover stays identical. */
  compact?: boolean
  className?: string
}

export default function AsOfChip({ meta, pending, nowMs, compact = false, className }: AsOfChipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  if (pending || meta === undefined) return null

  const chipMeta: ChipMeta = meta
  const state = chipStateOf(chipMeta, nowMs)
  const staleAfterHours = chipMeta.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS

  const asOf = meta.downloadDate !== null ? `As of ${formatExtractDay(meta.downloadDate)}` : 'No data yet'
  const label = state === 'failed' ? 'Ingest failed' : state === 'aging' ? `${asOf} · aging` : asOf
  const sr =
    state === 'failed'
      ? 'Alert: the last data ingest failed. '
      : state === 'aging'
        ? 'Warning: data may be stale. '
        : ''

  const glyph =
    state === 'failed' ? (
      <VerdictGlyph kind="action" />
    ) : state === 'aging' ? (
      <VerdictGlyph kind="watch" />
    ) : (
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
    )

  const popover = open && (
    <div
      role="dialog"
      aria-label="About the data"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-lg border border-hairline bg-paper p-4 shadow-lg"
    >
      <p className="kicker text-ink">About the data</p>
      <div className="mt-2">
        <FactRow
          label="Extract date"
          value={meta.downloadDate ? formatExtractDateTime(meta.downloadDate) : 'No extract ingested yet'}
        />
        <FactRow
          label="Last ingest"
          value={meta.lastIngestAt ? fullStamp(meta.lastIngestAt) : 'Never'}
        />
        <FactRow
          label="Next expected"
          value={
            meta.lastIngestAt
              ? fullStamp(new Date(new Date(meta.lastIngestAt).getTime() + 24 * 3_600_000).toISOString())
              : 'After the first ingest'
          }
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink2">
        Figures reflect the CAPWATCH extract above (dated in UTC); a new extract arrives with the
        nightly ingest. An ingest older than {staleAfterHours} hours is marked aging because the
        pipeline has likely stalled; scarlet appears only when the last ingest run failed. Records
        are corrected in eServices and appear here with the next extract.
      </p>
    </div>
  )

  if (compact) {
    return (
      <div ref={rootRef} className={clsx('relative', className)}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`About the data. ${sr}${label}`}
          data-testid="as-of-chip-compact"
          className="flex h-10 w-8 items-center justify-center"
        >
          {glyph}
        </button>
        {popover}
      </div>
    )
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="as-of-chip"
        className={clsx(
          'tnum flex items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs',
          state === 'failed'
            ? 'border-scarlet text-scarlet'
            : state === 'aging'
              ? 'border-hairline text-ink hover:border-muted'
              : 'border-hairline text-ink2 hover:border-muted',
        )}
      >
        {glyph}
        {sr !== '' && <span className="sr-only">{sr}</span>}
        {label}
      </button>
      {popover}
    </div>
  )
}
