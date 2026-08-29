import { describe, it, expect } from 'vitest';
import { ROLES, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './rbac';

/**
 * The permission matrix is enforced from the database, seeded from this file on
 * every deploy. A grant added here reaches production without anyone reviewing
 * it again, so the boundaries worth keeping are asserted here.
 */

describe('the role matrix', () => {
  it('grants every role only permissions that exist', () => {
    for (const role of ROLES) {
      for (const perm of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(perm);
      }
    }
  });

  it('gives SUPER_ADMIN everything, and nobody else', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(ALL_PERMISSIONS.length);
    for (const role of ROLES.filter((r) => r !== 'SUPER_ADMIN')) {
      expect(DEFAULT_ROLE_PERMISSIONS[role].length).toBeLessThan(ALL_PERMISSIONS.length);
    }
  });

  it('keeps the platform switches with the platform owner alone', () => {
    // Reshaping the product or reading raw tables is not an operations job, and
    // is certainly not a customer's.
    const platformOnly = [
      PERMISSIONS.DATABASE_ADMIN,
      PERMISSIONS.FEATURE_FLAG_MANAGE,
      PERMISSIONS.ORG_MANAGE,
    ];
    for (const role of ROLES.filter((r) => r !== 'SUPER_ADMIN')) {
      for (const perm of platformOnly) {
        expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain(perm);
      }
    }
  });

  it('lets only learners submit their own work', () => {
    for (const role of ROLES) {
      const canSubmit = DEFAULT_ROLE_PERMISSIONS[role].includes(PERMISSIONS.ASSIGNMENT_SUBMIT);
      expect(canSubmit).toBe(role === 'STUDENT' || role === 'SUPER_ADMIN');
    }
  });
});

describe('OPERATIONAL_LEAD', () => {
  const perms = DEFAULT_ROLE_PERMISSIONS.OPERATIONAL_LEAD;

  it('can run a college it has been given', () => {
    expect(perms).toEqual(
      expect.arrayContaining([
        PERMISSIONS.BATCH_CREATE,
        PERMISSIONS.BATCH_MANAGE,
        PERMISSIONS.ATTENDANCE_MARK,
        PERMISSIONS.STUDENT_VIEW,
        PERMISSIONS.PLACEMENT_MANAGE,
        PERMISSIONS.USER_MANAGE,
        PERMISSIONS.ROLE_MANAGE,
        PERMISSIONS.ANALYTICS_VIEW,
      ]),
    );
  });

  it('is not a second platform owner', () => {
    // The whole point of the role: cross-tenant reach without platform control.
    expect(perms).not.toContain(PERMISSIONS.DATABASE_ADMIN);
    expect(perms).not.toContain(PERMISSIONS.FEATURE_FLAG_MANAGE);
    expect(perms).not.toContain(PERMISSIONS.ORG_MANAGE);
  });

  it('does not teach', () => {
    // Authoring and grading belong to trainers; operations does not do them.
    for (const perm of [
      PERMISSIONS.COURSE_CREATE,
      PERMISSIONS.COURSE_PUBLISH,
      PERMISSIONS.ASSIGNMENT_CREATE,
      PERMISSIONS.ASSESSMENT_CREATE,
      PERMISSIONS.ASSESSMENT_GRADE,
    ]) {
      expect(perms).not.toContain(perm);
    }
    // But must see the curriculum to run batches against it.
    expect(perms).toContain(PERMISSIONS.COURSE_VIEW);
  });

  it('sits between the platform owner and a college admin', () => {
    const size = (r: keyof typeof DEFAULT_ROLE_PERMISSIONS) => DEFAULT_ROLE_PERMISSIONS[r].length;
    expect(size('SUPER_ADMIN')).toBeGreaterThan(size('OPERATIONAL_LEAD'));
    expect(size('OPERATIONAL_LEAD')).toBeGreaterThan(size('BATCH_MANAGER'));
  });
});
