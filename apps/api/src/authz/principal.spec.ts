import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '@fca/shared';
import { hasPermission, hasAllPermissions, isMemberOf, type Principal } from './principal';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'u1',
    isSuperAdmin: false,
    globalPermissions: new Set(),
    orgPermissions: new Map(),
    organizationIds: new Set(),
    ...overrides,
  };
}

describe('authorization decisions', () => {
  it('super admin passes any permission in any scope', () => {
    const p = principal({ isSuperAdmin: true });
    expect(hasPermission(p, PERMISSIONS.ORG_MANAGE, null)).toBe(true);
    expect(hasPermission(p, PERMISSIONS.ATTENDANCE_MARK, 'org_x')).toBe(true);
  });

  it('global permission applies in every org scope', () => {
    const p = principal({ globalPermissions: new Set([PERMISSIONS.COURSE_VIEW]) });
    expect(hasPermission(p, PERMISSIONS.COURSE_VIEW, null)).toBe(true);
    expect(hasPermission(p, PERMISSIONS.COURSE_VIEW, 'org_a')).toBe(true);
  });

  it('org-scoped permission only applies within that org', () => {
    const p = principal({
      orgPermissions: new Map([['org_a', new Set([PERMISSIONS.ATTENDANCE_MARK])]]),
      organizationIds: new Set(['org_a']),
    });
    expect(hasPermission(p, PERMISSIONS.ATTENDANCE_MARK, 'org_a')).toBe(true);
    expect(hasPermission(p, PERMISSIONS.ATTENDANCE_MARK, 'org_b')).toBe(false);
  });

  it('unscoped check is satisfied by a grant in any org', () => {
    const p = principal({
      orgPermissions: new Map([['org_a', new Set([PERMISSIONS.STUDENT_VIEW])]]),
    });
    expect(hasPermission(p, PERMISSIONS.STUDENT_VIEW, null)).toBe(true);
  });

  it('denies when the permission is absent', () => {
    const p = principal({ globalPermissions: new Set([PERMISSIONS.COURSE_VIEW]) });
    expect(hasPermission(p, PERMISSIONS.COURSE_PUBLISH, null)).toBe(false);
  });

  it('hasAllPermissions requires every permission (AND)', () => {
    const p = principal({
      globalPermissions: new Set([PERMISSIONS.COURSE_VIEW, PERMISSIONS.COURSE_CREATE]),
    });
    expect(hasAllPermissions(p, [PERMISSIONS.COURSE_VIEW, PERMISSIONS.COURSE_CREATE], null)).toBe(
      true,
    );
    expect(hasAllPermissions(p, [PERMISSIONS.COURSE_VIEW, PERMISSIONS.COURSE_PUBLISH], null)).toBe(
      false,
    );
  });

  it('enforces tenant membership', () => {
    const p = principal({ organizationIds: new Set(['org_a']) });
    expect(isMemberOf(p, 'org_a')).toBe(true);
    expect(isMemberOf(p, 'org_b')).toBe(false);
    expect(isMemberOf(principal({ isSuperAdmin: true }), 'anything')).toBe(true);
  });
});
