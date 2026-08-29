import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, Clock, GraduationCap, Hourglass, Star } from 'lucide-react'
import type { CadetRow, CadetsResponse, OrgTreeNode } from '@shared/contracts'
import { apiFetch, useOrgs, type ApiError } from '../api/client'
import { useListParam, useOrgScope } from '../lib/urlState'
import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  FilterMenu,
  PageHeader,
  Spinner,
  StatTile,
  type Column,
} from '../components/ui'
import MemberProfileModal from '../features/members/MemberProfileModal'
import { CADET_STATE_META, fmtDate, optionCounts, type CadetState } from '../features/members/shared'

const STATE_OPTIONS = (Object.keys(CADET_STATE_META) as CadetState[]).map(state => ({
  value: state,
  label: CADET_STATE_META[state].label,
}))

// The "Close" tile groups the two nearly-there states, matching the v1 tile
// definition (AppCadetDashboard.html:123-137).
const CLOSE_STATES: readonly CadetState[] = ['TIME_PENDING', 'NEARLY_READY']

const PHASE_LABELS: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' }

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

function orgNamesOf(tree: OrgTreeNode | undefined): Map<number, string> {
  const out = new Map<number, string>()
  const walk = (node: OrgTreeNode): void => {
    out.set(node.orgid, node.name)
    for (const child of node.children) walk(child)
  }
  if (tree !== undefined) walk(tree)
  return out
}

