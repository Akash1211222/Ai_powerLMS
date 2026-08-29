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
 * How much authority a role carries, for deciding who may act on whom.
 *
 * Permissions answer "may this person do X". They cannot answer "may this
 * person do X *to that person*", which is what resetting somebody's password
 * or opening their account as them requires. Counting permissions would be a
 * poor stand-in — a placement officer and a mentor hold five each and are not
 * interchangeable.
 *
 * The rule everywhere is the same: you may act on somebody strictly below you,
 * never on a peer and never upwards. A batch manager can help a student; two
 * college admins cannot reset each other; nobody reaches a super admin.
 */
export const ROLE_RANK: Record<RoleName, number> = {
  SUPER_ADMIN: 100,
  OPERATIONAL_LEAD: 80,
  COLLEGE_ADMIN: 70,
  BATCH_MANAGER: 50,
  TRAINER: 50,
  MENTOR: 40,
  PLACEMENT_OFFICER: 40,
  ALUMNI: 10,
  RECRUITER: 10,
  STUDENT: 10,
};

/** The authority of the strongest role somebody holds. 0 when they hold none. */
export function highestRank(roles: readonly RoleName[]): number {
  return roles.reduce((max, r) => Math.max(max, ROLE_RANK[r] ?? 0), 0);
}

/**
 * Whether `actorRoles` may act on `targetRoles` — reset their password, or open
 * their account. Strictly greater, so peers cannot act on each other.
 */
export function outranks(
  actorRoles: readonly RoleName[],
  targetRoles: readonly RoleName[],
): boolean {
  return highestRank(actorRoles) > highestRank(targetRoles);
}

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
  /**
   * Issue somebody a new temporary password, or open their account to see what
   * they see. Both are held apart from user:manage because the people who need
   * them are not the people who create accounts: a batch manager cannot open
   * Admin at all, yet is exactly who a student goes to when they cannot sign
   * in. Kept apart from student:view for the opposite reason — a trainer needs
   * to read a student's record without being able to become them.
   */
  MEMBER_SUPPORT: 'member:support',
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
  /**
   * Widens student:view from "the students assigned to you" to "every student
   * in this college".
   *
   * The narrow reading is the default precisely because this permission can be
   * absent: a trainer holds student:view and not this, so their reach is the
   * batches they are actually on. Written as a widening grant rather than a
   * narrowing one because the deploy seed only ever adds mappings — a
   * permission removed from a role stays in the database until something
   * deletes it, and a leak that persists after the fix ships is worse than no
   * fix at all.
   */
  STUDENT_VIEW_ALL: 'student:view-all',
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
    PERMISSIONS.MEMBER_SUPPORT,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_VIEW_ALL,
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
    PERMISSIONS.MEMBER_SUPPORT,
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
    PERMISSIONS.STUDENT_VIEW_ALL,
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
    // The college's batch desk: they run every batch in it, so their reach is
    // the whole college rather than a list of batches they happen to be on.
    PERMISSIONS.STUDENT_VIEW_ALL,
    // A student who cannot sign in goes to their batch manager, and the roster
    // is the only screen they can reach a student from.
    PERMISSIONS.MEMBER_SUPPORT,
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  // Teaches the batches they are put on. Deliberately without STUDENT_VIEW_ALL:
  // a trainer holds STUDENT_VIEW, so their reach is the students of those
  // batches and not the college roll. Also without MEMBER_SUPPORT — reading a
  // student's record is their job; becoming that student is not.
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
  // Sees the students who booked them. Same reasoning as TRAINER for the two
  // absent permissions.
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
    // You cannot place students you cannot see, and a placement desk works the
    // whole graduating cohort rather than one batch.
    PERMISSIONS.STUDENT_VIEW_ALL,
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

/**
 * Grants to take away from a role that once had them.
 *
 * The deploy seed only ever adds role→permission mappings, so deleting a
 * permission from `DEFAULT_ROLE_PERMISSIONS` does nothing in production: the
 * row stays, and the role keeps the access. A fix that ships without removing
 * the row is not a fix.
 *
 * Entries here are permanent and append-only — they name a pairing that must
 * not exist, so re-adding the grant above would be undone on the next deploy
 * rather than silently winning. Deliberately not "delete every mapping not in
 * DEFAULT_ROLE_PERMISSIONS": `role:manage` exists, so a college may have
 * granted something by hand, and a rollback to an older API would strip
 * permissions the running code still needs.
 *
 * Empty today. Both of the narrowing changes it was built for — batch-scoped
 * student visibility and account support — were expressed as *new* permissions
 * that trainers and mentors simply never receive, precisely so that nothing
 * needed revoking.
 */
export const REVOKED_ROLE_PERMISSIONS: Partial<Record<RoleName, Permission[]>> = {};
