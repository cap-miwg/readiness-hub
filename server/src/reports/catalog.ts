/**
 * The report catalog: the 20 v1 reports (Index.html:4274-4455 reportCatalog),
 * same ids, titles, icons, accents, and tags, plus the v2 participation
 * reports (attendance module, D7), each bound to its server-side generator
 * and to the data slices its loader must fetch.
 */

import type { ReportMeta, ReportResult } from '../shared/reportContracts.js'
import type { ReportData, ReportDataNeed } from './types.js'
import {
  generateAerospaceEducationReport,
  generateApprovalNeededReport,
  generateApproachingAgeMilestoneReport,
  generateCACRepresentativesReport,
  generateCadetNoPromotionReport,
  generateCadetProtectionReport,
  generateDiscrepanciesReport,
  generateEncampmentReport,
  generateMembershipLapseReport,
  generateMostNeededTraining,
  generateNearPromotionReport,
  generateOFlightReport,
  generateParticipationSummaryReport,
  generatePromotionEligibilityReport,
  generatePromotionRequirementsReport,
  generateQCUAReport,
  generateQuietMembersReport,
  generateQUAReport,
  generateRecentPromotionsReport,
  generateRecruitingTrendsReport,
  generateRetentionAnalysisReport,
  generateTlcComplianceReport,
} from './generators.js'

