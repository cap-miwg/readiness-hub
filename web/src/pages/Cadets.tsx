import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { GraduationCap, Printer, Star } from 'lucide-react'
import type { CadetRow, CadetsResponse, OrgTreeNode } from '@shared/contracts'
import { apiFetch, useOrgs, type ApiError } from '../api/client'
import { useFlagParam, useListParam, useOrgScope } from '../lib/urlState'
import {
  Banner,
  DataTable,
  EmptyState,
  Figure,
  FilterMenu,
  PageHeader,
  Spinner,
  VerdictMark,
  type Column,
} from '../components/ui'
import { flattenOrgTree } from '../components/charter'
import MemberProfileModal from '../features/members/MemberProfileModal'
import { FigureButton, FigureCell, FigureStrip } from '../features/members/FigureStrip'
import {
  CADET_STATE_META,
  cadetBlockerOf,
  cadetTileRollup,
  fmtDate,
  optionCounts,
  primaryDutyOf,
  type CadetState,
} from '../features/members/shared'

const STATE_OPTIONS = (Object.keys(CADET_STATE_META) as CadetState[]).map(state => ({
  value: state,
  label: CADET_STATE_META[state].label,
}))

const PHASE_LABELS: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' }

/** Test-night rows grouped by the cadets' next achievement, null (no next) last. */
interface TestNightGroup {
  achv: number | null
  rows: CadetRow[]
}

export function groupForTestNight(rows: readonly CadetRow[]): TestNightGroup[] {
  const byAchv = new Map<number | null, CadetRow[]>()
  for (const r of rows) {
    const arr = byAchv.get(r.nextAchvPublicNumber)
    if (arr) arr.push(r)
    else byAchv.set(r.nextAchvPublicNumber, [r])
  }
  const groups = [...byAchv.entries()].map(([achv, groupRows]) => ({
    achv,
    rows: groupRows
      .slice()
      .sort((a, b) =>
        `${a.nameLast}, ${a.nameFirst}`.localeCompare(`${b.nameLast}, ${b.nameFirst}`),
      ),
  }))
  groups.sort((a, b) => {
    if (a.achv === null) return b.achv === null ? 0 : 1
    if (b.achv === null) return -1
    return a.achv - b.achv
  })
  return groups
}

