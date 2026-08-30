import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { Meta } from '../api/client'

/*
 * The data-age chip (V2-DESIGN-PLAN.md D10): a neutral "As of 28 Aug" chip on
 * every page, provenance not alarm. The popover explains the extract date,
 * the last ingest, when the next one is expected, and how corrections flow.
 * Scarlet appears only past the staleness threshold or on a confirmed ingest
 * failure; the default-scarlet badge of v1 trained users to ignore red.
 */

// 26h: the scheduled ingest is daily (04:00, docs/ARCHITECTURE.md Ingest);
// anything older than one cycle plus slack means the pipeline is stalled.
export const STALE_AFTER_HOURS = 26

export interface DataAge {
  hours: number
  stale: boolean
}

export function dataAgeOf(downloadDate: string | null | undefined, nowMs: number): DataAge | null {
  if (!downloadDate) return null
  const parsed = new Date(downloadDate)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = (nowMs - parsed.getTime()) / 3_600_000
  return { hours, stale: hours > STALE_AFTER_HOURS }
}

/** "28 Aug" (en-GB puts the day first, matching the approved mockups). */
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

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
  className?: string
}

export default function AsOfChip({ meta, pending, nowMs, className }: AsOfChipProps) {
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

  const age = dataAgeOf(meta.downloadDate, nowMs)
  // MetaResponse carries no run-status field yet; until it does, age past
  // the threshold is the only confirmed-failure signal available here.
  const alarmed = age !== null && age.stale
  const label = meta.downloadDate ? `As of ${shortDate(meta.downloadDate)}` : 'No data yet'

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={clsx(
          'tnum flex items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs',
          alarmed ? 'border-scarlet text-scarlet' : 'border-hairline text-ink2 hover:border-muted',
        )}
      >
        <span
          aria-hidden
          className={clsx('h-1.5 w-1.5 rounded-full', alarmed ? 'bg-scarlet' : 'bg-muted')}
        />
        {alarmed && <span className="sr-only">Alert: data may be stale. </span>}
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="About the data"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-lg border border-hairline bg-paper p-4 shadow-lg"
        >
          <p className="kicker text-ink">About the data</p>
          <div className="mt-2">
            <FactRow
              label="Extract date"
              value={meta.downloadDate ? fullStamp(meta.downloadDate) : 'No extract ingested yet'}
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
            Figures reflect the CAPWATCH extract above; a new extract arrives with the nightly
            ingest. Data older than {STALE_AFTER_HOURS} hours is flagged because the pipeline has
            likely stalled. Records are corrected in eServices and appear here with the next
            extract.
          </p>
        </div>
      )}
    </div>
  )
}
