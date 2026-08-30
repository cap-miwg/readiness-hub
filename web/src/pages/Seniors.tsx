import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Users } from 'lucide-react'
import type {
  OrgTreeNode,
  SeniorLevelId,
  SeniorRow,
  SeniorsResponse,
} from '@shared/contracts'
import { apiFetch, useOrgs, type ApiError } from '../api/client'
import { useFlagParam, useListParam, useOrgScope, useStringParam } from '../lib/urlState'
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
  LEVEL_META,
  etLevelLine,
  fmtDate,
  optionCounts,
  primaryDutyOf,
  primaryTrackOf,
  seniorDiscrepancyOf,
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

/** Word-cased track level for the muted qualifier ("Master"). */
function trackLevelWord(level: string): string {
  const t = level.trim()
  if (t === '') return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
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
        render: r => {
          const charter = charterOfOrg(r.orgid)
          return (
            <div data-testid={`senior-row-${r.capid}`}>
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
        key: 'level',
        header: 'E&T Level',
        render: r => (
          <span className={clsx('text-sm', r.currentLevel !== null ? 'text-ink' : 'text-ink2')}>
            {etLevelLine(r.currentLevel, r.levelProgress)}
          </span>
        ),
        sortValue: r => r.currentLevel,
      },
      {
        key: 'tracks',
        header: 'Specialty Track',
        render: r => {
          const primary = primaryTrackOf(r.tracks)
          if (primary === null) return <span className="text-xs text-ink2">None</span>
          const more = r.tracks.length - 1
          return (
            <div
              className="text-sm text-ink"
              title={r.tracks.map(t => `${t.track} (${t.trackLevel})`).join(', ')}
            >
              {primary.track}
              {primary.trackLevel !== 'NONE' && (
                <span className="ml-1.5 text-xs text-ink2">{trackLevelWord(primary.trackLevel)}</span>
              )}
              {more > 0 && <span className="ml-1.5 text-xs text-ink2">+{more} more</span>}
            </div>
          )
        },
      },
      {
        key: 'duties',
        header: 'Duty',
        render: r => {
          const primary = primaryDutyOf(r.duties)
          const discrepancy = seniorDiscrepancyOf(r)
          if (primary === null) {
            return (
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-xs text-ink2">None</span>
                {discrepancy !== null && (
                  <span title={discrepancy}>
                    <VerdictMark kind="watch" label="Gap" className="text-xs" />
                  </span>
                )}
              </div>
            )
          }
          const more = r.duties.length - 1
          const crossUnit = primary.heldAtOrgid !== r.orgid
          return (
            <div
              className="flex flex-wrap items-center gap-x-2 text-sm text-ink"
              title={r.duties
                .map(
                  d =>
                    `${d.duty}${d.asst ? ' (A)' : ''}${
                      d.heldAtOrgid !== r.orgid ? ` - cross-unit at ${unitNameOf(d.heldAtOrgid)}` : ''
                    }`,
                )
                .join(', ')}
            >
              <span>
                {primary.duty}
                {primary.asst ? ' (A)' : ''}
                {crossUnit && <span className="ml-1.5 text-xs text-symbol">cross-unit</span>}
                {more > 0 && <span className="ml-1.5 text-xs text-ink2">+{more}</span>}
              </span>
              {discrepancy !== null && (
                <span title={discrepancy}>
                  <VerdictMark kind="watch" label="Gap" className="text-xs" />
                </span>
              )}
            </div>
          )
        },
      },
      {
        key: 'promotion',
        header: 'Promotion',
        render: r =>
          r.promotable ? (
            <span
              className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-symbol"
              title={PROMOTABLE_TOOLTIP}
            >
              Promotable
            </span>
          ) : r.promotion !== null ? (
            <div className="text-xs text-ink2">
              <div className="text-ink">Next: {r.promotion.nextRank}</div>
              {r.promotableOn !== null && <div className="tnum">Eligible {fmtDate(r.promotableOn)}</div>}
            </div>
          ) : (
            <span className="text-xs text-ink2">-</span>
          ),
        sortValue: r => (r.promotable ? 1 : 0),
      },
      {
        key: 'es',
        header: 'ES',
        render: r => {
          const c = r.esCounts
          const parts: string[] = []
          if (c.active > 0) parts.push(`${c.active} active`)
          if (c.training > 0) parts.push(`${c.training} training`)
          if (c.expired > 0) parts.push(`${c.expired} expired`)
          if (parts.length === 0 && r.esExpiringCount === 0) {
            return <span className="text-xs text-ink2">-</span>
          }
          return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {parts.length > 0 && <span className="tnum text-xs text-ink2">{parts.join(' · ')}</span>}
              {r.esExpiringCount > 0 && (
                <VerdictMark
                  kind="watch"
                  label={<span className="tnum text-xs">{r.esExpiringCount} expiring</span>}
                />
              )}
            </div>
          )
        },
        sortValue: r => r.esCounts.active,
      },
    ]
  }, [unitNameOf, charterOfOrg])

  if (orgsQ.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading units..." />
      </div>
    )
  }

  const data = filteredQ.data
  const pendingValue = filteredQ.isPending ? '...' : null

  return (
    <div className="space-y-5">
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

      <div
        className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3"
        data-testid="senior-filter-bar"
      >
        <span className="kicker mr-1 text-ink">Filters</span>
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
            className="tnum text-sm font-medium text-symbol hover:underline"
          >
            Reset all ({activeFilterCount})
          </button>
        )}
      </div>

      <FigureStrip
        className="md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)]"
        data-testid="senior-tiles"
      >
        <FigureCell data-testid="seniors-tile-total">
          <Figure
            value={pendingValue ?? (data?.total ?? 0)}
            label="Total"
            delta="Seniors in scope"
          />
        </FigureCell>
        <FigureCell data-testid="seniors-tile-showing">
          <Figure
            value={pendingValue ?? (data?.rows.length ?? 0)}
            label="Showing"
            delta={activeFilterCount > 0 ? 'Matching filters' : 'All in scope'}
          />
        </FigureCell>
        <FigureCell data-testid="seniors-tile-promotable" title={PROMOTABLE_TOOLTIP}>
          <FigureButton
            value={pendingValue ?? (data?.promotableCount ?? 0)}
            label="Promotable"
            active={promotable}
            onClick={() => setPromotable(!promotable)}
            title={PROMOTABLE_TOOLTIP}
          />
        </FigureCell>
        <FigureCell data-testid="senior-level-chips">
          <div className="flex items-end gap-3">
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
                  className={clsx(
                    'flex flex-col items-center border-b-2 px-0.5 pb-1 transition-colors',
                    mode === 'complete'
                      ? 'border-symbol'
                      : mode === 'incomplete'
                        ? 'border-dashed border-muted'
                        : 'border-transparent hover:border-hairline',
                  )}
                >
                  <span
                    className={clsx(
                      'tnum font-display text-[22px] font-medium leading-none',
                      mode === 'complete' ? 'text-symbol' : mode === 'incomplete' ? 'text-ink2' : 'text-ink',
                    )}
                  >
                    {count}
                  </span>
                  <span className={clsx('kicker mt-1', mode === 'complete' ? 'text-symbol' : 'text-ink2')}>
                    L{meta.label}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="kicker mt-1.5 text-ink">E&T levels</div>
        </FigureCell>
      </FigureStrip>

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
            mobileCard={r => {
              const charter = charterOfOrg(r.orgid)
              return (
                <div data-testid={`senior-card-${r.capid}`}>
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
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
                    <span>{etLevelLine(r.currentLevel, r.levelProgress)}</span>
                    {r.promotable && (
                      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-symbol">
                        Promotable
                      </span>
                    )}
                    {r.esExpiringCount > 0 && (
                      <VerdictMark
                        kind="watch"
                        label={<span className="tnum text-xs">{r.esExpiringCount} ES expiring</span>}
                      />
                    )}
                  </div>
                </div>
              )
            }}
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
