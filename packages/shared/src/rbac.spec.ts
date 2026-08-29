import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  REVOKED_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_RANK,
  outranks,
} from './rbac';

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

describe('who may act on whom', () => {
  it('lets a batch manager help a student', () => {
    // The case this exists for: a student cannot log in and the batch desk is
    // who they ask.
    expect(outranks(['BATCH_MANAGER'], ['STUDENT'])).toBe(true);
  });

  it('does not let peers act on each other', () => {
    // Two college admins resetting each other's passwords is a way to take
    // over a colleague's account, not a support flow.
    expect(outranks(['COLLEGE_ADMIN'], ['COLLEGE_ADMIN'])).toBe(false);
    expect(outranks(['TRAINER'], ['BATCH_MANAGER'])).toBe(false);
    expect(outranks(['MENTOR'], ['PLACEMENT_OFFICER'])).toBe(false);
  });

  it('never allows acting upwards', () => {
    expect(outranks(['BATCH_MANAGER'], ['COLLEGE_ADMIN'])).toBe(false);
    expect(outranks(['COLLEGE_ADMIN'], ['OPERATIONAL_LEAD'])).toBe(false);
    expect(outranks(['OPERATIONAL_LEAD'], ['SUPER_ADMIN'])).toBe(false);
  });

  it('puts nobody above the platform owner', () => {
    for (const role of ROLES.filter((r) => r !== 'SUPER_ADMIN')) {
      expect(outranks([role], ['SUPER_ADMIN'])).toBe(false);
    }
    expect(outranks(['SUPER_ADMIN'], ['OPERATIONAL_LEAD'])).toBe(true);
  });

  it('reads the strongest role somebody holds, not the first', () => {
    // People collect roles. A trainer who is also a college admin is an admin.
    expect(outranks(['TRAINER', 'COLLEGE_ADMIN'], ['BATCH_MANAGER'])).toBe(true);
    expect(outranks(['STUDENT'], ['ALUMNI'])).toBe(false);
  });

  it('gives every role a rank', () => {
    for (const role of ROLES) expect(ROLE_RANK[role]).toBeGreaterThan(0);
  });
});

describe('seeing students, and acting on them', () => {
  const has = (role: (typeof ROLES)[number], perm: string) =>
    (DEFAULT_ROLE_PERMISSIONS[role] as string[]).includes(perm);
  const holders = (perm: string) => ROLES.filter((r) => has(r, perm));

  it('lets the college-wide roles see the whole college, and nobody else', () => {
    // The absence of this permission is what narrows somebody to their own
    // batches, so the holder list is the entire definition of "college-wide".
    expect(holders(PERMISSIONS.STUDENT_VIEW_ALL)).toEqual([
      'SUPER_ADMIN',
      'OPERATIONAL_LEAD',
      'COLLEGE_ADMIN',
      'BATCH_MANAGER',
      'PLACEMENT_OFFICER',
    ]);
  });

  it('keeps a trainer and a mentor to the students they work with', () => {
    // Both still read student records — they just do not read every record.
    for (const role of ['TRAINER', 'MENTOR'] as const) {
      expect(has(role, PERMISSIONS.STUDENT_VIEW), `${role} needs student:view`).toBe(true);
      expect(has(role, PERMISSIONS.STUDENT_VIEW_ALL), `${role} must not see the whole college`).toBe(
        false,
      );
    }
  });

  it('never widens a role that cannot see students at all', () => {
    // student:view-all widens student:view; on its own it would mean nothing,
    // and a role holding only the wide one would be a bug that reads as a grant.
    for (const role of ROLES) {
      if (has(role, PERMISSIONS.STUDENT_VIEW_ALL)) {
        expect(has(role, PERMISSIONS.STUDENT_VIEW), `${role} holds view-all without view`).toBe(
          true,
        );
      }
    }
  });

  it('limits password resets and account access to the people who run accounts', () => {
    // Resetting a password and opening somebody's account are the sharpest
    // things a member of staff can do to a student. Teaching them is not a
    // reason to be able to become them.
    expect(holders(PERMISSIONS.MEMBER_SUPPORT)).toEqual([
      'SUPER_ADMIN',
      'OPERATIONAL_LEAD',
      'COLLEGE_ADMIN',
      'BATCH_MANAGER',
    ]);
  });
});

describe('taking a grant back', () => {
  it('never revokes something the same role is also granted', () => {
    // The seed adds first and revokes second, so a permission in both maps
    // would be granted and then deleted on every deploy — a role that quietly
    // loses access nobody meant to remove.
    for (const role of ROLES) {
      const granted = DEFAULT_ROLE_PERMISSIONS[role] as string[];
      for (const perm of REVOKED_ROLE_PERMISSIONS[role] ?? []) {
        expect(granted, `${role} both grants and revokes ${perm}`).not.toContain(perm);
      }
    }
  });

  it('names only permissions that exist', () => {
    // A typo here is silent: deleteMany finds nothing and the grant survives.
    for (const role of ROLES) {
      for (const perm of REVOKED_ROLE_PERMISSIONS[role] ?? []) {
        expect(ALL_PERMISSIONS, `unknown permission ${perm}`).toContain(perm);
      }
    }
  });
});
