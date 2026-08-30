import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Figure } from '../../components/ui'

/*
 * Shared Unit Overview grammar (docs/design/mockups/quiet-authority/
 * unit-overview.html + direction.md section 3): hairline-separated figures
 * strips, hairline fact ledger rows, the score lead with its methodology
 * behind a disclosure, and the NOT RECORDED neutral state. These are layout
 * idioms, not new components; everything chromatic still goes through
 * VerdictMark.
 */

// --- Band words (scores never outrank words) ---

/** Shared 80/65/50 band vocabulary (esUnit.ts / orgStats.ts ratings). */
export type BandRating = 'excellent' | 'good' | 'fair' | 'needs-attention'

export const bandWord: Record<BandRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  'needs-attention': 'Needs attention',
}

// --- Figures strip ---

export interface StripFigure {
  label: ReactNode
  value: ReactNode
  band?: ReactNode
  delta?: ReactNode
  testid?: string
}

/**
 * Hairline-separated figures (mockup .figures): no boxes, the vertical rule
 * is the container. Two-up on phones, all-up from md.
 */
export function FiguresStrip({
  figures,
  size = 'md',
  className,
}: {
  figures: readonly StripFigure[]
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const cols =
    figures.length >= 5
      ? 'md:grid-cols-5'
      : figures.length === 4
        ? 'md:grid-cols-4'
        : figures.length === 3
          ? 'md:grid-cols-3'
          : 'md:grid-cols-2'
  return (
    <div className={clsx('grid grid-cols-2 gap-y-5', cols, className)}>
      {figures.map((f, i) => (
        <div
          key={i}
          className={clsx(
            'border-l border-hairline px-5',
            i % 2 === 0 && 'max-md:border-l-0 max-md:pl-0',
            i === 0 && 'md:border-l-0 md:pl-0',
          )}
          {...(f.testid !== undefined ? { 'data-testid': f.testid } : {})}
        >
          <Figure
            value={f.value}
            label={f.label}
            size={size}
            {...(f.band !== undefined ? { band: f.band } : {})}
            {...(f.delta !== undefined ? { delta: f.delta } : {})}
          />
        </div>
      ))}
    </div>
  )
}

// --- Fact ledger ---

export interface FactRowProps {
  label: ReactNode
  children: ReactNode
  testid?: string
}

/** One hairline ledger row: label left, value right, tabular numerals. */
export function FactRow({ label, children, testid }: FactRowProps) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 border-b border-hairline py-2.5 text-sm last:border-b-0"
      {...(testid !== undefined ? { 'data-testid': testid } : {})}
    >
      <span className="shrink-0 text-ink">{label}</span>
      <span className="tnum flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-right text-ink">
        {children}
      </span>
    </div>
  )
}

export function FactLedger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('max-w-[720px]', className)}>{children}</div>
}

// --- Score lead ---

export interface ScoreLeadProps {
  score: ReactNode
  band?: ReactNode
  /** Methodology text; lives behind "How this is computed", never on the canvas. */
  method?: ReactNode
  testid?: string
  className?: string
}

/**
 * The one display numeral an expanded section may carry, with its band word
 * and the methodology disclosure beside it.
 */
export function ScoreLead({ score, band, method, testid, className }: ScoreLeadProps) {
  return (
    <div className={clsx('flex flex-wrap items-baseline gap-x-4 gap-y-1', className)}>
      <span
        className="tnum font-display text-[54px] font-medium leading-none tracking-tight text-ink"
        {...(testid !== undefined ? { 'data-testid': testid } : {})}
      >
        {score}
      </span>
      {band !== undefined && (
        <span className="font-display text-[15px] font-semibold text-ink">{band}</span>
      )}
      {method !== undefined && (
        <details className="text-[13px]">
          <summary className="cursor-pointer list-none text-symbol hover:underline [&::-webkit-details-marker]:hidden">
            How this is computed
          </summary>
          <p className="mt-1.5 max-w-[62ch] text-ink2">{method}</p>
        </details>
      )}
    </div>
  )
}

// --- NOT RECORDED neutral state ---

/**
 * A unit that does not log something in eServices is never painted red for
 * it: dashed hairline, neutral ink, an explanation instead of a verdict.
 */
export function NotRecordedBody({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[62ch] rounded-md border border-dashed border-hairline px-4 py-3.5 text-sm text-ink2">
      {children}
    </div>
  )
}

// --- Small formatters ---

export function fmtRate(rate: number | null): string {
  return rate === null ? '--' : `${Math.round(rate * 100)}%`
}

export function fmtDate(iso: string | null): string {
  if (iso === null) return '--'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`)
}