export interface ReportDefinition {
  meta: ReportMeta
  needs: ReportDataNeed[]
  generate: (data: ReportData) => ReportResult
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    meta: {
      id: 'training',
      title: 'Most Needed Training',
      description: 'Moderated ET modules only: what VU instructors should teach next',
      icon: 'GraduationCap',
      accent: 'blue',
      tags: ['senior', 'education & training', 'readiness'],
    },
    needs: ['memberLevelProgress', 'memberSeniorDetail', 'plConfig'],
    generate: generateMostNeededTraining,
  },
  {
    meta: {
      id: 'discrepancies',
      title: 'Track/Duty Discrepancies',
      description: 'Find members with duty assignments but missing required specialty tracks',
      icon: 'AlertTriangle',
      accent: 'amber',
      tags: ['senior', 'duty assignment', 'specialty track', 'compliance'],
    },
    needs: ['memberSeniorDetail'],
    generate: generateDiscrepanciesReport,
  },
  {
    meta: {
      id: 'approval',
      title: 'Levels Needing Approval',
      description:
        'Members who have completed all modules and need submission/approval for ET levels',
      icon: 'Stamp',
      accent: 'green',
      tags: ['senior', 'education & training', 'readiness'],
    },
    needs: ['memberLevelProgress'],
    generate: generateApprovalNeededReport,
  },
  {
    meta: {
      id: 'promotion',
      title: 'Promotion Eligibility',
      description:
        'Senior members eligible for promotion based on TIG, education level, and duty requirements',
      icon: 'TrendingUp',
      accent: 'blue',
      tags: ['senior', 'readiness'],
    },
    needs: ['memberLevelProgress', 'memberSeniorDetail'],
    generate: generatePromotionEligibilityReport,
  },
  {
    meta: {
      id: 'near-promotion',
      title: 'Near Promotion',
      description:
        'Members close to promotion eligibility - within 6 months of TIG, 5 or fewer tasks remaining, or approaching duty requirements',
      icon: 'Target',
      accent: 'amber',
      tags: ['senior', 'readiness', 'education & training'],
    },
    needs: ['memberLevelProgress', 'memberSeniorDetail'],
    generate: generateNearPromotionReport,
  },
  {
    meta: {
      id: 'cadet-no-promotion',
      title: 'Cadets - No Promotion in 120 Days',
      description: 'Cadets who have not been promoted in the last 120 days',
      icon: 'AlertCircle',
      accent: 'amber',
      tags: ['cadet', 'achievements', 'readiness'],
    },
    needs: [],
    generate: generateCadetNoPromotionReport,
  },
  {
    meta: {
      id: 'membership-lapse',
      title: 'Membership Expiring Soon',
      description:
        'All members (seniors and cadets) whose membership will lapse in 90 days or less',
      icon: 'Clock',
      accent: 'amber',
      tags: ['cadet', 'senior', 'membership', 'compliance'],
    },
    needs: [],
    generate: generateMembershipLapseReport,
  },
  {
    meta: {
      id: 'cadet-protection',
      title: 'Cadet Protection Training',
      description: 'Seniors and cadets who are overdue or due soon on Cadet Protection training',
      icon: 'Shield',
      accent: 'amber',
      tags: ['cadet', 'senior', 'compliance', 'education & training'],
    },
    needs: ['training', 'duties'],
    generate: generateCadetProtectionReport,
  },
  {
    meta: {
      id: 'tlc-compliance',
      title: 'TLC Compliance',
      description:
        'Training Leaders of Cadets status for senior members (unit summary when sub-units are included)',
      icon: 'ShieldCheck',
      accent: 'blue',
      tags: ['senior', 'education & training', 'compliance'],
    },
    needs: ['training', 'duties'],
    generate: generateTlcComplianceReport,
  },
  {
    meta: {
      id: 'aerospace-education',
      title: 'Aerospace Education Completion',
      description:
        'All cadets showing detailed completion of the 7 Aerospace Dimensions modules - includes which achievement each module was for, completion type (interactive/test/both), and honor credit status',
      icon: 'BookOpen',
      accent: 'blue',
      tags: ['cadet', 'achievements', 'education & training'],
    },
    needs: ['aerospace'],
    generate: generateAerospaceEducationReport,
  },
  {
    meta: {
      id: 'encampment-status',
      title: 'Encampment Completion Status',
      description: 'All cadets in unit showing whether they have completed an encampment',
      icon: 'Tent',
      accent: 'blue',
      tags: ['cadet', 'activities', 'readiness'],
    },
    needs: ['cadetActivities'],
    generate: generateEncampmentReport,
  },
  {
    meta: {
      id: 'oflight-status',
      title: 'Orientation Flights Status',
      description:
        'Powered O-Flight syllabus completion for all cadets - highlights cadets who have not had any O-Flights',
      icon: 'Plane',
      accent: 'blue',
      tags: ['cadet', 'activities', 'readiness'],
    },
    needs: ['oflights'],
    generate: generateOFlightReport,
  },
  {
    meta: {
      id: 'recent-promotions',
      title: 'Cadets - Recent Promotions',
      description: 'Cadets who have been promoted in the past 30 or 60 days',
      icon: 'TrendingUp',
      accent: 'blue',
      tags: ['cadet', 'achievements', 'readiness'],
    },
    needs: ['cadetRanks'],
    generate: generateRecentPromotionsReport,
  },
  {
    meta: {
      id: 'promotion-requirements',
      title: 'Cadet Promotion Requirements',
      description:
        'Full table of cadet promotion requirements for the unit showing current and next achievements',
      icon: 'List',
      accent: 'blue',
      tags: ['cadet', 'achievements', 'readiness'],
    },
    needs: ['memberCadetDetail'],
    generate: generatePromotionRequirementsReport,
  },
  {
    meta: {
      id: 'approaching-age-milestone',
      title: 'Cadets - Approaching Age 18 or 21',
      description:
        'Cadets who will turn 18 or 21 this year - plan for transitions and age-outs',
      icon: 'Calendar',
      accent: 'amber',
      tags: ['cadet', 'membership', 'readiness'],
    },
    needs: ['memberDob'],
    generate: generateApproachingAgeMilestoneReport,
  },
  {
    meta: {
      id: 'qcua',
      title: 'Quality Cadet Unit Award (QCUA)',
      description:
        'Track unit progress toward the 10 QCUA criteria - 7 trackable, 3 require manual verification',
      icon: 'Award',
      accent: 'blue',
      tags: ['cadet', 'senior', 'readiness', 'compliance'],
    },
    needs: ['cadetActivities', 'oflights', 'achv1Approvals', 'training', 'memberEsAll'],
    generate: generateQCUAReport,
  },
  {
    meta: {
      id: 'qua',
      title: 'Quality Unit Award (QUA)',
      description:
        'Great Lakes Region award for Groups and Senior/Composite Squadrons - 7 of 10 criteria required (FY Oct-Sep)',
      icon: 'Award',
      accent: 'emerald',
      tags: ['senior', 'readiness', 'compliance', 'leadership'],
    },
    needs: [
      'training',
      'duties',
      'seniorLevels',
      'seniorAwards',
      'voluInstructors',
      'cadetActivities',
      'memberEsAll',
      'orgStats',
    ],
    generate: generateQUAReport,
  },
  {
    meta: {
      id: 'recruiting-trends',
      title: 'Recruiting Trends Analysis',
      description:
        'Monthly recruiting patterns, seasonal trends, and year-over-year comparison of new member acquisition',
      icon: 'UserPlus',
      accent: 'blue',
      tags: ['senior', 'cadet', 'membership', 'recruiting', 'analytics'],
    },
    needs: ['orgStats'],
    generate: generateRecruitingTrendsReport,
  },
  {
    meta: {
      id: 'retention-analysis',
      title: 'Retention & Renewal Analysis',
      description:
        'Renewal rates, attrition patterns, and members approaching membership expiration',
      icon: 'RefreshCw',
      accent: 'amber',
      tags: ['senior', 'cadet', 'membership', 'retention', 'analytics'],
    },
    needs: ['orgStats'],
    generate: generateRetentionAnalysisReport,
  },
  {
    meta: {
      id: 'participation-summary',
      title: 'Participation Summary',
      description:
        'Meeting attendance per unit for the last 90 days: meetings logged, average attendance rate, guest counts, and quiet members (no recorded attendance in 60 days)',
      icon: 'CalendarCheck',
      accent: 'blue',
      tags: ['senior', 'cadet', 'participation', 'readiness'],
    },
    needs: ['participation'],
    generate: generateParticipationSummaryReport,
  },
  {
    meta: {
      id: 'quiet-members',
      title: 'Quiet Members',
      description:
        'Active members with no recorded meeting attendance in the last 60 days, in units that log attendance (names at single-unit scope, per-unit counts above it)',
      icon: 'UserMinus',
      accent: 'amber',
      tags: ['senior', 'cadet', 'participation', 'retention'],
    },
    needs: ['participation'],
    generate: generateQuietMembersReport,
  },
  {
    meta: {
      id: 'cac-representatives',
      title: 'CAC Representatives',
      description:
        'Cadet Advisory Council representatives and advisors across the unit hierarchy',
      icon: 'Users',
      accent: 'purple',
      tags: ['cadet', 'senior', 'readiness'],
    },
    needs: ['cac'],
    generate: generateCACRepresentativesReport,
  },
]

export const REPORTS_BY_ID: ReadonlyMap<string, ReportDefinition> = new Map(
  REPORT_DEFINITIONS.map(def => [def.meta.id, def]),
)

export function listReportMeta(): ReportMeta[] {
  return REPORT_DEFINITIONS.map(def => def.meta)
}
