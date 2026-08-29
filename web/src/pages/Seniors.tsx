import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Award, CheckCircle2, Users, UsersRound } from 'lucide-react'
import type {
  OrgTreeNode,
  SeniorLevelId,
  SeniorRow,
  SeniorsResponse,
} from '@shared/contracts'
import { apiFetch, useOrgs, type ApiError } from '../api/client'
import { useFlagParam, useListParam, useOrgScope, useStringParam } from '../lib/urlState'
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
import {
  LEVEL_META,
  LEVEL_STATUS_META,
  dutyLacksTrack,
  fmtDate,
  levelProgressOf,
  optionCounts,
  trackLacksDuty,
} from '../features/members/shared'

// Rank category sets shown in the filter (v1 Index.html:1204-1207); the server
// owns the matching semantics, these are display options only.
const RANK_CATEGORY_OPTIONS = [
  { value: 'OFFICER', label: 'Officer' },
  { value: 'NCO', label: 'NCO' },
  { value: 'FLIGHT', label: 'Flight Officer' },
  { value: 'SM', label: 'Senior Member' },
] as const

const TRACK_LEVEL_OPTIONS = [
  { value: 'MASTER' },
  { value: 'SENIOR' },
  { value: 'TECHNICIAN' },
  { value: 'NONE' },
] as const

const DUTY_ASST_OPTIONS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'ASSISTANT', label: 'Assistant' },
] as const

const PROMOTABLE_TOOLTIP = 'Members who meet all promotion requirements (TIG, level, duty)'

