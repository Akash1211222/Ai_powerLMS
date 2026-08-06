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
      'SUPER_ADMIN', 'COLLEGE_ADMIN', 'BATCH_MANAGER', 'TRAINER', 'MENTOR',
      'PLACEMENT_OFFICER', 'RECRUITER', 'ALUMNI', 'STUDENT',
    ] as const;
    for (const role of roles) {
      expect(defaultPasswordForRole(role, {}), `${role} default`).toMatch(policy);
    }
  });
});