function stateBadge(row: CadetRow) {
  const meta = CADET_STATE_META[row.state]
  return (
    <Badge tone={meta.tone} title={row.stateMessage ?? meta.label}>
      {meta.label}
    </Badge>
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

  const orgNames = useMemo(() => orgNamesOf(orgsQ.data?.tree), [orgsQ.data])
  const unitNameOf = useCallback(
    (id: number): string => {
      if (id === -1) return 'Unassigned'
      return orgNames.get(id) ?? `Org ${id}`
    },
    [orgNames],
  )

  const columns = useMemo((): Column<CadetRow>[] => {
    return [
      {
        key: 'cadet',
        header: 'Cadet',
        render: r => (
          <div className="flex items-stretch gap-2" data-testid={`cadet-row-${r.capid}`}>
            {/* Row severity strip keyed to the promotion state (the v1 card
                border carried Cadet Protection tone, which compute does not
                serve; the promotion state is the served severity signal). */}
            <span className={clsx('w-1 shrink-0 rounded-full', CADET_STATE_META[r.state].bar)} />
            <div>
              <div className="font-bold text-slate-900">
                {r.nameLast}, {r.nameFirst}
              </div>
              <div className="text-xs text-slate-500">
                {r.rank} <span className="text-slate-300">|</span> #{r.capid}
              </div>
              <div className="max-w-[200px] truncate text-xs text-slate-400" title={unitNameOf(r.orgid)}>
                {unitNameOf(r.orgid)}
              </div>
            </div>
          </div>
        ),
        sortValue: r => `${r.nameLast}, ${r.nameFirst}`,
      },
      {
        key: 'phase',
        header: 'Phase',
        align: 'center',
        render: r =>
          r.phase !== null ? (
            <span className="text-sm font-semibold text-slate-700">{PHASE_LABELS[r.phase] ?? r.phase}</span>
          ) : (
            <span className="text-xs italic text-slate-400">-</span>
          ),
        sortValue: r => r.phase,
      },
      {
        key: 'status',
        header: 'Status',
        render: r => (
          <div>
            {stateBadge(r)}
            {r.nextAchvPublicNumber !== null && (
              <div className="mt-0.5 text-[11px] text-slate-500">
                Next: Achv {r.nextAchvPublicNumber}
              </div>
            )}
          </div>
        ),
        sortValue: r => r.state,
      },
      {
        key: 'eligible',
        header: 'TIG Eligible',
        render: r => (
          <div className="text-xs text-slate-600">
            <div>{fmtDate(r.tigCompleteOn)}</div>
            {r.daysSincePromotion !== null && (
              <div
                className={clsx(
                  'flex items-center gap-1',
                  r.daysSincePromotion >= 90 ? 'font-semibold text-amber-700' : 'text-slate-400',
                )}
                title={
                  r.daysSincePromotion >= 90
                    ? '90+ days since last promotion'
                    : 'Days since last promotion'
                }
              >
                {r.daysSincePromotion >= 90 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
                {r.daysSincePromotion}d in grade
              </div>
            )}
          </div>
        ),
        sortValue: r => r.tigCompleteOn,
      },
      {
        key: 'hfz',
        header: 'HFZ',
        render: r =>
          r.hfzValidUntil !== null ? (
            <span className="text-xs text-slate-600">valid to {r.hfzValidUntil}</span>
          ) : (
            <span className="text-xs italic text-slate-400">none</span>
          ),
        sortValue: r => r.hfzValidUntil,
      },
      {
        key: 'honor',
        header: 'Honor',
        align: 'center',
        render: r =>
          r.honorCreditCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-sm font-bold text-amber-600"
              title={`${r.honorCreditCount} honor credit${r.honorCreditCount === 1 ? '' : 's'} earned`}
            >
              <Star className="h-3.5 w-3.5" aria-hidden /> {r.honorCreditCount}
            </span>
          ) : (
            <span className="text-xs text-slate-300">-</span>
          ),
        sortValue: r => r.honorCreditCount,
      },
      {
        key: 'duties',
        header: 'Duty Positions',
        render: r => (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {r.duties.length === 0 && <span className="text-xs italic text-slate-400">None</span>}
            {r.duties.map((d, i) => (
              <Badge
                key={`${d.duty}-${i}`}
                tone={d.heldAtOrgid !== r.orgid ? 'blue' : 'slate'}
                title={
                  d.heldAtOrgid !== r.orgid
                    ? `Cross-unit at ${unitNameOf(d.heldAtOrgid)}`
                    : undefined
                }
              >
                {d.duty}
                {d.asst ? ' (A)' : ''}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        key: 'es',
        header: 'ES',
        render: r => {
          const c = r.esCounts
          if (c.active === 0 && c.training === 0) {
            return <span className="text-xs text-slate-300">-</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {c.active > 0 && <Badge tone="green">{c.active} active</Badge>}
              {c.training > 0 && <Badge tone="blue">{c.training} training</Badge>}
            </div>
          )
        },
        sortValue: r => r.esCounts.active,
      },
    ]
  }, [unitNameOf])

  if (orgsQ.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading units..." />
      </div>
    )
  }

  const data = filteredQ.data
  const tiles = data?.tiles
  const readyActive = states.length === 1 && states[0] === 'READY'
  const closeActive =
    states.length === CLOSE_STATES.length && CLOSE_STATES.every(s => states.includes(s))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cadet Dashboard"
        subtitle="Milestones, promotion eligibility, HFZ, leadership billets"
      />

      {orgsQ.error && (
        <Banner kind="error">Could not load the unit tree: {orgsQ.error.message}</Banner>
      )}
      {filteredQ.error && (
        <Banner kind="error">
          Could not load cadets for org {orgid}: {filteredQ.error.message}
        </Banner>
      )}

      <Card padded>
        <div className="flex flex-wrap items-center gap-2" data-testid="cadet-filter-bar">
          <span className="text-xs font-bold uppercase text-slate-500">Filters:</span>
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
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Reset all ({activeFilterCount})
            </button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="cadet-tiles">
        <div data-testid="cadets-tile-total">
          <StatTile
            label="Total"
            value={filteredQ.isPending ? '...' : (data?.total ?? 0)}
            icon={GraduationCap}
            accent="blue"
            sublabel="Cadets in scope"
          />
        </div>
        <div
          data-testid="cadets-tile-ready"
          title="Cadets who have completed all requirements and are eligible for promotion"
        >
          <button
            type="button"
            onClick={() => toggleStateSet(['READY'])}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
              readyActive
                ? 'border-green-400 bg-green-50'
                : 'border-slate-200 bg-white hover:border-green-300',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ready</div>
              <div className="text-2xl font-bold leading-tight text-green-700">
                {filteredQ.isPending ? '...' : (tiles?.ready ?? 0)}
              </div>
              <div className="truncate text-xs text-slate-500">Click to filter</div>
            </div>
          </button>
        </div>
        <div
          data-testid="cadets-tile-close"
          title="Cadets who are nearly ready or waiting on time in grade"
        >
          <button
            type="button"
            onClick={() => toggleStateSet(CLOSE_STATES)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
              closeActive
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 bg-white hover:border-amber-300',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Hourglass className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Close</div>
              <div className="text-2xl font-bold leading-tight text-amber-700">
                {filteredQ.isPending ? '...' : (tiles?.close ?? 0)}
              </div>
              <div className="truncate text-xs text-slate-500">Click to filter</div>
            </div>
          </button>
        </div>
        <div
          data-testid="cadets-tile-90days"
          title="Cadets 90+ days at their current grade (display only; not a server filter)"
        >
          <StatTile
            label="90+ Days"
            value={filteredQ.isPending ? '...' : (tiles?.ninetyPlusDays ?? 0)}
            icon={Clock}
            accent="amber"
            sublabel="Since last promotion"
          />
        </div>
        <div data-testid="cadets-tile-honor" title="Total honor credits earned across all cadets shown">
          <StatTile
            label="Honor"
            value={filteredQ.isPending ? '...' : (tiles?.honorCredits ?? 0)}
            icon={Star}
            accent="indigo"
            sublabel="Credits earned"
          />
        </div>
        <Card padded data-testid="cadet-phase-chips">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Phases
          </div>
          <div className="flex items-center gap-2">
            {(['1', '2', '3', '4'] as const).map(phase => {
              const active = phases.includes(phase)
              return (
                <button
                  key={phase}
                  type="button"
                  data-testid={`cadet-phase-chip-${phase}`}
                  onClick={() => togglePhase(phase)}
                  title={`Phase ${PHASE_LABELS[phase] ?? phase}: click to filter`}
                  className="group flex flex-col items-center"
                >
                  <span
                    className={clsx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm transition-all group-hover:opacity-90',
                      active ? 'bg-blue-700 ring-2 ring-blue-300' : 'bg-blue-500',
                    )}
                  >
                    {tiles?.phases[phase] ?? 0}
                  </span>
                  <span className="mt-0.5 text-[9px] font-bold text-slate-400 group-hover:text-slate-600">
                    {PHASE_LABELS[phase]}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {filteredQ.isPending && orgid !== null ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading cadet roster..." />
        </div>
      ) : (
        data !== undefined && (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={r => r.capid}
            onRowClick={r => setProfileCapid(r.capid)}
            initialSort={{ key: 'cadet', dir: 'asc' }}
            maxHeight="70vh"
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
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
