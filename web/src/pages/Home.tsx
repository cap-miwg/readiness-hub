import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { MyProgressMember, MyProgressResponse } from '@shared/contracts'
import { ApiError, APP_NAME_FALLBACK, useMe, useMeta } from '../api/client'
import { BUILD_VERSION } from '../components/Layout'
import { Banner, Figure, Spinner, VerdictMark } from '../components/ui'
import { CHANGELOG_URL, WHATS_NEW } from '../features/home/changelog'
import {
  bandWordOf,
  dateTimeShort,
  dayMonthLong,
  dayMonthShort,
  firstNameOf,
  fullDateLong,
  greetingFor,
  humanizeCron,
  longDate,
} from '../features/home/format'
import { useAnnouncements, useMyProgress, useUnitFindings } from '../features/home/useHomeData'
import { overviewPath, useEffectiveScope, useOverview } from '../features/overview/useOverviewData'
import { orgScopeSearch } from '../lib/urlState'

/*
 * Home, the platform page (V2-DESIGN-PLAN.md section 5; mockups/quiet-
 * authority/home.html): the mirror before the telescope. Greeting, My
 * Progress (D11), My Unit with a one-line verdict, announcements beside
 * build-time release notes, the three-fact data panel, version and GitHub
 * in the footer. Nothing here replicates Unit Overview; the My Unit card
 * states a verdict and leaves.
 */

const REPO_URL = 'https://github.com/cap-miwg/readiness-hub'

const linkClass = 'font-medium text-symbol hover:underline'

/** Hairline-opened section with a kicker label and an optional right link. */
function HomeSection({
  id,
  label,
  link,
  testid,
  children,
}: {
  id: string
  label: string
  link?: ReactNode
  testid?: string
  children: ReactNode
}) {
  const labelId = `home-${id}-label`
  return (
    <section
      className="mt-12 border-t border-hairline pt-5"
      aria-labelledby={labelId}
      data-testid={testid}
    >
      <div className="mb-4 flex items-baseline gap-3">
        <p id={labelId} className="kicker text-ink">
          {label}
        </p>
        {link !== undefined && <span className="ml-auto shrink-0 text-[13px]">{link}</span>}
      </div>
      {children}
    </section>
  )
}

/** The quiet numeral strip: single column on phones, hairline-divided row up. */
function FigureStrip({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 grid gap-y-6 sm:grid-cols-3 sm:divide-x sm:divide-hairline">
      {children}
    </div>
  )
}

const figureCell = 'min-w-0 sm:px-6 sm:first:pl-0'

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-ink">{label}</span>
      <span className="tnum text-right text-ink">{value}</span>
    </div>
  )
}

