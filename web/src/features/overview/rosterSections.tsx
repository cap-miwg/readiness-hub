import { Link } from 'react-router-dom'
import type { CadetsResponse, SeniorLevelId, SeniorsResponse } from '@shared/contracts'
import { VerdictMark } from '../../components/ui'
import { FactLedger, FactRow, FiguresStrip, fmtDate, plural } from './overviewShared'

/*
 * The three roster-fed Unit Overview sections (mockup unit-overview.html:
 * Cadet Program, Professional Development, Personnel and Expirations), built
 * client-side from the same /cadets and /seniors payloads the dashboards
 * consume. Collapsed headers keep the hard budget: one number, one word, one
 * alert mark. All derivations are pure and exported for tests.
 */

function scopeSearch(orgid: number, descendants: boolean): string {
  return `?orgid=${orgid}${descendants ? '&descendants=1' : ''}`
}

const DAY_MS = 86_400_000

/** ISO yyyy-mm-dd to UTC-midnight epoch ms; null when absent or unparseable. */
function dayMs(iso: string | null): number | null {
  if (iso === null) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

// --- Cadet Program ---

export interface CadetProgramRollup {
  /** state READY: fully ready, awaiting a promotion board. */
  ready: number
  /** state TIME_PENDING: requirements done, time in grade still running. */
  tigPending: number
  /** Nearest future TIG completion date among TIME_PENDING cadets (ISO). */
  tigNearest: string | null
  /** Cadets whose Healthy Fitness Zone credit has lapsed (blocked). */
  hfzExpired: number
  /** Everyone still working requirements (nearly ready / in progress / not started). */
  inProgress: number
}

export function cadetProgramRollup(
  rows: CadetsResponse['rows'],
  nowMs: number,
): CadetProgramRollup {
  let ready = 0
  let tigPending = 0
  let tigNearest: string | null = null
  let hfzExpired = 0
  let inProgress = 0
  for (const row of rows) {
    if (row.state === 'READY') ready++
    else if (row.state === 'TIME_PENDING') {
      tigPending++
      const tigIso = row.tigCompleteOn
      const tig = dayMs(tigIso)
      // Nearest upcoming date only; today counts (UTC midnight vs. now).
      if (
        tigIso !== null &&
        tig !== null &&
        tig >= nowMs - DAY_MS &&
        (tigNearest === null || tigIso < tigNearest)
      ) {
        tigNearest = tigIso
      }
    } else if (row.state === 'NEARLY_READY' || row.state === 'IN_PROGRESS' || row.state === 'NOT_STARTED') {
      inProgress++
    }
    const hfz = dayMs(row.hfzValidUntil)
    if (hfz !== null && hfz < nowMs) hfzExpired++
  }
  return { ready, tigPending, tigNearest, hfzExpired, inProgress }
}

export function CadetProgramBody({
  cadets,
  rollup,
  orgid,
  descendants,
}: {
  cadets: CadetsResponse
  rollup: CadetProgramRollup
  orgid: number
  descendants: boolean
}) {
  const phases = cadets.tiles.phases
  const phaseLine = ['1', '2', '3', '4']
    .map(p => `Phase ${p} ${phases[p] ?? 0}`)
    .join(' · ')
  return (
    <div className="space-y-6" data-testid="cadet-program-section">
      <FactLedger>
        <FactRow label="Ready for promotion">
          {rollup.ready > 0
            ? `${rollup.ready} ${plural(rollup.ready, 'cadet')} awaiting a promotion board`
            : 'None awaiting a board'}
        </FactRow>
        <FactRow label="Time in grade pending">
          {rollup.tigPending > 0 ? (
            <>
              {`${rollup.tigPending} ${plural(rollup.tigPending, 'cadet')}`}
              {rollup.tigNearest !== null && (
                <span className="text-ink2">nearest eligible {fmtDate(rollup.tigNearest)}</span>
              )}
            </>
          ) : (
            'None'
          )}
        </FactRow>
        <FactRow label="Healthy Fitness Zone lapsed">
          {rollup.hfzExpired > 0 ? (
            <VerdictMark
              kind="watch"
              label={`${rollup.hfzExpired} ${plural(rollup.hfzExpired, 'cadet')} blocked by expired HFZ credit`}
            />
          ) : (
            'None'
          )}
        </FactRow>
        <FactRow label="Working requirements">
          {`${rollup.inProgress} ${plural(rollup.inProgress, 'cadet')} in progress toward the next achievement`}
        </FactRow>
        <FactRow label="Phase distribution">{phaseLine}</FactRow>
      </FactLedger>
      <Link
        to={`/cadets${scopeSearch(orgid, descendants)}`}
        className="inline-block text-sm font-medium text-symbol hover:underline"
        data-testid="cadet-program-open-dashboard"
      >
        Open Cadet Dashboard
      </Link>
    </div>
  )
}

// --- Professional Development ---

/** Seniors with any Education and Training level pending approval (path credit status 26). */
export function awaitingApprovalCount(rows: SeniorsResponse['rows']): number {
  let n = 0
  for (const row of rows) {
    const lp = row.levelProgress
    if (lp !== null && Object.values(lp).some(level => level.status === 'pending')) n++
  }
  return n
}

const LEVEL_LABEL: Record<SeniorLevelId, string> = {
  L1: 'Level 1',
  L2P1: 'Level 2 Part 1',
  L2P2: 'Level 2 Part 2',
  L3: 'Level 3',
  L4: 'Level 4',
  L5: 'Level 5',
}

export function PdBody({
  seniors,
  awaiting,
  orgid,
  descendants,
}: {
  seniors: SeniorsResponse
  awaiting: number
  orgid: number
  descendants: boolean
}) {
  return (
    <div className="space-y-6" data-testid="pd-section">
      <FactLedger>
        {seniors.levelChips.map(chip => (
          <FactRow key={chip.level} label={LEVEL_LABEL[chip.level]}>
            {`${chip.complete} of ${chip.complete + chip.incomplete} complete`}
          </FactRow>
        ))}
        <FactRow label="Awaiting approval">
          {awaiting > 0 ? (
            <VerdictMark
              kind="plan"
              label={`${awaiting} completed ${plural(awaiting, 'level awaits', 'levels await')} approval in eServices`}
            />
          ) : (
            'None'
          )}
        </FactRow>
      </FactLedger>
      <Link
        to={`/seniors${scopeSearch(orgid, descendants)}`}
        className="inline-block text-sm font-medium text-symbol hover:underline"
        data-testid="pd-open-dashboard"
      >
        Open Senior Dashboard
      </Link>
    </div>
  )
}

// --- Personnel and Expirations ---

export interface ExpirationBuckets {
  /** Expires today through 30 days out. */
  in30: number
  /** Expires 31 through 60 days out. */
  in60: number
  /** Expires 61 through 90 days out. */
  in90: number
}

/** 30/60/90-day membership-expiration buckets over ISO expiration dates. */
export function expirationBuckets(
  expirations: readonly (string | null)[],
  nowMs: number,
): ExpirationBuckets {
  const buckets: ExpirationBuckets = { in30: 0, in60: 0, in90: 0 }
  for (const iso of expirations) {
    const t = dayMs(iso)
    if (t === null) continue
    const days = Math.ceil((t - nowMs) / DAY_MS)
    if (days < 0) continue
    if (days <= 30) buckets.in30++
    else if (days <= 60) buckets.in60++
    else if (days <= 90) buckets.in90++
  }
  return buckets
}

/** The header count: memberships expiring within 60 days across both rosters. */
export function expiringSoonCount(buckets: ExpirationBuckets): number {
  return buckets.in30 + buckets.in60
}

export function PersonnelBody({
  buckets,
  orgid,
  descendants,
}: {
  buckets: ExpirationBuckets
  orgid: number
  descendants: boolean
}) {
  return (
    <div className="space-y-6" data-testid="personnel-section">
      <FiguresStrip
        size="sm"
        figures={[
          { label: 'Within 30 days', value: buckets.in30, testid: 'personnel-expiring-30' },
          { label: '31 to 60 days', value: buckets.in60, testid: 'personnel-expiring-60' },
          { label: '61 to 90 days', value: buckets.in90, testid: 'personnel-expiring-90' },
        ]}
      />
      <p className="max-w-[62ch] text-xs text-ink2">
        Membership expirations across the senior and cadet rosters in this scope. Renewals are
        processed in eServices and appear here with the next extract.
      </p>
      <Link
        to={`/reports?report=membership-lapse&orgid=${orgid}${descendants ? '&descendants=1' : ''}`}
        className="inline-block text-sm font-medium text-symbol hover:underline"
        data-testid="personnel-open-renewal-report"
      >
        Open renewal report
      </Link>
    </div>
  )
}