function useSeniorsQuery(orgid: number | null, search: string) {
  return useQuery<SeniorsResponse, ApiError>({
    queryKey: ['seniors', orgid, search],
    queryFn: () =>
      apiFetch<SeniorsResponse>(`/api/orgs/${orgid}/seniors${search !== '' ? `?${search}` : ''}`),
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

function LevelDots({ row }: { row: SeniorRow }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {LEVEL_META.map(meta => {
        const p = levelProgressOf(row.levelProgress, meta.id)
        const status = p?.status ?? 'not-started'
        const tone = LEVEL_STATUS_META[status]
        const dot =
          status === 'completed'
            ? 'bg-green-500'
            : status === 'ready' || status === 'pending'
              ? 'bg-amber-400'
              : status === 'in-progress'
                ? 'bg-blue-400'
                : 'bg-slate-200'
        return (
          <span
            key={meta.id}
            title={`${meta.name}: ${p?.percent ?? 0}% (${tone.label})`}
            className="flex flex-col items-center"
          >
            <span className={clsx('h-3.5 w-3.5 rounded-full', dot)} />
            <span className="text-[9px] font-bold text-slate-400">{meta.label}</span>
          </span>
        )
      })}
    </div>
  )
}

export default function Seniors() {
  const { scope } = useOrgScope()
  const orgsQ = useOrgs()
  const orgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null

  const [rankCategories, setRankCategories] = useListParam('rankCategory')
  const [ranks, setRanks] = useListParam('rank')
  const [trackLevels, setTrackLevels] = useListParam('trackLevel')
  const [tracks, setTracks] = useListParam('track')
  const [functAreas, setFunctAreas] = useListParam('functArea')
  const [duties, setDuties] = useListParam('duty')
  const [dutyAsst, setDutyAsst] = useListParam('dutyAsst')
  const [levelComplete, setLevelComplete] = useStringParam('levelComplete')
  const [levelIncomplete, setLevelIncomplete] = useStringParam('levelIncomplete')
  const [promotable, setPromotable] = useFlagParam('promotable')

  const [profileCapid, setProfileCapid] = useState<number | null>(null)

  const baseSearch = scope.descendants ? 'descendants=1' : ''
  const filterSearch = useMemo(() => {
    const p = new URLSearchParams()
    if (scope.descendants) p.set('descendants', '1')
    for (const v of rankCategories) p.append('rankCategory', v)
    for (const v of ranks) p.append('rank', v)
    for (const v of trackLevels) p.append('trackLevel', v)
    for (const v of tracks) p.append('track', v)
    for (const v of functAreas) p.append('functArea', v)
    for (const v of duties) p.append('duty', v)
    // The API takes a single dutyAsst value; both selected means no filter.
    const asst = dutyAsst.length === 1 ? dutyAsst[0] : undefined
    if (asst !== undefined) p.set('dutyAsst', asst.toLowerCase())
    if (levelComplete !== null) p.set('levelComplete', levelComplete)
    if (levelIncomplete !== null) p.set('levelIncomplete', levelIncomplete)
    if (promotable) p.set('promotable', 'true')
    return p.toString()
  }, [
    scope.descendants,
    rankCategories,
    ranks,
    trackLevels,
    tracks,
    functAreas,
    duties,
    dutyAsst,
    levelComplete,
    levelIncomplete,
    promotable,
  ])

  const filteredQ = useSeniorsQuery(orgid, filterSearch)
  const baseQ = useSeniorsQuery(orgid, baseSearch)

  const activeFilterCount =
    rankCategories.length +
    ranks.length +
    trackLevels.length +
    tracks.length +
    functAreas.length +
    duties.length +
    (dutyAsst.length === 1 ? 1 : 0) +
    (levelComplete !== null ? 1 : 0) +
    (levelIncomplete !== null ? 1 : 0) +
    (promotable ? 1 : 0)

  const resetFilters = useCallback(() => {
    setRankCategories([])
    setRanks([])
    setTrackLevels([])
    setTracks([])
    setFunctAreas([])
    setDuties([])
    setDutyAsst([])
    setLevelComplete(null)
    setLevelIncomplete(null)
    setPromotable(false)
  }, [
    setRankCategories,
    setRanks,
    setTrackLevels,
    setTracks,
    setFunctAreas,
    setDuties,
    setDutyAsst,
    setLevelComplete,
    setLevelIncomplete,
    setPromotable,
  ])

  const cycleLevelFilter = useCallback(
    (id: SeniorLevelId) => {
      if (levelComplete === id) {
        setLevelComplete(null)
        setLevelIncomplete(id)
      } else if (levelIncomplete === id) {
        setLevelIncomplete(null)
      } else {
        setLevelIncomplete(null)
        setLevelComplete(id)
      }
    },
    [levelComplete, levelIncomplete, setLevelComplete, setLevelIncomplete],
  )

  const baseRows = baseQ.data?.rows
  const rankOptions = useMemo(() => optionCounts(baseRows, r => [r.rank]), [baseRows])
  const trackOptions = useMemo(
    () => optionCounts(baseRows, r => r.tracks.map(t => t.track)),
    [baseRows],
  )
  const dutyOptions = useMemo(
    () => optionCounts(baseRows, r => r.duties.map(d => d.duty)),
    [baseRows],
  )
  const functAreaOptions = useMemo(
    () => optionCounts(baseRows, r => r.duties.flatMap(d => (d.functArea !== null ? [d.functArea] : []))),
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

  const chipsByLevel = useMemo(() => {
    const m = new Map<SeniorLevelId, { complete: number; incomplete: number }>()
    for (const chip of filteredQ.data?.levelChips ?? []) {
      m.set(chip.level, { complete: chip.complete, incomplete: chip.incomplete })
    }
    return m
  }, [filteredQ.data])

  const columns = useMemo((): Column<SeniorRow>[] => {
    return [
      {
        key: 'member',
        header: 'Member',
        render: r => (
          <div data-testid={`senior-row-${r.capid}`}>
            <div className="font-bold text-slate-900">
              {r.nameLast}, {r.nameFirst}
            </div>
            <div className="text-xs text-slate-500">
              {r.rank} <span className="text-slate-300">|</span> #{r.capid}
            </div>
            <div className="max-w-[220px] truncate text-xs text-slate-400" title={unitNameOf(r.orgid)}>
              {unitNameOf(r.orgid)}
            </div>
          </div>
        ),
        sortValue: r => `${r.nameLast}, ${r.nameFirst}`,
      },
      {
        key: 'level',
        header: 'ET Level',
        align: 'center',
        render: r => (
          <div>
            <LevelDots row={r} />
            {r.currentLevel !== null && (
              <div className="mt-1 text-center text-[10px] font-semibold text-slate-500">
                {r.currentLevel}
              </div>
            )}
          </div>
        ),
        sortValue: r => r.currentLevel,
      },
      {
        key: 'tracks',
        header: 'Specialty Tracks',
        render: r => (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {r.tracks.length === 0 && <span className="text-xs italic text-slate-400">None</span>}
            {r.tracks.map((t, i) => {
              const warn = trackLacksDuty(t, r.duties)
              return (
                <Badge
                  key={`${t.track}-${i}`}
                  tone={
                    t.trackLevel === 'MASTER'
                      ? 'indigo'
                      : t.trackLevel === 'SENIOR'
                        ? 'blue'
                        : t.trackLevel === 'TECHNICIAN'
                          ? 'green'
                          : 'slate'
                  }
                  title={`${t.track} (${t.trackLevel})${warn ? ' - enrolled with no matching duty' : ''}`}
                >
                  {warn && <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden />}
                  {t.track}
                </Badge>
              )
            })}
          </div>
        ),
      },
      {
        key: 'duties',
        header: 'Duty Assignments',
        render: r => (
          <div className="flex max-w-[280px] flex-wrap gap-1">
            {r.duties.length === 0 && <span className="text-xs italic text-slate-400">None</span>}
            {r.duties.map((d, i) => {
              const warn = dutyLacksTrack(d.functArea, r.tracks)
              const crossUnit = d.heldAtOrgid !== r.orgid
              return (
                <Badge
                  key={`${d.duty}-${i}`}
                  tone={crossUnit ? 'blue' : 'slate'}
                  title={`${d.duty}${d.asst ? ' (Assistant)' : ''}${
                    crossUnit ? ` - cross-unit at ${unitNameOf(d.heldAtOrgid)}` : ''
                  }${warn && d.functArea !== null ? ` - missing track: ${d.functArea}` : ''}`}
                >
                  {warn && <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden />}
                  {d.duty}
                  {d.asst ? ' (A)' : ''}
                </Badge>
              )
            })}
          </div>
        ),
      },
      {
        key: 'promotion',
        header: 'Promotion',
        render: r =>
          r.promotable ? (
            <Badge tone="green" title={PROMOTABLE_TOOLTIP}>
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Promotable
            </Badge>
          ) : r.promotion !== null ? (
            <div className="text-xs text-slate-600">
              <div>Next: {r.promotion.nextRank}</div>
              {r.promotableOn !== null && (
                <div className="text-slate-400">Eligible {fmtDate(r.promotableOn)}</div>
              )}
            </div>
          ) : (
            <span className="text-xs italic text-slate-400">N/A</span>
          ),
        sortValue: r => (r.promotable ? 1 : 0),
        align: 'center',
      },
      {
        key: 'es',
        header: 'ES',
        render: r => {
          const c = r.esCounts
          const total = c.active + c.training + c.expired + c.notApproved
          if (total === 0 && r.esExpiringCount === 0) {
            return <span className="text-xs italic text-slate-400">None</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {c.active > 0 && <Badge tone="green">{c.active} active</Badge>}
              {c.training > 0 && <Badge tone="blue">{c.training} training</Badge>}
              {c.expired > 0 && <Badge tone="red">{c.expired} expired</Badge>}
              {r.esExpiringCount > 0 && <Badge tone="amber">{r.esExpiringCount} expiring</Badge>}
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Senior Dashboard"
        subtitle="Education and training, promotion readiness, duty coverage"
      />

      {orgsQ.error && (
        <Banner kind="error">Could not load the unit tree: {orgsQ.error.message}</Banner>
      )}
      {filteredQ.error && (
        <Banner kind="error">
          Could not load seniors for org {orgid}: {filteredQ.error.message}
        </Banner>
      )}

      <Card padded>
        <div className="flex flex-wrap items-center gap-2" data-testid="senior-filter-bar">
          <span className="text-xs font-bold uppercase text-slate-500">Filters:</span>
          <span data-testid="filter-rank-category">
            <FilterMenu
              label="Rank Category"
              options={RANK_CATEGORY_OPTIONS}
              selected={rankCategories}
              onChange={setRankCategories}
            />
          </span>
          <span data-testid="filter-rank">
            <FilterMenu label="Specific Rank" options={rankOptions} selected={ranks} onChange={setRanks} />
          </span>
          <span data-testid="filter-track-level">
            <FilterMenu
              label="Track Level"
              options={TRACK_LEVEL_OPTIONS}
              selected={trackLevels}
              onChange={setTrackLevels}
            />
          </span>
          <span data-testid="filter-track">
            <FilterMenu
              label="Specific Track"
              options={trackOptions}
              selected={tracks}
              onChange={setTracks}
              searchable
            />
          </span>
          <span data-testid="filter-funct-area">
            <FilterMenu
              label="Functional Area"
              options={functAreaOptions}
              selected={functAreas}
              onChange={setFunctAreas}
            />
          </span>
          <span data-testid="filter-duty">
            <FilterMenu
              label="Duty Position"
              options={dutyOptions}
              selected={duties}
              onChange={setDuties}
              searchable
            />
          </span>
          <span data-testid="filter-duty-asst">
            <FilterMenu
              label="Assignment Type"
              options={DUTY_ASST_OPTIONS}
              selected={dutyAsst}
              onChange={setDutyAsst}
            />
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              data-testid="senior-filter-reset"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Reset all ({activeFilterCount})
            </button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="senior-tiles">
        <div data-testid="seniors-tile-total">
          <StatTile
            label="Total"
            value={filteredQ.isPending ? '...' : (data?.total ?? 0)}
            icon={Users}
            accent="blue"
            sublabel="Seniors in scope"
          />
        </div>
        <div data-testid="seniors-tile-showing">
          <StatTile
            label="Seniors"
            value={filteredQ.isPending ? '...' : (data?.rows.length ?? 0)}
            icon={UsersRound}
            accent="indigo"
            sublabel={activeFilterCount > 0 ? 'Matching filters' : 'All in scope'}
          />
        </div>
        <div title={PROMOTABLE_TOOLTIP} data-testid="seniors-tile-promotable">
          <button
            type="button"
            onClick={() => setPromotable(!promotable)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
              promotable
                ? 'border-green-400 bg-green-50'
                : 'border-slate-200 bg-white hover:border-green-300',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Award className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                Promotable {promotable && <CheckCircle2 className="inline h-3 w-3 text-green-600" aria-hidden />}
              </div>
              <div className="text-2xl font-bold leading-tight text-green-700">
                {filteredQ.isPending ? '...' : (data?.promotableCount ?? 0)}
              </div>
              <div className="truncate text-xs text-slate-500">Click to filter</div>
            </div>
          </button>
        </div>
        <Card padded className="flex items-center" data-testid="senior-level-chips">
          <div className="w-full">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              E&T Levels
            </div>
            <div className="flex items-center gap-2">
              {LEVEL_META.map(meta => {
                const chip = chipsByLevel.get(meta.id)
                const mode =
                  levelComplete === meta.id
                    ? 'complete'
                    : levelIncomplete === meta.id
                      ? 'incomplete'
                      : null
                const count = mode === 'incomplete' ? (chip?.incomplete ?? 0) : (chip?.complete ?? 0)
                return (
                  <button
                    key={meta.id}
                    type="button"
                    data-testid={`senior-level-chip-${meta.id}`}
                    onClick={() => cycleLevelFilter(meta.id)}
                    title={`${meta.name}: ${chip?.complete ?? 0} complete, ${chip?.incomplete ?? 0} incomplete. Click to filter complete; click again for incomplete.`}
                    className="group flex flex-col items-center"
                  >
                    <span
                      className={clsx(
                        'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm transition-all group-hover:opacity-90',
                        mode === 'complete'
                          ? 'bg-green-600 ring-2 ring-green-300'
                          : mode === 'incomplete'
                            ? 'bg-amber-500 ring-2 ring-amber-300'
                            : 'bg-slate-500',
                      )}
                    >
                      {count}
                    </span>
                    <span className="mt-0.5 text-[9px] font-bold text-slate-400 group-hover:text-slate-600">
                      L{meta.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      {filteredQ.isPending && orgid !== null ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading senior roster..." />
        </div>
      ) : (
        data !== undefined && (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={r => r.capid}
            onRowClick={r => setProfileCapid(r.capid)}
            initialSort={{ key: 'member', dir: 'asc' }}
            maxHeight="70vh"
            empty={
              <EmptyState
                icon={Users}
                title="No senior members match"
                message={
                  activeFilterCount > 0
                    ? 'The active filters exclude every senior member in this scope.'
                    : 'This scope has no senior members.'
                }
                diagnostic={`GET /api/orgs/${orgid}/seniors${filterSearch !== '' ? `?${filterSearch}` : ''} returned ${data.total} in scope, 0 after filters`}
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
