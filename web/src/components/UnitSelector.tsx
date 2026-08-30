import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { OrgTreeNode } from '@shared/contracts'
import { flattenOrgTree, type FlatOrg } from './charter'

/*
 * The unit selector (V2-DESIGN-PLAN.md section 4): one closed control in the
 * top bar reading charter-first, opening a command-structure panel. Include
 * Sub-Units is part of choosing scope, so it lives pinned inside the panel,
 * echoed on the closed control as "+ sub-units". Below lg the panel becomes
 * a full-height sheet. Keyboard: arrows move, Enter selects, Escape closes.
 */

export interface UnitSelectorProps {
  tree: OrgTreeNode | undefined
  loading: boolean
  error: string | null
  selectedOrgid: number | null
  descendants: boolean
  onSelect: (orgid: number) => void
  onDescendantsChange: (value: boolean) => void
}

export default function UnitSelector({
  tree,
  loading,
  error,
  selectedOrgid,
  descendants,
  onSelect,
  onDescendantsChange,
}: UnitSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const flat = useMemo<FlatOrg[]>(() => (tree ? flattenOrgTree(tree) : []), [tree])
  const selected = useMemo(
    () => flat.find(o => o.orgid === selectedOrgid) ?? null,
    [flat, selectedOrgid],
  )
  const showSearch = flat.length > 8

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flat
    return flat.filter(
      o => o.name.toLowerCase().includes(q) || o.charter.toLowerCase().includes(q),
    )
  }, [flat, query])

  const close = () => {
    setOpen(false)
    setQuery('')
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus lands on the search filter (or the selected row) when opening.
  useEffect(() => {
    if (!open) return
    if (searchRef.current) {
      searchRef.current.focus()
      return
    }
    const panel = panelRef.current
    const target =
      panel?.querySelector<HTMLButtonElement>('[data-unit-option][aria-selected="true"]') ??
      panel?.querySelector<HTMLButtonElement>('[data-unit-option]')
    target?.focus()
  }, [open])

  const moveFocus = (delta: 1 | -1) => {
    const panel = panelRef.current
    if (!panel) return
    const options = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-unit-option]'))
    if (options.length === 0) return
    const idx = options.findIndex(el => el === document.activeElement)
    const next =
      idx === -1
        ? delta === 1
          ? 0
          : options.length - 1
        : Math.min(options.length - 1, Math.max(0, idx + delta))
    options[next]?.focus()
  }

  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveFocus(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveFocus(-1)
    }
  }

  const chipText = selected ? selected.charter || selected.name : loading ? 'Loading units' : 'Select unit'

  if (error !== null) {
    return (
      <span
        title={error}
        className="flex max-w-[220px] items-center gap-1.5 truncate rounded-md border border-scarlet px-2.5 py-1.5 text-xs text-scarlet"
      >
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-scarlet" />
        Units unavailable
      </span>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={loading || flat.length === 0}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-[320px] items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-[13px] text-ink hover:border-muted disabled:text-ink2"
      >
        <span className="tnum whitespace-nowrap font-display font-semibold">{chipText}</span>
        {selected !== null && selected.charter !== '' && (
          <span className="hidden max-w-[180px] truncate lg:inline">{selected.name}</span>
        )}
        {descendants && <span className="whitespace-nowrap text-ink2">+ sub-units</span>}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" aria-hidden onMouseDown={close} />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Unit scope"
            onKeyDown={onPanelKey}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-paper p-3 shadow-xl lg:absolute lg:inset-auto lg:right-0 lg:top-[calc(100%+8px)] lg:max-h-[70vh] lg:w-[380px] lg:rounded-lg lg:border lg:border-hairline lg:p-2"
          >
            <div className="flex items-center justify-between px-2 pb-1 pt-1 lg:hidden">
              <span className="kicker text-ink">Unit scope</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-2 text-ink2 hover:bg-gray20"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2.5 border-b border-hairline px-2 pb-3 pt-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={descendants}
                onChange={e => onDescendantsChange(e.target.checked)}
                className="sr-only"
              />
              <span
                className={clsx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  descendants ? 'border-symbol bg-symbol' : 'border-muted bg-paper',
                )}
              >
                {descendants && <Check className="h-3 w-3 text-paper" aria-hidden />}
              </span>
              Include Sub-Units
              <span className="ml-auto text-xs text-ink2">aggregates subordinate units</span>
            </label>

            {showSearch && (
              <div className="relative px-2 pt-2">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 translate-y-[-25%] text-muted"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter units"
                  aria-label="Filter units"
                  className="w-full rounded-md border border-hairline py-1.5 pl-8 pr-2 text-sm text-ink focus:border-symbol focus:outline-none"
                />
              </div>
            )}

            <div role="listbox" aria-label="Units" className="mt-1 min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-ink2">No units match</p>
              )}
              {visible.map(o => {
                const isSelected = o.orgid === selectedOrgid
                return (
                  <button
                    key={o.orgid}
                    type="button"
                    data-unit-option
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(o.orgid)
                      close()
                    }}
                    style={{ paddingLeft: 10 + o.depth * 16 }}
                    className={clsx(
                      'flex w-full items-baseline gap-2.5 rounded-md py-2 pr-2 text-left text-[13px] lg:py-1.5',
                      isSelected ? 'bg-symbol-20 font-semibold text-symbol' : 'text-ink hover:bg-gray20',
                    )}
                  >
                    <span
                      className={clsx(
                        'tnum w-16 shrink-0 font-display',
                        isSelected ? 'text-symbol' : 'text-muted',
                      )}
                    >
                      {o.charter}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className={clsx('tnum shrink-0 text-xs', isSelected ? 'text-symbol' : 'text-muted')}>
                      {o.memberCount}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
