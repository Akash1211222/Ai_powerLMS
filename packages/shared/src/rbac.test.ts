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
});
