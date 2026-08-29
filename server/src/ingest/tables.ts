/**
 * The CAPWATCH table registry: the single contract between the ingest
 * pipeline, the database schema, and the domain layer.
 *
 * Rules (docs/ARCHITECTURE.md):
 * - Exact filename matching. Files not registered here are logged and skipped.
 * - Columns are an ALLOWLIST with declared types. Upstream columns not listed
 *   (including Member.SSN, Gender, Ethnicity, Profession, EducationLevel,
 *   Citizen) are dropped at parse and never stored. New upstream columns
 *   default to dropped.
 * - Parsing is by header name, never position.
 * - 'date' columns treat the CAPWATCH null sentinel 01/01/1900 as NULL and
 *   accept M/D/YYYY and MM/DD/YYYY (with optional time component).
 * - 'bool' columns accept True/False/1/0 (case-insensitive).
 * - 'int' columns must parse as integers; failures count as parse rejects.
 *
 * Column names here are the CAPWATCH header names verbatim. The loader maps
 * them to snake_case Postgres columns via toSnake().
 */

export type ColumnType = 'int' | 'string' | 'date' | 'bool'

export interface TableSpec {
  /** CAPWATCH filename inside the zip, e.g. "Member.txt". */
  file: string
  /** Postgres table name. */
  table: string
  /** Allowlisted columns: CAPWATCH header name -> type. */
  columns: Record<string, ColumnType>
  /** Required: ingest aborts if the file is missing or empty. */
  required: boolean
}