function useCadetsQuery(orgid: number | null, search: string) {
  return useQuery<CadetsResponse, ApiError>({
    queryKey: ['cadets', orgid, search],
    queryFn: () =>
      apiFetch<CadetsResponse>(`/api/orgs/${orgid}/cadets${search !== '' ? `?${search}` : ''}`),
    enabled: orgid !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

interface OrgLabels {
  names: Map<number, string>
  charters: Map<number, string>
}

function orgLabelsOf(tree: OrgTreeNode | undefined): OrgLabels {
  const names = new Map<number, string>()
  const charters = new Map<number, string>()
  if (tree !== undefined) {
    for (const org of flattenOrgTree(tree)) {
      names.set(org.orgid, org.name)
      charters.set(org.orgid, org.charter)
    }
  }
  return { names, charters }
}

/**
 * Row promotion state in the verdict grammar: READY is planned board work,
 * NEARLY_READY is the watch word "Close", time-gated states are neutral text.
 */
function StateCell({ row }: { row: CadetRow }) {
  const meta = CADET_STATE_META[row.state]
  const title = row.stateMessage ?? meta.label
  if (row.state === 'READY') {
    return (
      <span title={title}>
        <VerdictMark kind="plan" label={<span className="text-sm">Ready</span>} />
      </span>
    )
  }
  if (row.state === 'NEARLY_READY') {
    return (
      <span title={title}>
        <VerdictMark kind="watch" label={<span className="text-sm">Close</span>} />
      </span>
    )
  }
  if (row.state === 'TIME_PENDING') {
    return (
      <span className="tnum text-sm text-ink" title={title}>
        TIG until {fmtDate(row.tigCompleteOn)}
      </span>
    )
  }
  return (
    <span className="text-sm text-ink2" title={title}>
      {meta.label}
    </span>
  )
}

/** The named blocking requirement: one line, watch mark only when actionable. */
function BlockerCell({ row, todayIso }: { row: CadetRow; todayIso: string }) {
  const blocker = cadetBlockerOf(row, todayIso)
  if (blocker === null) return <span className="text-xs text-ink2">-</span>
  if (blocker.kind === 'watch') {
    return (
      <span title={blocker.title}>
        <VerdictMark kind="watch" label={<span className="text-sm">{blocker.label}</span>} />
      </span>
    )
  }
  return (
    <span className="tnum text-sm text-ink2" title={blocker.title}>
      {blocker.label}
    </span>
  )
}

export default function Cadets() {
  const { scope } = useOrgScope()
  const orgsQ = useOrgs()
  const orgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null

  const [states, setStates] = useListParam('state')
  const [ranks, setRanks] = useListParam('rank')
  const [duties, setDuties] = useListParam('duty')
  const [phases, setPhases] = useListParam('phase')
  const [testNight, setTestNight] = useFlagParam('testNight')

  const [profileCapid, setProfileCapid] = useState<number | null>(null)

  const baseSearch = scope.descendants ? 'descendants=1' : ''
  const filterSearch = useMemo(() => {
    const p = new URLSearchParams()
    if (scope.descendants) p.set('descendants', '1')
    for (const v of states) p.append('state', v)
    for (const v of ranks) p.append('rank', v)
    for (const v of duties) p.append('duty', v)
    for (const v of phases) p.append('phase', v)
    return p.toString()
  }, [scope.descendants, states, ranks, duties, phases])

  const filteredQ = useCadetsQuery(orgid, filterSearch)
  const baseQ = useCadetsQuery(orgid, baseSearch)

  const activeFilterCount = states.length + ranks.length + duties.length + phases.length

  const resetFilters = useCallback(() => {
    setStates([])
    setRanks([])
    setDuties([])
    setPhases([])
  }, [setStates, setRanks, setDuties, setPhases])

  /** Tile toggles behave like v1's single-state clicks: set exactly, or clear. */
  const toggleStateSet = useCallback(
    (target: readonly CadetState[]) => {
      const isActive =
        states.length === target.length && target.every(s => states.includes(s))
      setStates(isActive ? [] : [...target])
    },
    [states, setStates],
  )

  const togglePhase = useCallback(
    (phase: string) => {
      setPhases(phases.includes(phase) ? phases.filter(p => p !== phase) : [...phases, phase])
    },
    [phases, setPhases],
  )

  const baseRows = baseQ.data?.rows
  const rankOptions = useMemo(() => optionCounts(baseRows, r => [r.rank]), [baseRows])
  const dutyOptions = useMemo(
    () => optionCounts(baseRows, r => r.duties.map(d => d.duty)),
    [baseRows],
  )

  const orgLabels = useMemo(() => orgLabelsOf(orgsQ.data?.tree), [orgsQ.data])
  const unitNameOf = useCallback(
    (id: number): string => {
      if (id === -1) return 'Unassigned'
      return orgLabels.names.get(id) ?? `Org ${id}`
    },
    [orgLabels],
  )
  const charterOfOrg = useCallback(
    (id: number): string => orgLabels.charters.get(id) ?? '',
    [orgLabels],
  )

  // Display-time cutoff for the blocker derivation (HFZ lapsed, TIG future).
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Tile rollup over the filtered rows, from the same blocker engine as the
  // per-row chips (shared.ts cadetTileRollup) so the two can never disagree.
  const rollup = useMemo(
    () => cadetTileRollup(filteredQ.data?.rows ?? [], todayIso),
    [filteredQ.data, todayIso],
  )

  const testNightGroups = useMemo(
    () => groupForTestNight(filteredQ.data?.rows ?? []),
    [filteredQ.data],
  )

  const columns = useMemo((): Column<CadetRow>[] => {
    return [
      {
        key: 'cadet',
        header: 'Cadet',
        render: r => {
          const charter = charterOfOrg(r.orgid)
          return (
            <div data-testid={`cadet-row-${r.capid}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-medium text-ink">
                  {r.nameLast}, {r.nameFirst}
                </span>
                <span
                  className="tnum font-display text-[11px] font-semibold text-ink2"
                  title={unitNameOf(r.orgid)}
                >
                  {charter !== '' ? charter : unitNameOf(r.orgid)}
                </span>
              </div>
              <div className="tnum text-xs text-ink2">
                {r.rank} · #{r.capid}
              </div>
            </div>
          )
        },
        sortValue: r => `${r.nameLast}, ${r.nameFirst}`,
      },
      {
        key: 'phase',
        header: 'Phase',
        align: 'center',
        render: r =>
          r.phase !== null ? (
            <span className="text-sm text-ink">{PHASE_LABELS[r.phase] ?? r.phase}</span>
          ) : (
            <span className="text-xs text-ink2">-</span>
          ),
        sortValue: r => r.phase,
      },
      {
        key: 'status',
        header: 'Status',
        render: r => <StateCell row={r} />,
        sortValue: r => r.state,
      },
      {
        key: 'blocker',
        header: 'Blocker',
        render: r => <BlockerCell row={r} todayIso={todayIso} />,
      },
      {
        key: 'eligible',
        header: 'TIG Eligible',
        render: r => (
          <div className="tnum text-xs text-ink2">
            <div>{fmtDate(r.tigCompleteOn)}</div>
            {r.daysSincePromotion !== null && (
              <div title="Days since last promotion">{r.daysSincePromotion}d in grade</div>
            )}
          </div>
        ),
        sortValue: r => r.tigCompleteOn,
      },
      {
        key: 'honor',
        header: 'Honor',
        align: 'center',
        render: r =>
          r.honorCreditCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-sm text-ink2"
              title={`${r.honorCreditCount} honor credit${r.honorCreditCount === 1 ? '' : 's'} earned`}
            >
              <Star className="h-3.5 w-3.5 text-ink2" aria-hidden />
              <span className="tnum">{r.honorCreditCount}</span>
            </span>
          ) : (
            <span className="text-xs text-ink2">-</span>
          ),
        sortValue: r => r.honorCreditCount,
      },
      {
        key: 'duties',
        header: 'Duty',
        render: r => {
          const primary = primaryDutyOf(r.duties)
          if (primary === null) return <span className="text-xs text-ink2">-</span>
          const more = r.duties.length - 1
          const crossUnit = primary.heldAtOrgid !== r.orgid
          return (
            <div
              className="text-sm text-ink"
              title={r.duties
                .map(
                  d =>
                    `${d.duty}${d.asst ? ' (A)' : ''}${
                      d.heldAtOrgid !== r.orgid ? ` - cross-unit at ${unitNameOf(d.heldAtOrgid)}` : ''
                    }`,
                )
                .join(', ')}
            >
              {primary.duty}
              {primary.asst ? ' (A)' : ''}
              {crossUnit && <span className="ml-1.5 text-xs text-symbol">cross-unit</span>}
              {more > 0 && <span className="ml-1.5 text-xs text-ink2">+{more}</span>}
            </div>
          )
        },
      },
      {
        key: 'es',
        header: 'ES',
        render: r => {
          const c = r.esCounts
          const parts: string[] = []
          if (c.active > 0) parts.push(`${c.active} active`)
          if (c.training > 0) parts.push(`${c.training} training`)
          if (parts.length === 0) return <span className="text-xs text-ink2">-</span>
          return <span className="tnum text-xs text-ink2">{parts.join(' · ')}</span>
        },
        sortValue: r => r.esCounts.active,
      },
    ]
  }, [unitNameOf, charterOfOrg, todayIso])

  if (orgsQ.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading units..." />
      </div>
    )
  }

  const data = filteredQ.data
  const tiles = data?.tiles
  const pendingValue = filteredQ.isPending ? '...' : null
  const readyActive = states.length === 1 && states[0] === 'READY'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cadet Dashboard"
        subtitle="Milestones, promotion eligibility, HFZ, leadership billets"
        actions={
          <>
            <button
              type="button"
              data-testid="cadet-test-night-toggle"
              aria-pressed={testNight}
              onClick={() => setTestNight(!testNight)}
              className={clsx(
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors print:hidden',
                testNight
                  ? 'border-symbol text-symbol'
                  : 'border-hairline bg-paper text-ink hover:border-muted',
              )}
            >
              Test night
            </button>
            {testNight && (
              <button
                type="button"
                data-testid="cadet-test-night-print"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted print:hidden"
              >
                <Printer className="h-4 w-4" aria-hidden /> Print
              </button>
            )}
          </>
        }
      />

      {orgsQ.error && (
        <Banner kind="error">Could not load the unit tree: {orgsQ.error.message}</Banner>
      )}
      {filteredQ.error && (
        <Banner kind="error">
          Could not load cadets for org {orgid}: {filteredQ.error.message}
        </Banner>
      )}

      <div
        className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3 print:hidden"
        data-testid="cadet-filter-bar"
      >
        <span className="kicker mr-1 text-ink">Filters</span>
        <span data-testid="filter-state">
          <FilterMenu
            label="Promotion Status"
            options={STATE_OPTIONS}
            selected={states}
            onChange={setStates}
          />
        </span>
        <span data-testid="filter-cadet-rank">
          <FilterMenu label="Cadet Rank" options={rankOptions} selected={ranks} onChange={setRanks} />
        </span>
        <span data-testid="filter-cadet-duty">
          <FilterMenu
            label="Duty Position"
            options={dutyOptions}
            selected={duties}
            onChange={setDuties}
            searchable
          />
        </span>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            data-testid="cadet-filter-reset"
            className="tnum text-sm font-medium text-symbol hover:underline"
          >
            Reset all ({activeFilterCount})
          </button>
        )}
      </div>

      <FigureStrip
        className="print:hidden lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.6fr)]"
        data-testid="cadet-tiles"
      >
        <FigureCell at="lg" data-testid="cadets-tile-total">
          <Figure value={pendingValue ?? (data?.total ?? 0)} label="Total" delta="Cadets in scope" />
        </FigureCell>
        <FigureCell
          at="lg"
          data-testid="cadets-tile-ready"
          title="Cadets who have completed all requirements and are eligible for promotion"
        >
          <FigureButton
            value={pendingValue ?? rollup.ready}
            label="Ready"
            active={readyActive}
            onClick={() => toggleStateSet(['READY'])}
            title="Cadets who have completed all requirements and are eligible for promotion"
          />
        </FigureCell>
        <FigureCell
          at="lg"
          data-testid="cadets-tile-hfz"
          title="Cadets whose next promotion is blocked by a missing or lapsed HFZ credit"
        >
          <Figure
            value={pendingValue ?? rollup.blockedHfz}
            label="Blocked by HFZ"
            delta="Missing or lapsed"
          />
        </FigureCell>
        <FigureCell
          at="lg"
          data-testid="cadets-tile-tig"
          title="Cadets waiting only on time in grade"
        >
          <Figure
            value={pendingValue ?? rollup.blockedTig}
            label="Blocked by TIG"
            delta="Time in grade"
          />
        </FigureCell>
        <FigureCell
          at="lg"
          data-testid="cadets-tile-inprogress"
          title="Cadets still working requirements for their next achievement"
        >
          <Figure
            value={pendingValue ?? rollup.inProgress}
            label="In progress"
            delta="Working requirements"
          />
        </FigureCell>
        <FigureCell at="lg" data-testid="cadet-phase-chips">
          <div className="flex items-end gap-3">
            {(['1', '2', '3', '4'] as const).map(phase => {
              const active = phases.includes(phase)
              return (
                <button
                  key={phase}
                  type="button"
                  data-testid={`cadet-phase-chip-${phase}`}
                  onClick={() => togglePhase(phase)}
                  title={`Phase ${PHASE_LABELS[phase] ?? phase}: click to filter`}
                  aria-pressed={active}
                  className={clsx(
                    'flex flex-col items-center border-b-2 px-0.5 pb-1 transition-colors',
                    active ? 'border-symbol' : 'border-transparent hover:border-hairline',
                  )}
                >
                  <span
                    className={clsx(
                      'tnum font-display text-[22px] font-medium leading-none',
                      active ? 'text-symbol' : 'text-ink',
                    )}
                  >
                    {tiles?.phases[phase] ?? 0}
                  </span>
                  <span className={clsx('kicker mt-1', active ? 'text-symbol' : 'text-ink2')}>
                    {PHASE_LABELS[phase]}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="kicker mt-1.5 text-ink">Phases</div>
        </FigureCell>
      </FigureStrip>

      {filteredQ.isPending && orgid !== null ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading cadet roster..." />
        </div>
      ) : testNight ? (
        data !== undefined && (
          <div data-testid="cadet-test-night" className="space-y-6">
            {testNightGroups.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="No cadets match"
                message={
                  activeFilterCount > 0
                    ? 'The active filters exclude every cadet in this scope.'
                    : 'This scope has no cadets.'
                }
              />
            ) : (
              testNightGroups.map(g => (
                <section key={g.achv ?? 'none'} data-testid={`test-night-group-${g.achv ?? 'none'}`}>
                  <h2 className="break-after-avoid border-b border-hairline pb-1 font-display text-[15px] font-semibold text-ink">
                    {g.achv !== null ? `Achievement ${g.achv}` : 'No next achievement'} ·{' '}
                    {g.rows.length} cadet{g.rows.length === 1 ? '' : 's'}
                  </h2>
                  <div>
                    {g.rows.map(r => (
                      <div
                        key={r.capid}
                        data-testid={`test-night-row-${r.capid}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 break-inside-avoid border-b border-hairline py-1.5"
                      >
                        <span className="text-sm font-medium text-ink">
                          {r.nameLast}, {r.nameFirst}
                        </span>
                        <span className="tnum text-xs text-ink2">#{r.capid}</span>
                        <span className="text-xs text-ink2">{r.rank}</span>
                        <BlockerCell row={r} todayIso={todayIso} />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )
      ) : (
        data !== undefined && (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={r => r.capid}
            onRowClick={r => setProfileCapid(r.capid)}
            initialSort={{ key: 'cadet', dir: 'asc' }}
            maxHeight="70vh"
            mobileCard={r => {
              const charter = charterOfOrg(r.orgid)
              return (
                <div data-testid={`cadet-card-${r.capid}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium text-ink">
                      {r.nameLast}, {r.nameFirst}
                    </span>
                    <span className="tnum font-display text-[11px] font-semibold text-ink2">
                      {charter !== '' ? charter : unitNameOf(r.orgid)}
                    </span>
                  </div>
                  <div className="tnum text-xs text-ink2">
                    {r.rank} · #{r.capid}
                    {r.phase !== null ? ` · Phase ${PHASE_LABELS[r.phase] ?? r.phase}` : ''}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StateCell row={r} />
                    <BlockerCell row={r} todayIso={todayIso} />
                  </div>
                </div>
              )
            }}
            empty={
              <EmptyState
                icon={GraduationCap}
                title="No cadets match"
                message={
                  activeFilterCount > 0
                    ? 'The active filters exclude every cadet in this scope.'
                    : 'This scope has no cadets.'
                }
                diagnostic={`GET /api/orgs/${orgid}/cadets${filterSearch !== '' ? `?${filterSearch}` : ''} returned ${data.total} in scope, 0 after filters`}
                action={
                  activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-gray20"
                    >
                      Reset filters
                    </button>
                  ) : undefined
                }
              />
            }
          />
        )
      )}

      <MemberProfileModal capid={profileCapid} onClose={() => setProfileCapid(null)} />
    </div>
  )
}
