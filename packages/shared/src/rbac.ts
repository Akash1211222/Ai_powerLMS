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
  // Analytics
  ANALYTICS_VIEW: 'analytics:view',
  // Ops
  AUDIT_VIEW: 'audit:view',
  FEATURE_FLAG_MANAGE: 'feature-flag:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Default role → permission bundles. SUPER_ADMIN implicitly has all
 * permissions (handled in the guard) but is listed explicitly for the seed.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  COLLEGE_ADMIN: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_UPDATE,
    PERMISSIONS.COURSE_PUBLISH,
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ASSESSMENT_CREATE,
    PERMISSIONS.ASSESSMENT_GRADE,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  BATCH_MANAGER: [
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.STUDENT_VIEW,
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
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  MENTOR: [PERMISSIONS.STUDENT_VIEW, PERMISSIONS.STUDENT_INTERVENE, PERMISSIONS.MENTOR_MANAGE],
  PLACEMENT_OFFICER: [
    PERMISSIONS.PLACEMENT_MANAGE,
    PERMISSIONS.PLACEMENT_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  RECRUITER: [PERMISSIONS.PLACEMENT_VIEW],
  // Alumni see open roles so they can refer students into them (§30).
  ALUMNI: [PERMISSIONS.COURSE_VIEW, PERMISSIONS.PLACEMENT_VIEW],
  STUDENT: [
    PERMISSIONS.COURSE_VIEW,
    PERMISSIONS.ASSIGNMENT_SUBMIT,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.PLACEMENT_VIEW,
  ],
};
