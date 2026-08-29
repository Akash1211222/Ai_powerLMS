import { ROLES } from '@fca/shared';
import { describe, it, expect } from 'vitest';
import { defaultPasswordForRole } from './member-passwords';

describe('defaultPasswordForRole', () => {
  it('issues the documented per-role defaults', () => {
    expect(defaultPasswordForRole('STUDENT', {})).toBe('Student123!');
    expect(defaultPasswordForRole('TRAINER', {})).toBe('Teacher123!');
    expect(defaultPasswordForRole('MENTOR', {})).toBe('Mentor123!');
  });

  it('lets env override a role without a redeploy', () => {
    expect(
      defaultPasswordForRole('STUDENT', { MEMBER_DEFAULT_PASSWORD_STUDENT: 'Rotated456!' }),
    ).toBe('Rotated456!');
  });

  it('ignores an empty override and falls back', () => {
    expect(defaultPasswordForRole('STUDENT', { MEMBER_DEFAULT_PASSWORD_STUDENT: '' })).toBe(
      'Student123!',
    );
  });

  it('every default satisfies the API password policy', () => {
    const policy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
    const roles = [
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
    for (const role of roles) {
      expect(defaultPasswordForRole(role, {}), `${role} default`).toMatch(policy);
    }
  });
});

describe('coverage of the role list', () => {
  it('has a default password for every role that exists', () => {
    // Adding a role to @fca/shared without adding one here breaks the build in
    // a message about a Record type. This says the same thing in English, and
    // fails on the role that is missing.
    const missing = ROLES.filter((role) => {
      try {
        return !defaultPasswordForRole(role, {});
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });

  it('never issues the same password to two different roles', () => {
    // These are handed out by hand and are well known by design; at least make
    // learning one useless against another role.
    const issued = ROLES.map((r) => defaultPasswordForRole(r, {}));
    expect(new Set(issued).size).toBe(issued.length);
  });
});
