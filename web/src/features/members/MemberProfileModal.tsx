import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  Award,
  BookOpen,
  Briefcase,
  Check,
  Circle,
  HeartPulse,
  Mail,
  ShieldCheck,
  Star,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { MemberProfileResponse } from '@shared/contracts'
import { apiFetch, type ApiError } from '../../api/client'
import { Badge, Banner, Modal, ProgressBar, Spinner, VerdictMark } from '../../components/ui'
import {
  CADET_STATE_META,
  ES_STATUS_KIND,
  LEVEL_META,
  LEVEL_STATUS_META,
  fmtDate,
  type CadetDetailJson,
  type CadetState,
  type EsQualJson,
  type LevelStatusJson,
  type ReqStatusJson,
  type SeniorDetailJson,
  type SeniorPromotionJson,
} from './shared'
import {
  CADET_ACHIEVEMENT_TO_RANK,
  CADET_PHASE_DEFS,
  achievementDisplayName,
  publicAchievementNumber,
} from './cadetAchievements'

/*
 * The member briefing sheet (quiet-authority direction.md section 4): a
 * one-page typeset brief. Hairlines carry the structure, checklists follow
 * the Home grammar (symbol check done, muted circle pending), and color
 * appears only as labeled verdict marks.
 */

const MICRO_LABEL = 'font-display text-[11px] font-semibold uppercase tracking-[0.08em]'

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
        <Icon className="h-4 w-4 text-ink2" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Done-state checkmark or pending circle, the Home checklist grammar. */
function CheckGlyph({ done }: { done: boolean }) {
  return done ? (
    <Check className="mt-0.5 h-4 w-4 shrink-0 text-symbol" aria-hidden />
  ) : (
    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
  )
}

function LevelStatusMark({ status }: { status: LevelStatusJson }) {
  const meta = LEVEL_STATUS_META[status]
  if (status === 'completed') {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-ink', MICRO_LABEL)}>
        <Check className="h-3.5 w-3.5 text-symbol" aria-hidden /> {meta.label}
      </span>
    )
  }
  if (meta.kind === 'neutral') {
    return <span className={clsx('text-ink2', MICRO_LABEL)}>{meta.label}</span>
  }
  return <VerdictMark kind={meta.kind} label={<span className={MICRO_LABEL}>{meta.label}</span>} />
}

function EsStatusMark({ status }: { status: string }) {
  const kind = ES_STATUS_KIND[status] ?? 'neutral'
  if (kind === 'neutral') {
    return <span className={clsx('text-ink', MICRO_LABEL)}>{status}</span>
  }
  return <VerdictMark kind={kind} label={<span className={MICRO_LABEL}>{status}</span>} />
}

function CadetStateMark({ state }: { state: CadetState }) {
  const meta = CADET_STATE_META[state]
  if (meta.kind === 'neutral') {
    return <span className={clsx('text-ink2', MICRO_LABEL)}>{meta.label}</span>
  }
  return <VerdictMark kind={meta.kind} label={<span className={MICRO_LABEL}>{meta.label}</span>} />
}

