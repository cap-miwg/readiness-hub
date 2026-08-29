import { Camera, Plane, Radio, Shield, Users, type LucideIcon } from 'lucide-react'
import type { Tone } from '../../components/ui'
import type { EsAnalysis } from './useOverviewData'

export type Teams = EsAnalysis['teams']
export type FieldOps = Teams['fieldOps']
export type Aircrew = Teams['aircrew']
export type Suas = Teams['suas']
export type MissionBase = Teams['missionBase']
export type Command = Teams['command']
export type TeamColor = FieldOps['color']
export type ReadinessRating = EsAnalysis['readinessRating']
export type ExpiringQual = EsAnalysis['qualifications']['expiringWithin90Days'][number]
export type QualifiedMember = FieldOps['qualifiedMembers'][number]

/** Team status color to card styling; literal strings for the Tailwind scanner. */
export const teamStyle: Record<TeamColor, { wrap: string; text: string; icon: string; dot: string }> = {
  green: {
    wrap: 'border-emerald-200 bg-emerald-50',
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    dot: 'bg-emerald-500',
  },
  blue: {
    wrap: 'border-blue-200 bg-blue-50',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    dot: 'bg-blue-500',
  },
  amber: {
    wrap: 'border-amber-200 bg-amber-50',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    dot: 'bg-amber-500',
  },
  red: {
    wrap: 'border-rose-200 bg-rose-50',
    text: 'text-rose-700',
    icon: 'text-rose-600',
    dot: 'bg-rose-400',
  },
}

/** Readiness bands 80/65/50 (v1 ServicesESUnitAnalysisService.html:831-893). */
export const ratingTone: Record<ReadinessRating, Tone> = {
  excellent: 'green',
  good: 'blue',
  fair: 'amber',
  'needs-attention': 'red',
}

export const ratingLabel: Record<ReadinessRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  'needs-attention': 'Needs Attention',
}

/** Icon names carried in the ES payload (domain/constants esConstants). */
export const teamIcon: Record<string, LucideIcon> = {
  Users,
  Plane,
  Camera,
  Radio,
  Shield,
}

export function iconFor(name: string): LucideIcon {
  return teamIcon[name] ?? Users
}

export const urgencyStyle: Record<ExpiringQual['urgency'], string> = {
  critical: 'bg-rose-100 text-rose-800',
  warning: 'bg-amber-100 text-amber-800',
  notice: 'bg-yellow-50 text-yellow-800',
}

export interface RosterMember {
  capid: number
  name: string
  rank: string
  positions: string[]
  isEvaluator: boolean
  canEvaluate: Set<string>
}

/** One row per member across all five teams, with evaluator overlay. */
export function mergeRoster(es: EsAnalysis): RosterMember[] {
  const evaluatorByCapid = new Map<number, Set<string>>()
  for (const ev of es.evaluators.available) {
    evaluatorByCapid.set(ev.capid, new Set(ev.canEvaluate.map(q => q.name.toUpperCase())))
  }
  const byCapid = new Map<number, RosterMember>()
  const teams = [es.teams.fieldOps, es.teams.aircrew, es.teams.suas, es.teams.missionBase, es.teams.command]
  for (const team of teams) {
    for (const m of team.qualifiedMembers) {
      const existing = byCapid.get(m.capid)
      if (existing === undefined) {
        byCapid.set(m.capid, {
          capid: m.capid,
          name: m.name,
          rank: m.rank,
          positions: [...m.positions],
          isEvaluator: evaluatorByCapid.has(m.capid),
          canEvaluate: evaluatorByCapid.get(m.capid) ?? new Set(),
        })
      } else {
        for (const pos of m.positions) {
          if (!existing.positions.includes(pos)) existing.positions.push(pos)
        }
      }
    }
  }
  return [...byCapid.values()].sort((a, b) => a.name.localeCompare(b.name))
}
