/**
 * Which permission each sensitive admin route is actually behind.
 *
 * These gates live in a decorator, so the service tests beside them cannot see
 * one: they call the service directly and the guard never runs. That makes a
 * loosened decorator invisible to every other test in the suite — which is how
 * password reset and account impersonation ended up reachable by any trainer
 * in the college. Read the metadata instead, and pin it.
 *
 * Paired with the holder lists in `packages/shared/src/rbac.spec.ts`, these two
 * facts — "the route needs X" and "exactly these roles hold X" — are together
 * the whole answer to "can a trainer reset a student's password".
 */
import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLES, type RoleName } from '@fca/shared';
import { PERMISSIONS_KEY } from '../authz/require-permissions.decorator';
import { AdminController } from './admin.controller';

const gate = (method: keyof AdminController): string[] =>
  Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype[method] as object) ?? [];

const holders = (perm: string): RoleName[] =>
  ROLES.filter((r) => (DEFAULT_ROLE_PERMISSIONS[r] as string[]).includes(perm));

describe('admin route gates', () => {
  it('puts password reset and account access behind member:support', () => {
    expect(gate('resetMemberPassword')).toEqual([PERMISSIONS.MEMBER_SUPPORT]);
    expect(gate('viewAsMember')).toEqual([PERMISSIONS.MEMBER_SUPPORT]);
  });

  it('keeps them out of a trainer, mentor or placement officer reach', () => {
    // Not a restatement of the line above: it is the join of the two facts, and
    // it fails if either the decorator loosens or the role bundle widens.
    for (const role of ['TRAINER', 'MENTOR', 'PLACEMENT_OFFICER'] as const) {
      for (const method of ['resetMemberPassword', 'viewAsMember'] as const) {
        const required = gate(method);
        const held = DEFAULT_ROLE_PERMISSIONS[role] as string[];
        expect(
          required.every((p) => held.includes(p)),
          `${role} must not be able to call ${method}`,
        ).toBe(false);
      }
    }
  });

  it('leaves them reachable by the batch desk, which is who students ask', () => {
    for (const method of ['resetMemberPassword', 'viewAsMember'] as const) {
      const required = gate(method);
      const held = DEFAULT_ROLE_PERMISSIONS.BATCH_MANAGER as string[];
      expect(required.every((p) => held.includes(p)), `BATCH_MANAGER needs ${method}`).toBe(true);
    }
  });

  it('keeps opening a college to the platform owner alone', () => {
    // The one screen that reaches across customers.
    expect(gate('createOrganization')).toEqual([PERMISSIONS.ORG_MANAGE]);
    expect(gate('listOrganizations')).toEqual([PERMISSIONS.ORG_MANAGE]);
    expect(holders(PERMISSIONS.ORG_MANAGE)).toEqual(['SUPER_ADMIN']);
  });
});
