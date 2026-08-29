import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
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
import { Badge, Banner, Modal, ProgressBar, Spinner } from '../../components/ui'
import {
  CADET_STATE_META,
  ES_STATUS_TONE,
  LEVEL_META,
  LEVEL_STATUS_META,
  fmtDate,
  type CadetDetailJson,
  type EsQualJson,
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

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icon className="h-4 w-4 text-blue-700" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

function HeaderBlock({ m }: { m: MemberProfileResponse }) {
  const unitName = m.detail.senior?.memberUnitName ?? m.detail.cadet?.unitName ?? `Org ${m.orgid}`
  return (
    <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold text-slate-900">
            {m.rank} {m.nameLast}, {m.nameFirst}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            CAPID {m.capid} <span className="mx-1 text-slate-300">|</span> {unitName}
            <span className="mx-1 text-slate-300">|</span> {m.memberType}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Joined: {fmtDate(m.joined)}</span>
            <span>Expires: {fmtDate(m.expiration)}</span>
            {m.rankDate !== null && <span>Date of rank: {m.rankDate}</span>}
          </div>
        </div>
        {m.age !== null && (
          <div className="text-right">
            <div className="text-xs font-bold uppercase text-slate-500">Age</div>
            <div className="text-2xl font-bold text-slate-800">{m.age}</div>
            {/* Exact DOB is admin-gated server side; render only when served. */}
            {m.restricted?.dob != null && (
              <div className="text-xs text-slate-500">DOB: {m.restricted.dob}</div>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-blue-100 pt-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-slate-700">
          <Mail className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          {m.email !== null ? (
            <a className="text-blue-700 hover:underline" href={`mailto:${m.email}`}>
              {m.email}
            </a>
          ) : (
            <span className="italic text-slate-400">No email on file</span>
          )}
          {m.doNotContact && <Badge tone="red">Do not contact</Badge>}
        </span>
        {m.restricted?.parentEmail != null && (
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="text-xs font-bold uppercase text-slate-500">Parent/Guardian:</span>
            <a className="text-blue-700 hover:underline" href={`mailto:${m.restricted.parentEmail}`}>
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
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="slate">
          Current level: {senior.currentLevel > 0 ? `Level ${senior.currentLevel}` : 'Not started'}
        </Badge>
        {senior.currentLevel < 3 && (
          <Badge tone="blue">Level 2 track: {senior.level2Track ?? 'Not selected'}</Badge>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LEVEL_META.map(meta => {
          const p = senior.levelsProgress[meta.id]
          const status = LEVEL_STATUS_META[p.status]
          return (
            <div key={meta.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Level {meta.label}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{meta.name}</div>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <ProgressBar className="mt-2" value={p.percent} accent={status.tone} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
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
    <div
      className={clsx(
        'rounded-lg border p-2.5 text-xs',
        met ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">{label}</span>
        {met ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
        ) : (
          <Circle className="h-4 w-4 text-amber-500" aria-hidden />
        )}
      </div>
      <div className={clsx('mt-1', met ? 'text-green-800' : 'text-amber-800')}>{children}</div>
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
        <p className="text-sm italic text-slate-400">
          No duty-performance promotion pathway for the current grade (CAPR 35-5).
        </p>
      ) : (
        <div className="space-y-2" data-testid="promotion-detail">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Next grade</div>
            <div className="text-lg font-bold text-slate-900">{promotion.nextRank}</div>
            {promotableNow ? (
              <Badge tone="green" className="mt-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> Eligible now
              </Badge>
            ) : (
              <div className="mt-1 text-xs font-semibold text-amber-700">
                TIG met on: {fmtDate(promotion.eligibleDate)}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <PromotionCheck label="Time in Grade" met={promotion.isTigMet}>
              {promotion.tigMonthsCurrent} / {promotion.tigMonthsRequired} months
            </PromotionCheck>
            <PromotionCheck label="Education and Training" met={promotion.isLevelMet}>
              Required: {promotion.levelRequired !== '' ? promotion.levelRequired : 'None'}
              <div className="text-[11px] text-slate-600">Current: {promotion.levelCurrent}</div>
            </PromotionCheck>
            {promotion.dutyReq !== null && (
              <PromotionCheck label="Duty Requirement" met={promotion.isDutyMet}>
                Required: {promotion.dutyReq}
                <div className="text-[11px] text-slate-600">{promotion.dutyStatusString}</div>
              </PromotionCheck>
            )}
            {promotion.membershipMonthsRequired !== null && (
              <PromotionCheck label="Membership Time" met={promotion.isMembershipMet}>
                {promotion.membershipMonthsCurrent} / {promotion.membershipMonthsRequired} months as
                a member
              </PromotionCheck>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
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
          <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">Duty assignments</div>
          {senior.duties.length === 0 && (
            <p className="text-sm italic text-slate-400">No duty assignments</p>
          )}
          <div className="space-y-1.5">
            {senior.duties.map((d, i) => {
              const crossUnit = d.orgString !== senior.memberUnitName
              return (
                <div
                  key={`${d.name}-${i}`}
                  className={clsx(
                    'rounded border p-2 text-sm',
                    crossUnit ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
                    {d.displayName}
                    {crossUnit && <Badge tone="blue">Cross-unit</Badge>}
                    {!d.hasTrack && d.warningMsg !== '' && (
                      <Badge tone="amber" title={d.warningMsg}>
                        {d.warningMsg}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Unit: {d.orgString} <span className="mx-1 text-slate-300">|</span> Assigned:{' '}
                    {fmtDate(d.date)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">Specialty tracks</div>
          {senior.tracks.length === 0 && (
            <p className="text-sm italic text-slate-400">No specialty tracks</p>
          )}
          <div className="space-y-1.5">
            {senior.tracks.map((t, i) => (
              <div key={`${t.name}-${i}`} className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-semibold text-slate-800">{t.name}</span>
                  <Badge
                    tone={
                      t.level === 'MASTER'
                        ? 'indigo'
                        : t.level === 'SENIOR'
                          ? 'blue'
                          : t.level === 'TECHNICIAN'
                            ? 'green'
                            : 'slate'
                    }
                  >
                    {t.level}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">Awarded: {fmtDate(t.date)}</div>
                {!t.hasDuty && t.warningMsg !== '' && (
                  <div className="mt-1 text-xs font-semibold text-amber-700">{t.warningMsg}</div>
                )}
              </div>
            ))}
          </div>
          {senior.seniorAwards.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">Awards</div>
              <div className="flex flex-wrap gap-1.5">
                {senior.seniorAwards.map((a, i) => (
                  <Badge key={`${a.award}-${i}`} tone="indigo" title={`Completed: ${fmtDate(a.completed)}`}>
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
    <div className="flex items-start gap-2 rounded border border-slate-200 p-2">
      {req.completed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
      )}
      <div className="min-w-0">
        <div className={clsx('text-sm font-medium', req.completed ? 'text-slate-900' : 'text-slate-600')}>
          {req.label}
        </div>
        {req.value !== null && <div className="text-xs text-slate-500">{req.value}</div>}
      </div>
    </div>
  )
}

function CadetSection({ cadet, stateNow }: { cadet: CadetDetailJson; stateNow: string | null }) {
  const nextRank =
    cadet.nextAchievement !== null ? CADET_ACHIEVEMENT_TO_RANK.get(cadet.nextAchievement) ?? null : null
  const stateMeta = stateNow !== null && stateNow in CADET_STATE_META
    ? CADET_STATE_META[stateNow as keyof typeof CADET_STATE_META]
    : null
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

  return (
    <Section icon={Star} title="Cadet Program">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase text-slate-500">Current</div>
          <div className="text-lg font-bold text-slate-900">{cadet.rank ?? 'No rank'}</div>
          <div className="text-xs text-slate-600">
            {cadet.currentAchievementName ?? 'No achievement approved'}
            {cadet.publicAchievementNumber !== null && cadet.currentAchievement !== 0 && (
              <span className="ml-1 text-slate-400">(Achv {cadet.publicAchievementNumber})</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">Phase {cadet.phase || '0'}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase text-slate-500">Next</div>
          <div className="text-lg font-bold text-slate-900">
            {cadet.nextAchievement !== null
              ? `${nextRank ?? ''} ${cadet.nextAchievementName ?? ''}`.trim()
              : 'Spaatz Award achieved'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {stateMeta !== null && <Badge tone={stateMeta.tone}>{stateMeta.label}</Badge>}
            <span className="text-xs text-slate-600">{cadet.promotion.message}</span>
          </div>
          {cadet.nextRequirements !== null && (
            <ProgressBar className="mt-2" value={cadet.nextRequirements.completionPercent} accent="blue" />
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className={clsx(
            'rounded-lg border p-3',
            cadet.timeInGrade.isEligible ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white',
          )}
          data-testid="cadet-tig"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500">Time in Grade</span>
            {cadet.timeInGrade.isEligible && (
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
            )}
          </div>
          <div className="mt-1 text-sm text-slate-700">
            {cadet.timeInGrade.weeks}w {cadet.timeInGrade.days % 7}d ({cadet.timeInGrade.days} days)
          </div>
          <div className="text-xs text-slate-500">
            Eligible on: {fmtDate(cadet.timeInGrade.eligibleOn)}
          </div>
        </div>
        <div
          className={clsx(
            'rounded-lg border p-3',
            cadet.hfz?.status === 'PASSED'
              ? 'border-green-200 bg-green-50'
              : cadet.hfz?.status === 'EXPIRED'
                ? 'border-red-200 bg-red-50'
                : 'border-slate-200 bg-white',
          )}
          data-testid="cadet-hfz"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-bold uppercase text-slate-500">
              <HeartPulse className="h-3.5 w-3.5" aria-hidden /> HFZ
            </span>
            {cadet.hfz !== null && (
              <Badge
                tone={
                  cadet.hfz.status === 'PASSED'
                    ? 'green'
                    : cadet.hfz.status === 'ATTEMPTED'
                      ? 'blue'
                      : cadet.hfz.status === 'EXPIRED'
                        ? 'red'
                        : 'slate'
                }
              >
                {cadet.hfz.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          {cadet.hfz !== null ? (
            <>
              <div className="mt-1 text-sm text-slate-700">{cadet.hfz.message}</div>
              <div className="text-xs text-slate-500">Valid until: {fmtDate(cadet.hfz.validUntil)}</div>
            </>
          ) : (
            <div className="mt-1 text-sm italic text-slate-400">Not applicable</div>
          )}
        </div>
      </div>

      {cadet.cadetDuties.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">Duty positions</div>
          <div className="flex flex-wrap gap-1.5">
            {cadet.cadetDuties.map((d, i) => (
              <Badge key={`${d.duty}-${i}`} tone="slate" title={`${d.orgName} - Assigned: ${fmtDate(d.date)}`}>
                {d.duty}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {cadet.nextRequirements !== null && (
        <div className="mb-3" data-testid="cadet-requirements">
          <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">
            Next achievement requirements ({cadet.nextRequirements.completed.length} of{' '}
            {cadet.nextRequirements.requirements.length} complete)
          </div>
          <div className="space-y-3">
            {REQ_GROUP_ORDER.map(groupId => {
              const reqs = groups.get(groupId)
              if (reqs === undefined || reqs.length === 0) return null
              return (
                <div key={groupId}>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-800">
                    {REQ_GROUP_LABELS[groupId]}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <Star className="h-4 w-4 text-amber-600" aria-hidden /> Honor Credit Opportunity
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Complete both interactive modules and both written tests (80%+) for the next
            achievement to earn honor credit.
          </p>
          {opportunity.legacyDetails !== null && (
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
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
                  className={clsx('flex items-center gap-1', done ? 'font-semibold text-green-700' : 'text-slate-600')}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-3" data-testid="cadet-timeline">
        <div className="mb-1.5 text-xs font-bold uppercase text-slate-500">Promotion history</div>
        <div className="space-y-2">
          {CADET_PHASE_DEFS.map(phase => {
            const ids = [...phase.achievements, phase.milestoneAchv]
            return (
              <div key={phase.phase} className="flex flex-wrap items-center gap-1.5">
                <span className="w-40 shrink-0 text-xs font-semibold text-slate-600">{phase.name}</span>
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
                        'inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold',
                        isMilestone && 'ring-1 ring-inset ring-slate-300',
                        isApproved
                          ? 'bg-green-600 text-white'
                          : isNext
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-500',
                        isCurrent && 'ring-2 ring-green-400',
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
              <Badge key={`${a.award}-${i}`} tone="indigo" title={`Completed: ${fmtDate(a.completed)}`}>
                <Award className="h-3 w-3" aria-hidden /> {a.award} ({fmtDate(a.completed)})
              </Badge>
            ))}
          </div>
        )}
        {cadet.honorCreditAchievements.length > 0 && (
          <div className="mt-2 text-xs text-slate-600">
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
        <p className="text-sm italic text-slate-400">No ES qualifications on file</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" data-testid="es-quals">
          {quals.map((q, i) => (
            <div
              key={`${q.achvId}-${i}`}
              className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1 truncate text-sm font-semibold text-slate-800">
                  {q.name}
                  {q.isSkillsEvaluator && (
                    <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {q.functionalArea ?? 'General'}
                  {q.expiration !== null && <span> · Expires {fmtDate(q.expiration)}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <Badge tone={ES_STATUS_TONE[q.status] ?? 'slate'}>{q.status}</Badge>
                {q.isExpiringSoon && <Badge tone="amber">Expiring soon</Badge>}
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