/** Matched My Progress body: sentence, figures, watch marks, checklist. */
function ProgressCard({ progress }: { progress: MyProgressResponse }) {
  const figures = progress.figures.slice(0, 3)
  const watchQuals = (progress.expiringQuals ?? []).filter(
    q => q.daysUntil !== null && q.daysUntil <= 90,
  )
  const checklist = progress.checklist ?? []
  return (
    <div>
      {progress.nextAction !== undefined && (
        <p className="max-w-[58ch] text-[16px] leading-relaxed text-ink" data-testid="home-progress-next-action">
          {progress.nextAction}
        </p>
      )}
      {figures.length > 0 && (
        <FigureStrip>
          {figures.map(f => (
            <Figure
              key={f.label}
              className={figureCell}
              value={f.value}
              label={f.label}
              delta={f.caption}
            />
          ))}
        </FigureStrip>
      )}
      {watchQuals.length > 0 && (
        <div className="mt-6">
          <p className="kicker text-ink">Expiring qualifications</p>
          <ul className="mt-2 space-y-1.5">
            {watchQuals.map(q => (
              <li key={q.qualification}>
                <VerdictMark
                  kind="watch"
                  label={
                    <span className="tnum text-sm">
                      {q.qualification}, expires{' '}
                      {q.expiration !== null ? dayMonthShort(q.expiration) : 'within 90 days'}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {checklist.length > 0 && (
        <div className="mt-8">
          <p className="kicker text-ink">Requirement checklist</p>
          <ul className="mt-1.5 max-w-[640px]">
            {checklist.map((item, i) => (
              <li
                key={`${i}-${item.label}`}
                className="flex items-start gap-3 border-b border-hairline py-2.5 text-sm last:border-b-0"
              >
                <span className="flex w-4 shrink-0 justify-center pt-0.5" aria-hidden>
                  {item.done ? (
                    <Check className="h-4 w-4 text-symbol" />
                  ) : (
                    <span className="mt-1 h-2.5 w-2.5 rounded-full border border-muted" />
                  )}
                </span>
                <span className="sr-only">{item.done ? 'Done:' : 'Pending:'} </span>
                <span className="min-w-0 flex-1 text-ink">{item.label}</span>
                <span
                  className={`tnum shrink-0 whitespace-nowrap text-[13px] ${item.done ? 'text-ink2' : 'text-ink'}`}
                >
                  {item.detail ?? (item.done ? 'Done' : 'Pending')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Graceful non-match (D11): a quiet hint, never a guess. */
function UnmatchedHint() {
  return (
    <div data-testid="home-progress-unmatched">
      <p className="max-w-[62ch] text-[15px] text-ink">
        Your sign-in address could not be matched to a member record.
      </p>
      <p className="mt-2 max-w-[62ch] text-sm text-ink2">
        CAPID mailboxes match automatically; other addresses match only when they are the primary
        email on exactly one member record. Records are corrected in eServices and appear here
        with the next extract.
      </p>
    </div>
  )
}

export default function Home() {
  const meQ = useMe()
  const metaQ = useMeta()
  const progressQ = useMyProgress()
  const announcementsQ = useAnnouncements()
  const { orgid: scopeOrgid, resolving, orgsError } = useEffectiveScope()

  const me = meQ.data
  const meta = metaQ.data
  const progress = progressQ.data
  const member: MyProgressMember | undefined =
    progress?.matched === true ? progress.member : undefined

  // My Unit scope: the member's own unit when matched, else the URL scope
  // (self scope either way; the figures describe one unit, not a subtree).
  // A matched member homed on the Unassigned pseudo-node (-1) has no real
  // unit to describe, so that case falls back to the URL scope too.
  const memberOrgid = member !== undefined && member.orgid >= 0 ? member.orgid : null
  const unitOrgid = memberOrgid ?? (progressQ.isPending ? null : scopeOrgid)
  const overviewQ = useOverview(unitOrgid, false)
  const findingsQ = useUnitFindings(unitOrgid)
  const overview = overviewQ.data

  const now = new Date()
  const first = me !== undefined ? firstNameOf(me.name, me.email) : ''
  const greeting = `${greetingFor(now.getHours())}${first !== '' ? `, ${first}` : ''}.`
  const kickerLine = [
    longDate(now),
    meta?.downloadDate ? `Figures as of the ${dayMonthLong(meta.downloadDate)} extract` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const loadError = (memberOrgid === null ? orgsError : null) ?? overviewQ.error ?? null
  const noDataset = loadError instanceof ApiError && loadError.status === 404
  const unitPending =
    progressQ.isPending || resolving || (unitOrgid !== null && overviewQ.isPending)
  const unitSearch =
    unitOrgid !== null ? orgScopeSearch({ orgid: unitOrgid, descendants: false }) : ''

  const findings = findingsQ.data?.findings
  const announcements = announcementsQ.data?.announcements ?? []

  const sustainability = overview?.orgStats?.metrics.sustainability ?? null

  const appName = meta?.appName || APP_NAME_FALLBACK
  const nextExpected =
    metaQ.isPending || meta === undefined
      ? '...'
      : meta.ingestSchedule !== null
        ? (humanizeCron(meta.ingestSchedule) ?? `On schedule ${meta.ingestSchedule}`)
        : 'Manual ingest only'

  return (
    <div>
      <section aria-label="Greeting" data-testid="home-greeting" className="pt-4">
        <p className="kicker tnum text-ink2">{kickerLine}</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight text-ink max-sm:text-[26px]">
          {greeting}
        </h1>
      </section>

      {loadError !== null && (
        <Banner kind={noDataset ? 'warn' : 'error'} className="mt-6">
          {noDataset
            ? `No dashboard data yet: ${loadError.message}. An admin can run the first CAPWATCH ingest from the Admin page.`
            : `Could not load unit stats${unitOrgid !== null ? ` from ${overviewPath(unitOrgid, false)}` : ' (unit list unavailable)'}: ${loadError.message}`}
        </Banner>
      )}

      <HomeSection
        id="progress"
        label="My progress"
        testid="home-progress"
        link={
          member !== undefined ? (
            <Link
              to={{
                pathname: member.scope === 'cadet' ? '/cadets' : '/seniors',
                search: orgScopeSearch({ orgid: member.orgid, descendants: false }),
              }}
              className={linkClass}
              data-testid="home-progress-full-record"
            >
              Full record
            </Link>
          ) : undefined
        }
      >
        {progressQ.isPending ? (
          <Spinner label="Loading your record..." />
        ) : progressQ.error ? (
          <p className="max-w-[62ch] text-sm text-ink2">
            My Progress could not load ({progressQ.error.message}).
          </p>
        ) : progress !== undefined && progress.matched && member !== undefined ? (
          <ProgressCard progress={progress} />
        ) : (
          <UnmatchedHint />
        )}
      </HomeSection>

      <HomeSection
        id="unit"
        label="My unit"
        testid="home-unit"
        link={
          unitOrgid !== null ? (
            <Link
              to={{ pathname: '/unit', search: unitSearch }}
              className={linkClass}
              data-testid="home-hero-unit"
            >
              Open Unit Overview
            </Link>
          ) : undefined
        }
      >
        {unitPending ? (
          <Spinner label="Loading unit figures..." />
        ) : overview !== undefined ? (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">
                {overview.org.name}
              </h2>
              <span className="tnum text-[13px] text-ink2">
                {overview.org.unitLabel} · {overview.org.type}
              </span>
            </div>
            {overview.meetingLine != null && overview.meetingLine !== '' && (
              <p className="mt-1.5 text-sm text-ink" data-testid="home-unit-meeting">
                {overview.meetingLine}
              </p>
            )}
            {findings !== undefined && (
              <p className="mt-2 max-w-[62ch] text-[15px] text-ink" data-testid="home-unit-verdict">
                {findings.length === 0 ? (
                  'Broadly healthy; everything reads clean.'
                ) : (
                  <>
                    <Link
                      to={{ pathname: '/unit', search: unitSearch }}
                      className={linkClass}
                      data-testid="home-unit-findings"
                    >
                      {findings.length} finding{findings.length === 1 ? '' : 's'}{' '}
                      {findings.length === 1 ? 'needs' : 'need'} attention
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
            <FigureStrip>
              <Figure
                className={figureCell}
                value={overview.totals.members.toLocaleString()}
                label="Members"
              />
              <Figure
                className={figureCell}
                value={sustainability !== null ? String(sustainability.overallScore) : '--'}
                band={bandWordOf(sustainability?.rating)}
                label="Sustainability"
              />
              <Figure
                className={figureCell}
                value={String(overview.es.readinessScore)}
                band={bandWordOf(overview.es.readinessRating)}
                label="ES readiness"
              />
            </FigureStrip>
          </div>
        ) : null}
      </HomeSection>

      <section className="mt-12 border-t border-hairline pt-5" aria-label="Platform">
        <div className="grid gap-10 md:grid-cols-2 md:gap-14">
          <div data-testid="home-announcements">
            <p className="kicker text-ink">Announcements</p>
            <div className="mt-4">
              {announcementsQ.isPending ? null : announcementsQ.error ? (
                <p className="text-sm text-ink2">Announcements are unavailable right now.</p>
              ) : announcements.length === 0 ? (
                <p className="text-sm text-ink2">No announcements.</p>
              ) : (
                <ul>
                  {announcements.map(a => (
                    <li key={a.id} className="border-b border-hairline py-3 first:pt-0 last:border-b-0">
                      <p className="kicker text-ink2">
                        <span className="tnum">{dayMonthShort(a.createdAt)}</span> ·{' '}
                        <span className="normal-case">{a.authorEmail}</span>
                      </p>
                      <p className="mt-1 text-[15px] font-medium text-ink">{a.title}</p>
                      <p className="mt-0.5 max-w-[52ch] whitespace-pre-line text-sm text-ink">
                        {a.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div data-testid="home-whats-new">
            <p className="kicker text-ink">What&rsquo;s new</p>
            <div className="mt-4">
              {WHATS_NEW.length === 0 ? (
                <p className="text-sm text-ink2">No release notes yet.</p>
              ) : (
                <ul>
                  {WHATS_NEW.map((e, i) => (
                    <li key={i} className="border-b border-hairline py-3 first:pt-0 last:border-b-0">
                      <p className="kicker text-ink2">
                        <span className="tnum">{e.version}</span>
                        {e.area !== '' && <> · {e.area}</>}
                      </p>
                      <p className="mt-1 max-w-[52ch] text-sm text-ink">{e.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={CHANGELOG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-3.5 inline-block text-[13px] ${linkClass}`}
              >
                Full changelog
              </a>
            </div>
          </div>
        </div>
      </section>

      <HomeSection id="data" label="About the data" testid="home-about-data">
        <div className="max-w-[640px]">
          <FactRow
            label="Current extract"
            value={
              metaQ.isPending
                ? '...'
                : meta?.downloadDate
                  ? fullDateLong(meta.downloadDate)
                  : 'No extract ingested yet'
            }
          />
          <FactRow
            label="Ingested"
            value={
              metaQ.isPending ? '...' : meta?.lastIngestAt ? dateTimeShort(meta.lastIngestAt) : 'Never'
            }
          />
          <FactRow label="Next expected" value={nextExpected} />
        </div>
        <p className="mt-4 max-w-[68ch] text-sm text-ink2">
          The Hub is read only. Records are corrected in eServices and appear here with the next
          extract.
        </p>
      </HomeSection>

      <footer className="mt-16 flex flex-wrap items-baseline justify-between gap-4 border-t border-hairline pt-5 text-xs text-ink2">
        <span className="tnum" data-testid="home-version">
          {appName} v{meta?.appVersion ?? BUILD_VERSION}
        </span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
          View source on GitHub
        </a>
      </footer>
    </div>
  )
}
