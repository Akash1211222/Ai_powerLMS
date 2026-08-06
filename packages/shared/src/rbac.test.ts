import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
} from './rbac';

describe('rbac definitions', () => {
  it('defines a permission bundle for every role', () => {
    for (const role of ROLES) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('grants SUPER_ADMIN every permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('only references known permissions in every bundle', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const role of ROLES) {
      for (const perm of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(known.has(perm)).toBe(true);
      }
    }
  });

  it('does not grant students management permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(DEFAULT_ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.ORG_MANAGE);
  });

  // ---- Role capability expectations --------------------------------------
  // These encode what each role is FOR. They exist so a future edit to the
  // matrix has to consciously change an assertion rather than quietly strand a
  // role without the permissions its job needs.

  const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, perm: string) =>
    (DEFAULT_ROLE_PERMISSIONS[role] as string[]).includes(perm);

  it('gives COLLEGE_ADMIN every permission except the platform-wide ones', () => {
    // A college admin runs their college; they must not be able to flip
    // platform switches that affect every other college.
    const platformOnly = [PERMISSIONS.ORG_MANAGE, PERMISSIONS.FEATURE_FLAG_MANAGE];
    for (const perm of platformOnly) {
      expect(has('COLLEGE_ADMIN', perm), `COLLEGE_ADMIN must not hold ${perm}`).toBe(false);
    }
    // ASSIGNMENT_SUBMIT is "submit my own work" — a student action.
    const expected = ALL_PERMISSIONS.filter(
      (p) => !platformOnly.includes(p as never) && p !== PERMISSIONS.ASSIGNMENT_SUBMIT,
    );
    for (const perm of expected) {
      expect(has('COLLEGE_ADMIN', perm), `COLLEGE_ADMIN should hold ${perm}`).toBe(true);
    }
  });

  it('lets BATCH_MANAGER run batches end to end', () => {
    // Managing a batch is useless without being able to open one, see the
    // course it teaches, and record attendance.
    for (const perm of [
      PERMISSIONS.BATCH_CREATE,
      PERMISSIONS.BATCH_MANAGE,
      PERMISSIONS.BATCH_VIEW,
      PERMISSIONS.COURSE_VIEW,
      PERMISSIONS.ATTENDANCE_MARK,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.STUDENT_VIEW,
    ]) {
      expect(has('BATCH_MANAGER', perm), `BATCH_MANAGER needs ${perm}`).toBe(true);
    }
    // Cross-college reach is prevented by assertOrgAccess, not by permissions,
    // but a batch manager still has no business administering users.
    expect(has('BATCH_MANAGER', PERMISSIONS.USER_MANAGE)).toBe(false);
  });

  it('keeps privileged permissions away from learner-facing roles', () => {
    const privileged = [
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.ROLE_MANAGE,
      PERMISSIONS.ORG_MANAGE,
      PERMISSIONS.FEATURE_FLAG_MANAGE,
      PERMISSIONS.AUDIT_VIEW,
    ];
    for (const role of ['STUDENT', 'ALUMNI', 'RECRUITER', 'MENTOR'] as const) {
      for (const perm of privileged) {
        expect(has(role, perm), `${role} must not hold ${perm}`).toBe(false);
      }
    }
  });

  it('only STUDENT submits assignments', () => {
    for (const role of ROLES) {
      const expected = role === 'STUDENT' || role === 'SUPER_ADMIN';
      expect(has(role, PERMISSIONS.ASSIGNMENT_SUBMIT), `${role}`).toBe(expected);
    }
  });

  it('gives TRAINER what teaching needs', () => {
    for (const perm of [
      PERMISSIONS.COURSE_VIEW,
      PERMISSIONS.BATCH_VIEW,
      PERMISSIONS.ATTENDANCE_MARK,
      PERMISSIONS.ASSIGNMENT_CREATE,
      PERMISSIONS.ASSIGNMENT_EVALUATE,
      PERMISSIONS.ASSESSMENT_CREATE,
      PERMISSIONS.ASSESSMENT_GRADE,
    ]) {
      expect(has('TRAINER', perm), `TRAINER needs ${perm}`).toBe(true);
    }
  });

  it('gives MENTOR and PLACEMENT_OFFICER their own tools', () => {
    expect(has('MENTOR', PERMISSIONS.MENTOR_MANAGE)).toBe(true);
    expect(has('MENTOR', PERMISSIONS.COURSE_VIEW)).toBe(true);
    expect(has('PLACEMENT_OFFICER', PERMISSIONS.PLACEMENT_MANAGE)).toBe(true);
    expect(has('PLACEMENT_OFFICER', PERMISSIONS.STUDENT_VIEW)).toBe(true);
    // A recruiter is external: read-only on placement, nothing else.
    expect(DEFAULT_ROLE_PERMISSIONS.RECRUITER).toEqual([PERMISSIONS.PLACEMENT_VIEW]);
  });
});