export const TABLES: TableSpec[] = [
  {
    file: 'Member.txt',
    table: 'members',
    required: true,
    columns: {
      CAPID: 'int',
      NameLast: 'string',
      NameFirst: 'string',
      NameMiddle: 'string',
      NameSuffix: 'string',
      DOB: 'date',
      ORGID: 'int',
      Wing: 'string',
      Unit: 'string',
      Rank: 'string',
      Joined: 'date',
      Expiration: 'date',
      OrgJoined: 'date',
      DateMod: 'date',
      Type: 'string',
      RankDate: 'date',
      Region: 'string',
      MbrStatus: 'string',
    },
  },
  {
    file: 'Organization.txt',
    table: 'organizations',
    required: true,
    columns: {
      ORGID: 'int',
      Region: 'string',
      Wing: 'string',
      Unit: 'string',
      NextLevel: 'int',
      Name: 'string',
      Type: 'string',
      DateChartered: 'date',
      Status: 'string',
      Scope: 'string',
    },
  },
  {
    file: 'MbrContact.txt',
    table: 'mbr_contact',
    required: false,
    columns: {
      CAPID: 'int',
      Type: 'string',
      Priority: 'string',
      Contact: 'string',
      DoNotContact: 'bool',
    },
  },
  {
    file: 'DutyPosition.txt',
    table: 'duty_positions',
    required: false,
    columns: {
      CAPID: 'int',
      Duty: 'string',
      FunctArea: 'string',
      Lvl: 'string',
      Asst: 'bool',
      DateMod: 'date',
      ORGID: 'int', // where the duty is held, which may differ from the home unit
    },
  },
  {
    file: 'CadetDutyPositions.txt',
    table: 'cadet_duty_positions',
    required: false,
    columns: {
      CAPID: 'int',
      Duty: 'string',
      FunctArea: 'string',
      Lvl: 'string',
      Asst: 'bool',
      DateMod: 'date',
      ORGID: 'int',
    },
  },
  {
    file: 'MbrAchievements.txt',
    table: 'mbr_achievements',
    required: true,
    columns: {
      CAPID: 'int',
      AchvID: 'int',
      Status: 'string',
      OriginallyAccomplished: 'date',
      Completed: 'date',
      Expiration: 'date',
      AuthDate: 'date',
      DateMod: 'date',
      ORGID: 'int',
    },
  },
  {
    file: 'MbrTasks.txt',
    table: 'mbr_tasks',
    required: true,
    columns: {
      CAPID: 'int',
      TaskID: 'int',
      Status: 'string',
      Completed: 'date',
      Expiration: 'date',
      ORGID: 'int',
    },
  },
  {
    file: 'CadetAchv.txt',
    table: 'cadet_achv',
    required: false,
    columns: {
      CAPID: 'int',
      CadetAchvID: 'int',
      PhyFitTest: 'date',
      LeadLabDateP: 'date',
      LeadLabScore: 'string',
      AEDateP: 'date',
      AEScore: 'string',
      AEMod: 'string',
      AETest: 'string',
      MoralLDateP: 'date',
      ActivePart: 'string',
      OtherReq: 'string',
      SDAReport: 'string',
      DateMod: 'date',
      DrillDate: 'date',
      DrillScore: 'string',
      LeadCurr: 'string',
      CadetOath: 'string',
      AEBookValue: 'string',
      MileRun: 'string',
      ShuttleRun: 'string',
      SitAndReach: 'string',
      PushUps: 'string',
      CurlUps: 'string',
      HFZID: 'int',
      StaffServiceDate: 'date',
      TechnicalWritingAssignment: 'string',
      TechnicalWritingAssignmentDate: 'date',
      OralPresentationDate: 'date',
      SpeechDate: 'date',
      LeadershipEssayDate: 'date',
    },
  },
  {
    file: 'CadetAchvAprs.txt',
    table: 'cadet_achv_aprs',
    required: false,
    columns: {
      CAPID: 'int',
      CadetAchvID: 'int',
      Status: 'string',
      AwardNo: 'string',
      DateMod: 'date',
    },
  },
  {
    file: 'CadetAchvFullReport.txt',
    table: 'cadet_achv_full_report',
    required: false,
    columns: {
      CAPID: 'int',
      AchvName: 'string',
      AprDate: 'date',
    },
  },
  {
    file: 'CadetActivities.txt',
    table: 'cadet_activities',
    required: false,
    columns: {
      CAPID: 'int',
      Type: 'string',
      Location: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'CadetHFZInformation.txt',
    table: 'cadet_hfz',
    required: false,
    columns: {
      HFZID: 'int',
      CAPID: 'int',
      DateTaken: 'date',
      ORGID: 'int',
      IsPassed: 'bool',
      PacerRun: 'string',
      PacerRunPassed: 'bool',
      MileRun: 'string',
      MileRunPassed: 'bool',
      CurlUp: 'string',
      CurlUpPassed: 'bool',
      PushUp: 'string',
      PushUpPassed: 'bool',
      SitAndReach: 'string',
      SitAndReachPassed: 'bool',
    },
  },
  {
    file: 'CadetRank.txt',
    table: 'cadet_rank',
    required: false,
    columns: {
      CAPID: 'int',
      Rank: 'string',
      RankDate: 'date',
      DateMod: 'date',
    },
  },
  {
    file: 'CadetPhase.txt',
    table: 'cadet_phase',
    required: false,
    columns: {
      CAPID: 'int',
      Type: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'CadetAwards.txt',
    table: 'cadet_awards',
    required: false,
    columns: {
      CAPID: 'int',
      Award: 'string',
      AwardNo: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'SeniorLevel.txt',
    table: 'senior_level',
    required: false,
    columns: {
      CAPID: 'int',
      Lvl: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'SeniorAwards.txt',
    table: 'senior_awards',
    required: false,
    columns: {
      CAPID: 'int',
      Award: 'string',
      AwardNo: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'SpecTrack.txt',
    table: 'spec_track',
    required: false,
    columns: {
      CAPID: 'int',
      Track: 'string',
      TrackLevel: 'string',
      HowComplete: 'string',
      Completed: 'date',
      DateMod: 'date',
    },
  },
  {
    file: 'Training.txt',
    table: 'training',
    required: false,
    columns: {
      CAPID: 'int',
      TypeCrs: 'string',
      HowComplete: 'string',
      CrsID: 'string',
      Completed: 'date',
    },
  },
  {
    file: 'OFlight.txt',
    table: 'o_flight',
    required: false,
    columns: {
      CAPID: 'int',
      Wing: 'string',
      Unit: 'string',
      Syllabus: 'string',
      Type: 'string',
      FltDate: 'date',
    },
  },
  {
    file: 'MbrCommittee.txt',
    table: 'mbr_committee',
    required: false,
    columns: {
      CAPID: 'int',
      Committee: 'string',
      Chair: 'string',
      ORGID: 'int',
      DateAssigned: 'date',
    },
  },
  {
    file: 'ORGStatistics.txt',
    table: 'org_statistics',
    required: false,
    columns: {
      ORGID: 'int',
      Region: 'string',
      Wing: 'string',
      Unit: 'string',
      MbrType: 'string',
      CntType: 'string',
      Quantity: 'int',
      CntDate: 'date',
    },
  },
  {
    file: 'Commanders.txt',
    table: 'commanders',
    required: false,
    columns: {
      ORGID: 'int',
      CAPID: 'int',
      DateAsg: 'date',
      NameLast: 'string',
      NameFirst: 'string',
      Rank: 'string',
    },
  },
  {
    file: 'OrgContact.txt',
    table: 'org_contact',
    required: false,
    columns: {
      ORGID: 'int',
      Type: 'string',
      Priority: 'string',
      Contact: 'string',
    },
  },
  // --- Professional Learning (current senior E&T model) ---
  {
    file: 'PL_Paths.txt',
    table: 'pl_paths',
    required: true,
    columns: { PathID: 'int', PathName: 'string' },
  },
  {
    file: 'PL_Groups.txt',
    table: 'pl_groups',
    required: true,
    columns: {
      GroupID: 'int',
      PathID: 'int',
      GroupName: 'string',
      NumberOfRequiredTasks: 'int',
      AwardsExtraCredit: 'bool',
    },
  },
  {
    file: 'PL_Tasks.txt',
    table: 'pl_tasks',
    required: true,
    columns: { TaskID: 'int', TaskName: 'string', Description: 'string' },
  },
  {
    file: 'PL_TaskGroupAssignments.txt',
    table: 'pl_task_group_assignments',
    required: true,
    columns: { TaskGroupAssignmentID: 'int', TaskID: 'int', GroupID: 'int' },
  },
  {
    file: 'PL_MemberPathCredit.txt',
    table: 'pl_member_path_credit',
    required: false,
    columns: {
      MemberPathCreditID: 'int',
      PathID: 'int',
      CAPID: 'int',
      StatusID: 'int',
      Completed: 'date',
      Expiration: 'date',
      ExtraCreditEarned: 'string', // JSON-ish blob v1 regex-matches for CreditEarned: true
    },
  },
  {
    file: 'PL_MemberTaskCredit.txt',
    table: 'pl_member_task_credit',
    required: false,
    columns: {
      MemberTaskCreditID: 'int',
      TaskID: 'int',
      CAPID: 'int',
      StatusID: 'int',
      Completed: 'date',
      Expiration: 'date',
    },
  },
  {
    file: 'PL_VolUInstructors.txt',
    table: 'pl_vol_u_instructors',
    required: false,
    columns: {
      FullName: 'string',
      CAPID: 'int',
      Region: 'string',
      Wing: 'string',
      Unit: 'string',
      InstructorType: 'string',
      Category: 'string',
      PathName: 'string',
    },
  },
  // --- Emergency Services catalogue ---
  {
    file: 'Achievements.txt',
    table: 'achievements',
    required: true,
    columns: { AchvID: 'int', Achv: 'string', FunctionalArea: 'string' },
  },
  {
    file: 'Tasks.txt',
    table: 'tasks',
    required: true,
    columns: { TaskID: 'int', TaskName: 'string', FunctionalArea: 'string' },
  },
  {
    file: 'AchvStepTasks.txt',
    table: 'achv_step_tasks',
    required: false,
    columns: { AchvStepTaskID: 'int', AchvID: 'int', StepID: 'int', TaskID: 'int' },
  },
  {
    file: 'AchvStepAchv.txt',
    table: 'achv_step_achv',
    required: false,
    columns: { AchvStepTaskID: 'int', AchvID: 'int', StepID: 'int', OrigAchvID: 'int' },
  },
  {
    file: 'CdtAchvEnum.txt',
    table: 'cdt_achv_enum',
    required: false,
    columns: {
      CadetAchvID: 'int',
      AchvName: 'string',
      CurAwdNo: 'string',
      Rank: 'string',
    },
  },
]

/** Adoption sideload CSVs (optional, not CAPWATCH). Same parse rules. */
export const ADOPTION_TABLES: TableSpec[] = [
  {
    file: 'GoogleAdoptionStats.csv',
    table: 'adoption_units',
    required: false,
    // Headers verified against the live MIWG artifacts, 2026-08-29.
    columns: {
      Unit: 'string',
      RosterCount: 'int',
      TotalAccounts: 'int',
      ActiveUsers: 'int',
      RecentLogin: 'int',
      GmailActive: 'int',
      DriveActive: 'int',
      AdoptionRate: 'string',
      CollectionDate: 'date',
    },
  },
  {
    file: 'GoogleAdoptionUsers.csv',
    table: 'adoption_users',
    required: false,
    columns: {
      Unit: 'string',
      Email: 'string',
      FullName: 'string',
      IsActiveUser: 'bool',
      HasRecentLogin: 'bool',
      LastLoginDate: 'date',
      HasGmailActivity: 'bool',
      HasDriveActivity: 'bool',
      CollectionDate: 'date',
    },
  },
]

/** CAPWATCH header name -> Postgres column name. CAPID -> capid, NameLast -> name_last. */
export function toSnake(header: string): string {
  return header
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

export const TABLES_BY_FILE: ReadonlyMap<string, TableSpec> = new Map(
  [...TABLES, ...ADOPTION_TABLES].map(t => [t.file, t]),
)
