/**
 * Role & permission definitions — the single source of truth shared by the
 * database seed, the API authorization guards, and the web UI.
 *
 * Authorization is PERMISSION-based, not role-name based (§6). Roles are just
 * named bundles of permissions; guards always check permissions.
 */

/** All platform roles (§6). */
export const ROLES = [
  'SUPER_ADMIN',
  'OPERATIONAL_LEAD',
  'COLLEGE_ADMIN',
  'BATCH_MANAGER',
  'TRAINER',
  'MENTOR',
  'PLACEMENT_OFFICER',
  'RECRUITER',
  'ALUMNI',
  'STUDENT',
] as const;

export type RoleName = (typeof ROLES)[number];

/**
 * All permissions in the system. Grouped by domain. Phase 0 defines the full
 * vocabulary so later phases only wire behavior — the strings are stable.
 */
export const PERMISSIONS = {
  // Organization / platform
  ORG_MANAGE: 'organization:manage',
  ORG_VIEW: 'organization:view',
  // Users & roles
  USER_MANAGE: 'user:manage',
  USER_VIEW: 'user:view',
  ROLE_MANAGE: 'role:manage',
  // Courses
  COURSE_CREATE: 'course:create',
  COURSE_UPDATE: 'course:update',
  COURSE_PUBLISH: 'course:publish',
  COURSE_VIEW: 'course:view',
  // Batches
  BATCH_CREATE: 'batch:create',
  BATCH_MANAGE: 'batch:manage',
  BATCH_VIEW: 'batch:view',
  // Attendance
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_VIEW: 'attendance:view',
  // Assignments
  ASSIGNMENT_CREATE: 'assignment:create',
  ASSIGNMENT_EVALUATE: 'assignment:evaluate',
  ASSIGNMENT_SUBMIT: 'assignment:submit',
  // Assessments (tests & quizzes)
  ASSESSMENT_CREATE: 'assessment:create',
  ASSESSMENT_GRADE: 'assessment:grade',
  // Students / intelligence
  STUDENT_VIEW: 'student:view',
  STUDENT_INTERVENE: 'student:intervene',
  // Placement
  PLACEMENT_MANAGE: 'placement:manage',
  PLACEMENT_VIEW: 'placement:view',
  // Mentorship
  MENTOR_MANAGE: 'mentor:manage',
  // Community hub
  COMMUNITY_POST: 'community:post',
  COMMUNITY_MODERATE: 'community:moderate',
  // Analytics
  ANALYTICS_VIEW: 'analytics:view',
  // Ops
  AUDIT_VIEW: 'audit:view',
  FEATURE_FLAG_MANAGE: 'feature-flag:manage',
  // Raw table browser + row editor. Bypasses every service-layer rule, so it
  // is deliberately absent from COLLEGE_ADMIN: it reaches across all orgs and
  // is only ever granted through SUPER_ADMIN's ALL_PERMISSIONS bundle.
  DATABASE_ADMIN: 'database:admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Default role → permission bundles. SUPER_ADMIN implicitly has all
 * permissions (handled in the guard) but is listed explicitly for the seed.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  // Everything SUPER_ADMIN can do, minus the platform-wide switches, and
  // always confined to their own college: every org-scoped service calls
  // assertOrgAccess, so these grants cannot reach another college's data.
  // Deliberately excluded:
  //   ORG_MANAGE / FEATURE_FLAG_MANAGE — platform-wide, affect every college
  //   ASSIGNMENT_SUBMIT               — "submit my own work", a student action
  /**
   * Runs operations across a portfolio of colleges, and our own academy.
   *
   * The first role that is cross-tenant without being the platform owner. It
   * reaches several colleges by being a *member* of each one, granted per
   * college — not by skipping the ownership check. That check is the only wall
   * between customers, so an exception inside it would have to be remembered by
   * every endpoint written afterwards; membership needs no exception at all.
   *
   * Deliberately excluded:
   *   ORG_MANAGE / FEATURE_FLAG_MANAGE / DATABASE_ADMIN — platform switches and
   *     raw data. An operations person should not be able to reshape the
   *     product or read tables directly.
   *   COURSE_CREATE / UPDATE / PUBLISH, ASSIGNMENT_*, ASSESSMENT_* — authoring
   *     and grading are the trainer's craft, not operations.
   *   ASSIGNMENT_SUBMIT — a student action.
   */
  OPERATIONAL_LEAD: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_INTERVENE,
    PERMISSIONS.MENTOR_MANAGE,
    PERMISSIONS.PLACEMENT_MANAGE,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  COLLEGE_ADMIN: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_PUBLISH,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ASSIGNMENT_CREATE,
    PERMISSIONS.ASSIGNMENT_EVALUATE,
    PERMISSIONS.ASSESSMENT_CREATE,
    PERMISSIONS.ASSESSMENT_GRADE,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_INTERVENE,
    PERMISSIONS.MENTOR_MANAGE,
    PERMISSIONS.PLACEMENT_MANAGE,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.COMMUNITY_MODERATE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  // Owns their college's batches end to end. BATCH_CREATE was missing, so the
  // role could manage a batch but not open one; COURSE_VIEW is needed because
  // a batch is created against a course; ATTENDANCE_MARK because running a
  // batch means recording who turned up. Still org-scoped via assertOrgAccess.
  BATCH_MANAGER: [
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  TRAINER: [
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ASSIGNMENT_CREATE,
    PERMISSIONS.ASSIGNMENT_EVALUATE,
    PERMISSIONS.ASSESSMENT_CREATE,
    PERMISSIONS.ASSESSMENT_GRADE,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_INTERVENE,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.COMMUNITY_MODERATE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  MENTOR: [
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_INTERVENE,
    PERMISSIONS.MENTOR_MANAGE,
    // Advising a mentee is guesswork without seeing their curriculum.
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.COMMUNITY_POST,
  ],
  PLACEMENT_OFFICER: [
    PERMISSIONS.PLACEMENT_MANAGE,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  RECRUITER: [PERMISSIONS.PLACEMENT_VIEW],
  // Alumni see open roles so they can refer students into them (§30).
  ALUMNI: [PERMISSIONS.COURSE_VIEW, PERMISSIONS.PLACEMENT_VIEW, PERMISSIONS.COMMUNITY_POST],
  STUDENT: [
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.ASSIGNMENT_SUBMIT,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.COMMUNITY_POST,
  ],
};
