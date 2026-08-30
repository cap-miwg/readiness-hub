import { type HTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

/*
 * Hairline figures strip for the roster pages (quiet-authority mockup
 * `.figures`): the rollup tiles become quiet Rajdhani numerals divided by
 * hairlines, replacing v1's boxed colored tiles. Two-up and dividerless on
 * phones; the divider breakpoint follows the page's full-row breakpoint.
 */

export type StripBreak = 'md' | 'lg'

// Literal class strings per breakpoint so the Tailwind scanner sees them.
const CELL_DIVIDERS: Record<StripBreak, string> = {
  md: 'md:border-l md:border-hairline md:px-6 md:first:border-l-0 md:first:pl-0',
  lg: 'lg:border-l lg:border-hairline lg:px-6 lg:first:border-l-0 lg:first:pl-0',
}

export function FigureStrip({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('grid grid-cols-2 gap-y-6 border-y border-hairline py-5', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface FigureCellProps extends HTMLAttributes<HTMLDivElement> {
  /** Breakpoint at which the hairline dividers between cells appear. */
  at?: StripBreak
}

export function FigureCell({ at = 'md', className, children, ...rest }: FigureCellProps) {
  return (
    <div className={clsx('min-w-0', CELL_DIVIDERS[at], className)} {...rest}>
      {children}
    </div>
  )
}

export interface FigureButtonProps {
  value: ReactNode
  label: ReactNode
  active: boolean
  onClick: () => void
  title?: string
}

/**
 * A clickable figure: the numeral is a filter toggle, rendered in symbol ink
 * while its filter is applied (interactive/selected is Symbol Blue's job).
 */
export function FigureButton({ value, label, active, onClick, title }: FigureButtonProps) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active} className="block text-left">
      <div
        className={clsx(
          'tnum font-display text-[40px] font-medium leading-none tracking-tight',
          active ? 'text-symbol' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className={clsx('kicker mt-1.5', active ? 'text-symbol' : 'text-ink')}>{label}</div>
      <div className="mt-0.5 text-[11px] text-ink2">
        {active ? 'Filtering · click to clear' : 'Click to filter'}
      </div>
    </button>
  )
}