function HeaderBlock({ m }: { m: MemberProfileResponse }) {
  const unitName = m.detail.senior?.memberUnitName ?? m.detail.cadet?.unitName ?? `Org ${m.orgid}`
  return (
    <div className="border-b border-hairline pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold text-ink">
            {m.rank} {m.nameLast}, {m.nameFirst}
          </div>
          <div className="tnum mt-1 text-sm text-ink2">
            CAPID {m.capid} · {unitName} · {m.memberType}
          </div>
          <div className="tnum mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
            <span>Joined: {fmtDate(m.joined)}</span>
            <span>Expires: {fmtDate(m.expiration)}</span>
            {m.rankDate !== null && <span>Date of rank: {m.rankDate}</span>}
          </div>
        </div>
        {m.age !== null && (
          <div className="text-right">
            <div className="kicker text-ink">Age</div>
            <div className="tnum font-display text-[28px] font-medium leading-tight text-ink">{m.age}</div>
            {/* Exact DOB is admin-gated server side; render only when served. */}
            {m.restricted?.dob != null && (
              <div className="tnum text-xs text-ink2">DOB: {m.restricted.dob}</div>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-hairline pt-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink">
          <Mail className="h-3.5 w-3.5 text-ink2" aria-hidden />
          {m.email !== null ? (
            <a className="text-symbol hover:underline" href={`mailto:${m.email}`}>
              {m.email}
            </a>
          ) : (
            <span className="text-ink2">No email on file</span>
          )}
          {m.doNotContact && <Badge tone="red">Do not contact</Badge>}
        </span>
        {m.restricted?.parentEmail != null && (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="kicker text-ink">Parent/Guardian</span>
            <a className="text-symbol hover:underline" href={`mailto:${m.restricted.parentEmail}`}>
              {m.restricted.parentEmail}
            </a>
          </span>
        )}
      </div>
    </div>
  )
}

function SeniorEtSection({ senior }: { senior: SeniorDetailJson }) {
  return (
    <Section icon={BookOpen} title="Education and Training">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-ink">
          Current level:{' '}
          <span className="font-medium">
            {senior.currentLevel > 0 ? `Level ${senior.currentLevel}` : 'Not started'}
          </span>
        </span>
        {senior.currentLevel < 3 && (
          <span className="text-ink2">Level 2 track: {senior.level2Track ?? 'Not selected'}</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LEVEL_META.map(meta => {
          const p = senior.levelsProgress[meta.id]
          return (
            <div key={meta.id} className="rounded-md border border-hairline p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="kicker text-ink2">Level {meta.label}</div>
                  <div className="font-display text-sm font-semibold text-ink">{meta.name}</div>
                </div>
                <LevelStatusMark status={p.status} />
              </div>
              <ProgressBar className="mt-2" value={p.percent} />
              <div className="tnum mt-1 flex items-center justify-between text-[11px] text-ink2">
                <span>
                  {p.totalReq > 0
                    ? `${p.totalComp} of ${p.totalReq} required tasks`
                    : p.legacy
                      ? 'Legacy award'
                      : 'No task data'}
                </span>
                {p.date !== null && <span>Completed {fmtDate(p.date)}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function PromotionCheck({
  label,
  met,
  children,
}: {
  label: string
  met: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-hairline py-2.5">
      <CheckGlyph done={met} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">
          {label}
          <span className="sr-only">{met ? ': met' : ': not met'}</span>
        </div>
        <div className="tnum text-xs text-ink2">{children}</div>
      </div>
    </div>
  )
}

function SeniorPromotionSection({
  promotion,
  promotableNow,
}: {
  promotion: SeniorPromotionJson | null
  promotableNow: boolean
}) {
  return (
    <Section icon={TrendingUp} title="Promotion Eligibility">
      {promotion === null ? (
        <p className="text-sm text-ink2">
          No duty-performance promotion pathway for the current grade (CAPR 35-5).
        </p>
      ) : (
        <div className="space-y-2" data-testid="promotion-detail">
          <div className="border-b border-hairline pb-3">
            <div className="kicker text-ink">Next grade</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-[26px] font-medium leading-none text-ink">
                {promotion.nextRank}
              </span>
              {promotableNow ? (
                <span className={clsx('text-symbol', MICRO_LABEL)}>Eligible now</span>
              ) : (
                <span className="tnum text-xs text-ink2">
                  TIG met on: {fmtDate(promotion.eligibleDate)}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <PromotionCheck label="Time in Grade" met={promotion.isTigMet}>
              {promotion.tigMonthsCurrent} / {promotion.tigMonthsRequired} months
            </PromotionCheck>
            <PromotionCheck label="Education and Training" met={promotion.isLevelMet}>
              Required: {promotion.levelRequired !== '' ? promotion.levelRequired : 'None'}
              <div>Current: {promotion.levelCurrent}</div>
            </PromotionCheck>
            {promotion.dutyReq !== null && (
              <PromotionCheck label="Duty Requirement" met={promotion.isDutyMet}>
                Required: {promotion.dutyReq}
                <div>{promotion.dutyStatusString}</div>
              </PromotionCheck>
            )}
            {promotion.membershipMonthsRequired !== null && (
              <PromotionCheck label="Membership Time" met={promotion.isMembershipMet}>
                {promotion.membershipMonthsCurrent} / {promotion.membershipMonthsRequired} months as
                a member
              </PromotionCheck>
            )}
          </div>
          <p className="text-[11px] text-ink2">
            Requirements per CAPR 35-5 (senior member promotions).
          </p>
        </div>
      )}
    </Section>
  )
}

function SeniorAssignmentsSection({ senior }: { senior: SeniorDetailJson }) {
  return (
    <Section icon={Briefcase} title="Duties, Tracks, and Awards">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="kicker mb-1.5 text-ink">Duty assignments</div>
          {senior.duties.length === 0 && <p className="text-sm text-ink2">No duty assignments</p>}
          <div>
            {senior.duties.map((d, i) => {
              const crossUnit = d.orgString !== senior.memberUnitName
              return (
                <div key={`${d.name}-${i}`} className="border-b border-hairline py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                    {d.displayName}
                    {crossUnit && <Badge tone="blue">Cross-unit</Badge>}
                    {!d.hasTrack && d.warningMsg !== '' && (
                      <span title={d.warningMsg}>
                        <VerdictMark
                          kind="watch"
                          label={<span className="text-xs">No matching track</span>}
                        />
                      </span>
                    )}
                  </div>
                  <div className="tnum text-xs text-ink2">
                    Unit: {d.orgString} · Assigned: {fmtDate(d.date)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <div className="kicker mb-1.5 text-ink">Specialty tracks</div>
          {senior.tracks.length === 0 && <p className="text-sm text-ink2">No specialty tracks</p>}
          <div>
            {senior.tracks.map((t, i) => (
              <div key={`${t.name}-${i}`} className="border-b border-hairline py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                  <span className="font-medium text-ink">{t.name}</span>
                  <span className={clsx('text-ink2', MICRO_LABEL)}>{t.level}</span>
                </div>
                <div className="tnum text-xs text-ink2">Awarded: {fmtDate(t.date)}</div>
                {!t.hasDuty && t.warningMsg !== '' && (
                  <div className="mt-1">
                    <VerdictMark kind="watch" label={<span className="text-xs">{t.warningMsg}</span>} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {senior.seniorAwards.length > 0 && (
            <div className="mt-3">
              <div className="kicker mb-1.5 text-ink">Awards</div>
              <div className="flex flex-wrap gap-1.5">
                {senior.seniorAwards.map((a, i) => (
                  <Badge key={`${a.award}-${i}`} title={`Completed: ${fmtDate(a.completed)}`}>
                    <Award className="h-3 w-3" aria-hidden /> {a.award}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

// Checklist grouping mirrors v1 ComponentsCadetComponents.html RequirementsChecklist
// category priorities, folded into the five labeled sections plus a catch-all.
const REQ_GROUP_ORDER = ['leadership', 'aerospace', 'fitness', 'character', 'sda', 'other'] as const
type ReqGroupId = (typeof REQ_GROUP_ORDER)[number]

const REQ_GROUP_LABELS: Record<ReqGroupId, string> = {
  leadership: 'Leadership',
  aerospace: 'Aerospace',
  fitness: 'Fitness',
  character: 'Character',
  sda: 'Staff Duty Analysis',
  other: 'Activities and Other',
}

const REQ_KEY_GROUP: Record<string, ReqGroupId> = {
  leadershipTest: 'leadership',
  wrightBrothersLeadershipExam: 'leadership',
  mitchellLeadershipExam: 'leadership',
  earhartLeadershipExam: 'leadership',
  spaatzLeadershipExam: 'leadership',
  drillTest: 'leadership',
  aerospaceTest: 'aerospace',
  mitchellAerospaceExam: 'aerospace',
  spaatzJOFExam: 'aerospace',
  physicalFitness: 'fitness',
  spaatzCFA: 'fitness',
  characterDevelopment: 'character',
  cadetOath: 'character',
  activeParticipation: 'character',
  leadershipExpectations: 'character',
  leadershipFeedback: 'character',
  uniformWear: 'character',
  sdaService: 'sda',
  sdaPresentation: 'sda',
  sdaWriting: 'sda',
}

function RequirementItem({ req }: { req: ReqStatusJson }) {
  return (
    <div className="flex items-start gap-2 border-b border-hairline py-2">
      <CheckGlyph done={req.completed} />
      <div className="min-w-0">
        <div className={clsx('text-sm', req.completed ? 'font-medium text-ink' : 'text-ink2')}>
          {req.label}
        </div>
        {req.value !== null && <div className="tnum text-xs text-ink2">{req.value}</div>}
      </div>
    </div>
  )
}

function CadetSection({ cadet, stateNow }: { cadet: CadetDetailJson; stateNow: string | null }) {
  const nextRank =
    cadet.nextAchievement !== null ? CADET_ACHIEVEMENT_TO_RANK.get(cadet.nextAchievement) ?? null : null
  const stateKey =
    stateNow !== null && stateNow in CADET_STATE_META ? (stateNow as CadetState) : null
  const honorEarned = new Set(cadet.honorCreditAchievements.map(h => h.achievementId))
  const approved = new Set(cadet.approvedAchievements)

  const groups = new Map<ReqGroupId, ReqStatusJson[]>()
  if (cadet.nextRequirements !== null) {
    for (const req of cadet.nextRequirements.requirements) {
      const group = REQ_KEY_GROUP[req.key] ?? 'other'
      const list = groups.get(group)
      if (list) list.push(req)
      else groups.set(group, [req])
    }
  }

  const opportunity = cadet.nextHonorCreditStatus
  const showOpportunity =
    opportunity !== null && !opportunity.earned && !(opportunity.reason ?? '').startsWith('N/A')

  const hfzStatus = cadet.hfz?.status ?? null

  return (
    <Section icon={Star} title="Cadet Program">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-hairline p-3">
          <div className="kicker text-ink">Current</div>
          <div className="mt-1 font-display text-lg font-semibold leading-tight text-ink">
            {cadet.rank ?? 'No rank'}
          </div>
          <div className="text-xs text-ink2">
            {cadet.currentAchievementName ?? 'No achievement approved'}
            {cadet.publicAchievementNumber !== null && cadet.currentAchievement !== 0 && (
              <span className="tnum ml-1">(Achv {cadet.publicAchievementNumber})</span>
            )}
          </div>
          <div className="tnum mt-1 text-xs text-ink2">Phase {cadet.phase || '0'}</div>
        </div>
        <div className="rounded-md border border-hairline p-3">
          <div className="kicker text-ink">Next</div>
          <div className="mt-1 font-display text-lg font-semibold leading-tight text-ink">
            {cadet.nextAchievement !== null
              ? `${nextRank ?? ''} ${cadet.nextAchievementName ?? ''}`.trim()
              : 'Spaatz Award achieved'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {stateKey !== null && <CadetStateMark state={stateKey} />}
            <span className="text-xs text-ink2">{cadet.promotion.message}</span>
          </div>
          {cadet.nextRequirements !== null && (
            <ProgressBar className="mt-2" value={cadet.nextRequirements.completionPercent} />
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-hairline p-3" data-testid="cadet-tig">
          <div className="flex items-center justify-between">
            <span className="kicker text-ink">Time in Grade</span>
            {cadet.timeInGrade.isEligible && (
              <span className={clsx('inline-flex items-center gap-1 text-ink', MICRO_LABEL)}>
                <Check className="h-3.5 w-3.5 text-symbol" aria-hidden /> Met
              </span>
            )}
          </div>
          <div className="tnum mt-1 text-sm text-ink">
            {cadet.timeInGrade.weeks}w {cadet.timeInGrade.days % 7}d ({cadet.timeInGrade.days} days)
          </div>
          <div className="tnum text-xs text-ink2">
            Eligible on: {fmtDate(cadet.timeInGrade.eligibleOn)}
          </div>
        </div>
        <div className="rounded-md border border-hairline p-3" data-testid="cadet-hfz">
          <div className="flex items-center justify-between">
            <span className="kicker inline-flex items-center gap-1 text-ink">
              <HeartPulse className="h-3.5 w-3.5 text-ink2" aria-hidden /> HFZ
            </span>
            {hfzStatus !== null &&
              (hfzStatus === 'EXPIRED' ? (
                <VerdictMark kind="watch" label={<span className={MICRO_LABEL}>Expired</span>} />
              ) : hfzStatus === 'ATTEMPTED' ? (
                <VerdictMark kind="plan" label={<span className={MICRO_LABEL}>Attempted</span>} />
              ) : (
                <span className={clsx('text-ink', MICRO_LABEL)}>{hfzStatus.replace('_', ' ')}</span>
              ))}
          </div>
          {cadet.hfz !== null ? (
            <>
              <div className="mt-1 text-sm text-ink">{cadet.hfz.message}</div>
              <div className="tnum text-xs text-ink2">Valid until: {fmtDate(cadet.hfz.validUntil)}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-ink2">Not applicable</div>
          )}
        </div>
      </div>

      {cadet.cadetDuties.length > 0 && (
        <div className="mb-3">
          <div className="kicker mb-1.5 text-ink">Duty positions</div>
          <div className="flex flex-wrap gap-1.5">
            {cadet.cadetDuties.map((d, i) => (
              <Badge key={`${d.duty}-${i}`} title={`${d.orgName} - Assigned: ${fmtDate(d.date)}`}>
                {d.duty}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {cadet.nextRequirements !== null && (
        <div className="mb-3" data-testid="cadet-requirements">
          <div className="kicker mb-1.5 text-ink">
            Next achievement requirements ({cadet.nextRequirements.completed.length} of{' '}
            {cadet.nextRequirements.requirements.length} complete)
          </div>
          <div className="space-y-3">
            {REQ_GROUP_ORDER.map(groupId => {
              const reqs = groups.get(groupId)
              if (reqs === undefined || reqs.length === 0) return null
              return (
                <div key={groupId}>
                  <div className="kicker mb-1 text-ink2">{REQ_GROUP_LABELS[groupId]}</div>
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    {reqs.map(req => (
                      <RequirementItem key={req.key} req={req} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showOpportunity && opportunity !== null && (
        <div className="mb-3 rounded-md border border-hairline p-3">
          <div className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
            <Star className="h-4 w-4 text-ink2" aria-hidden /> Honor Credit Opportunity
          </div>
          <p className="mt-1 text-xs text-ink2">
            Complete both interactive modules and both written tests (80%+) for the next
            achievement to earn honor credit.
          </p>
          {opportunity.legacyDetails !== null && (
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {(
                [
                  ['Leadership module', opportunity.legacyDetails.leadershipModule],
                  ['Aerospace module', opportunity.legacyDetails.aerospaceModule],
                  ['Leadership test (80%+)', opportunity.legacyDetails.leadershipTest],
                  ['Aerospace test (80%+)', opportunity.legacyDetails.aerospaceTest],
                ] as const
              ).map(([label, done]) => (
                <span
                  key={label}
                  className={clsx(
                    'flex items-center gap-1.5',
                    done ? 'font-medium text-ink' : 'text-ink2',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-symbol" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  )}
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-3" data-testid="cadet-timeline">
        <div className="kicker mb-1.5 text-ink">Promotion history</div>
        <div className="space-y-2">
          {CADET_PHASE_DEFS.map(phase => {
            const ids = [...phase.achievements, phase.milestoneAchv]
            return (
              <div key={phase.phase} className="flex flex-wrap items-center gap-1.5">
                <span className="w-40 shrink-0 text-xs font-medium text-ink2">{phase.name}</span>
                {ids.map(id => {
                  const isApproved = approved.has(id)
                  const isCurrent = cadet.currentAchievement === id
                  const isNext = cadet.nextAchievement === id
                  const isMilestone = id === phase.milestoneAchv
                  const publicNo = publicAchievementNumber(id)
                  const rank = CADET_ACHIEVEMENT_TO_RANK.get(id) ?? ''
                  const title = `${achievementDisplayName(id)}${
                    publicNo !== null && !isMilestone ? ` (Achievement ${publicNo})` : ''
                  } - ${rank}${isApproved ? ' - approved' : ''}${honorEarned.has(id) ? ' - honor credit' : ''}`
                  return (
                    <span
                      key={id}
                      title={title}
                      className={clsx(
                        'tnum inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 font-display text-[11px] font-semibold',
                        isMilestone && 'ring-1 ring-inset ring-muted',
                        isApproved
                          ? 'bg-symbol-20 text-symbol'
                          : isNext
                            ? 'border border-symbol bg-paper text-symbol'
                            : 'bg-gray20 text-ink2',
                        isCurrent && 'ring-2 ring-symbol',
                      )}
                    >
                      {isMilestone ? phase.milestoneName.split(' ').pop() : publicNo ?? id}
                      {honorEarned.has(id) && <Star className="h-3 w-3" aria-hidden />}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
        {cadet.milestoneAwards.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cadet.milestoneAwards.map((a, i) => (
              <Badge key={`${a.award}-${i}`} title={`Completed: ${fmtDate(a.completed)}`}>
                <Award className="h-3 w-3" aria-hidden /> {a.award} ({fmtDate(a.completed)})
              </Badge>
            ))}
          </div>
        )}
        {cadet.honorCreditAchievements.length > 0 && (
          <div className="mt-2 text-xs text-ink2">
            Honor credit earned on:{' '}
            {cadet.honorCreditAchievements
              .map(h => `${achievementDisplayName(h.achievementId)}${h.earnedDate !== null ? ` (${h.earnedDate})` : ''}`)
              .join(', ')}
          </div>
        )}
      </div>
    </Section>
  )
}

function EsSection({ quals }: { quals: readonly EsQualJson[] }) {
  return (
    <Section icon={ShieldCheck} title="Emergency Services Qualifications">
      {quals.length === 0 ? (
        <p className="text-sm text-ink2">No ES qualifications on file</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" data-testid="es-quals">
          {quals.map((q, i) => (
            <div
              key={`${q.achvId}-${i}`}
              className="flex items-center justify-between gap-2 border-b border-hairline py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1 truncate text-sm font-medium text-ink">
                  {q.name}
                  {q.isSkillsEvaluator && (
                    <Star
                      className="h-3.5 w-3.5 shrink-0 text-ink2"
                      aria-label="Skills evaluator"
                    />
                  )}
                </div>
                <div className="tnum text-[11px] text-ink2">
                  {q.functionalArea ?? 'General'}
                  {q.expiration !== null && <span> · Expires {fmtDate(q.expiration)}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <EsStatusMark status={q.status} />
                {q.isExpiringSoon && (
                  <VerdictMark kind="watch" label={<span className={MICRO_LABEL}>Expiring soon</span>} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

export default function MemberProfileModal({
  capid,
  onClose,
}: {
  capid: number | null
  onClose: () => void
}) {
  const q = useQuery<MemberProfileResponse, ApiError>({
    queryKey: ['member', capid],
    queryFn: () => apiFetch<MemberProfileResponse>(`/api/members/${capid}`),
    enabled: capid !== null,
    staleTime: 60_000,
  })

  const m = q.data
  const title =
    m !== undefined && capid === m.capid ? `${m.rank} ${m.nameLast}, ${m.nameFirst}` : 'Member Profile'

  return (
    <Modal open={capid !== null} onClose={onClose} title={title} size="xl">
      <div data-testid="member-profile-modal">
        {q.isPending && capid !== null && (
          <div className="flex justify-center py-10">
            <Spinner label="Loading member profile..." />
          </div>
        )}
        {q.error && (
          <Banner kind="error">
            Could not load member {capid}: {q.error.message}
          </Banner>
        )}
        {m !== undefined && (
          <div className="space-y-4">
            <HeaderBlock m={m} />
            {m.detail.senior !== null && (
              <>
                <SeniorEtSection senior={m.detail.senior} />
                <SeniorPromotionSection
                  promotion={m.detail.senior.promotion}
                  promotableNow={m.promotable}
                />
                <SeniorAssignmentsSection senior={m.detail.senior} />
              </>
            )}
            {m.detail.cadet !== null && (
              <CadetSection cadet={m.detail.cadet} stateNow={m.cadetState} />
            )}
            <EsSection quals={m.detail.esAll} />
          </div>
        )}
      </div>
    </Modal>
  )
}
