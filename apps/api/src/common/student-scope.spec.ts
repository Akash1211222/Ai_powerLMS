/**
 * Who counts as "your" student.
 *
 * The decision is pure, so it is tested without a database — which matters
 * because the failure mode is silent: a scope that resolves `unscoped` by
 * mistake leaks the whole college and every other test still passes.
 */
import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '@fca/shared';
import type { Principal } from '../authz/principal';
import {
  scopeFor,
  visibleBatchWhere,
  assertBatchAccess,
  sharesBatchWith,
  mentorsStudent,
} from './student-scope';

const ORG = 'org-1';
const OTHER = 'org-2';

const principal = (perms: string[], opts: { superAdmin?: boolean; org?: string } = {}): Principal =>
  ({
    userId: 'actor-1',
    isSuperAdmin: opts.superAdmin ?? false,
    globalPermissions: new Set(),
    orgPermissions: new Map([[opts.org ?? ORG, new Set(perms)]]),
    organizationIds: new Set([opts.org ?? ORG]),
  }) as unknown as Principal;

const reader = (found: boolean) => ({
  batchStudent: { findFirst: async () => (found ? { id: 'bs-1' } : null) },
  batchTrainer: { findFirst: async () => (found ? { id: 'bt-1' } : null) },
  mentorBooking: { findFirst: async () => null },
  mentorRequest: { findFirst: async () => null },
});

const ctx = (p: Principal) => ({ getPrincipal: async () => p }) as never;

describe('scopeFor', () => {
  it('narrows a trainer to the batches they are on', () => {
    // A trainer holds student:view and not student:view-all — the whole point.
    const scope = scopeFor(principal([PERMISSIONS.STUDENT_VIEW]), ORG);
    expect(scope.unscoped).toBe(false);
  });

  it('opens the whole college to student:view-all', () => {
    const scope = scopeFor(principal([PERMISSIONS.STUDENT_VIEW, PERMISSIONS.STUDENT_VIEW_ALL]), ORG);
    expect(scope.unscoped).toBe(true);
  });

  it('does not lock somebody out of batches they manage', () => {
    // A college that customises a role could grant batch:manage without the
    // wider read. Managing a batch you cannot see into is not a coherent state.
    const scope = scopeFor(principal([PERMISSIONS.BATCH_MANAGE]), ORG);
    expect(scope.unscoped).toBe(true);
  });

  it('gives a super admin everything', () => {
    expect(scopeFor(principal([], { superAdmin: true }), ORG).unscoped).toBe(true);
  });

  it('reads the permission in the college being asked about, not another one', () => {
    // Holding student:view-all in college A must not widen college B.
    const p = principal([PERMISSIONS.STUDENT_VIEW_ALL], { org: ORG });
    expect(scopeFor(p, ORG).unscoped).toBe(true);
    expect(scopeFor(p, OTHER).unscoped).toBe(false);
  });
});

describe('visibleBatchWhere', () => {
  it('adds no filter when the caller sees the whole college', () => {
    expect(visibleBatchWhere({ actorId: 'a', unscoped: true })).toEqual({});
  });

  it('filters to batches the caller trains', () => {
    // A relation filter rather than a list of ids: one query, and it cannot go
    // stale between being fetched and being used.
    expect(visibleBatchWhere({ actorId: 'a', unscoped: false })).toEqual({
      trainers: { some: { userId: 'a' } },
    });
  });
});

describe('assertBatchAccess', () => {
  it('lets a college-wide role open any batch', async () => {
    const p = principal([PERMISSIONS.STUDENT_VIEW_ALL]);
    await expect(
      assertBatchAccess(ctx(p), reader(false), 'actor-1', { id: 'b1', organizationId: ORG }),
    ).resolves.toBeUndefined();
  });

  it('refuses a trainer a batch they are not on', async () => {
    const p = principal([PERMISSIONS.STUDENT_VIEW]);
    await expect(
      assertBatchAccess(ctx(p), reader(false), 'actor-1', { id: 'b1', organizationId: ORG }),
    ).rejects.toThrow(/do not have access to this batch/i);
  });

  it('allows a batch a trainer is on even before anybody has enrolled', async () => {
    // Asking through the roster would lock a trainer out of their own empty
    // batch until the first student joined.
    const p = principal([PERMISSIONS.STUDENT_VIEW]);
    await expect(
      assertBatchAccess(ctx(p), reader(true), 'actor-1', { id: 'b1', organizationId: ORG }),
    ).resolves.toBeUndefined();
  });
});

describe('sharesBatchWith', () => {
  it('asks only for active enrolments in a batch the actor trains', async () => {
    let seen: Record<string, unknown> = {};
    const spy = {
      batchStudent: {
        findFirst: async (args: object) => {
          seen = (args as { where: Record<string, unknown> }).where;
          return null;
        },
      },
      batchTrainer: { findFirst: async () => null },
      mentorBooking: { findFirst: async () => null },
      mentorRequest: { findFirst: async () => null },
    };
    await sharesBatchWith(spy, 'actor-1', 'student-9');
    expect(seen).toEqual({
      userId: 'student-9',
      status: 'ACTIVE',
      batch: { trainers: { some: { userId: 'actor-1' } } },
    });
  });
});

describe('mentorsStudent', () => {
  const mentorReader = (booking: boolean, request: boolean) => ({
    batchStudent: { findFirst: async () => null },
    batchTrainer: { findFirst: async () => null },
    mentorBooking: { findFirst: async () => (booking ? { id: 'mb-1' } : null) },
    mentorRequest: { findFirst: async () => (request ? { id: 'mr-1' } : null) },
  });

  it('counts a student who booked a session', async () => {
    expect(await mentorsStudent(mentorReader(true, false), 'm1', 's1')).toBe(true);
  });

  it('counts a student whose request the mentor picked up', async () => {
    // A request can be claimed before any slot is booked; the mentor needs the
    // record to prepare for the session they just agreed to take.
    expect(await mentorsStudent(mentorReader(false, true), 'm1', 's1')).toBe(true);
  });

  it('counts nobody else', async () => {
    expect(await mentorsStudent(mentorReader(false, false), 'm1', 's1')).toBe(false);
  });

  it('ignores a cancelled booking', async () => {
    let seen: Record<string, unknown> = {};
    const spy = {
      batchStudent: { findFirst: async () => null },
      batchTrainer: { findFirst: async () => null },
      mentorBooking: {
        findFirst: async (args: object) => {
          seen = (args as { where: Record<string, unknown> }).where;
          return null;
        },
      },
      mentorRequest: { findFirst: async () => null },
    };
    await mentorsStudent(spy, 'm1', 's1');
    expect(seen.status).toEqual({ in: ['CONFIRMED', 'COMPLETED'] });
  });
});
