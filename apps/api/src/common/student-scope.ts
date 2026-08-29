import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '@fca/shared';
import { UserContextService } from '../authz/user-context.service';
import { hasPermission, type Principal } from '../authz/principal';

/**
 * Which students a member of staff may reach.
 *
 * `student:view` answers "may this person open a student record at all". It
 * cannot answer *whose*, and until now nothing did: a trainer hired to teach
 * one batch could read the marks, risk scores and career profile of every
 * student in the college.
 *
 * The rule is one line: staff see the students of the batches they are on,
 * unless they hold `student:view-all`, which the roles whose job is the whole
 * college — admins, the batch desk, the placement desk — do hold.
 *
 * Written as a widening permission rather than a narrowing one on purpose. The
 * deploy seed only ever adds role→permission mappings, so a permission removed
 * from a role would sit in the database until something deleted it, and the
 * leak would outlive its own fix. Absence is the narrow case, and absence
 * needs nothing to happen.
 */

/** Minimal Prisma surface. Keeps this unit testable without a database. */
export type StudentScopeReader = {
  batchStudent: {
    findFirst: (args: object) => Promise<{ id: string } | null>;
  };
  batchTrainer: {
    findFirst: (args: object) => Promise<{ id: string } | null>;
  };
  mentorBooking: {
    findFirst: (args: object) => Promise<{ id: string } | null>;
  };
  mentorRequest: {
    findFirst: (args: object) => Promise<{ id: string } | null>;
  };
};

export interface StudentScope {
  actorId: string;
  /** The whole college, rather than the batches this person is on. */
  unscoped: boolean;
}

/**
 * `where` fragment for a Batch, to spread alongside the caller's own filters.
 *
 * Deliberately a relation filter rather than a pre-fetched list of batch ids:
 * one query instead of two, and it cannot go stale between the fetch and the
 * read it guards.
 */
export function visibleBatchWhere(scope: StudentScope): Record<string, unknown> {
  if (scope.unscoped) return {};
  return { trainers: { some: { userId: scope.actorId } } };
}

/** Decides `unscoped` from a principal already in hand. */
export function scopeFor(principal: Principal, organizationId: string): StudentScope {
  const unscoped =
    principal.isSuperAdmin ||
    hasPermission(principal, PERMISSIONS.STUDENT_VIEW_ALL, organizationId) ||
    // Defence in depth for a college that has customised its roles: somebody
    // who may *manage* a batch must not be locked out of the batch they manage
    // just because nobody thought to give them the wider read. Every default
    // batch:manage holder also holds student:view-all, so this changes nothing
    // about the roles as shipped.
    hasPermission(principal, PERMISSIONS.BATCH_MANAGE, organizationId);

  return { actorId: principal.userId, unscoped };
}

export async function resolveStudentScope(
  userContext: UserContextService,
  actorId: string,
  organizationId: string,
): Promise<StudentScope> {
  return scopeFor(await userContext.getPrincipal(actorId), organizationId);
}

/**
 * Whether the caller may work with this batch at all.
 *
 * Call after `assertOrgAccess`, never instead of it — the organisation check is
 * the wall between customers and this is a narrowing inside one college.
 */
export async function assertBatchAccess(
  userContext: UserContextService,
  prisma: StudentScopeReader,
  actorId: string,
  batch: { id: string; organizationId: string },
): Promise<void> {
  const scope = await resolveStudentScope(userContext, actorId, batch.organizationId);
  if (scope.unscoped) return;

  // The assignment itself, not the roster: a batch with nobody enrolled yet is
  // still a batch you were put in charge of, and asking through BatchStudent
  // would lock its trainer out until the first student joined.
  const assigned = await prisma.batchTrainer.findFirst({
    where: { batchId: batch.id, userId: actorId },
    select: { id: true },
  });
  if (!assigned) {
    throw new ForbiddenException('You do not have access to this batch');
  }
}

/** Whether the actor and the student share a batch the actor trains. */
export async function sharesBatchWith(
  prisma: StudentScopeReader,
  actorId: string,
  studentId: string,
): Promise<boolean> {
  const row = await prisma.batchStudent.findFirst({
    where: {
      userId: studentId,
      status: 'ACTIVE',
      // A batch the actor trains is, by construction, inside an organisation
      // they belong to — so no org clause is needed here, and adding one would
      // only duplicate the check the caller already made.
      batch: { trainers: { some: { userId: actorId } } },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Whether this student is one of the actor's mentees.
 *
 * A mentor is on no batch, so batch scoping alone would leave them unable to
 * open the record of the very student sitting in front of them. There is no
 * mentor↔mentee assignment in the schema — only bookings and requests — so the
 * relationship is inferred from those: somebody who booked a session with this
 * mentor, or whose request this mentor picked up.
 *
 * The known weakness is that it never lapses: a session from two years ago
 * still counts. That is worth fixing with a real assignment model, mirroring
 * BatchTrainer; it is not worth leaving mentors unable to work in the meantime.
 */
export async function mentorsStudent(
  prisma: StudentScopeReader,
  actorId: string,
  studentId: string,
): Promise<boolean> {
  const booking = await prisma.mentorBooking.findFirst({
    where: { mentorId: actorId, studentId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    select: { id: true },
  });
  if (booking) return true;

  const request = await prisma.mentorRequest.findFirst({
    where: { mentorId: actorId, studentId },
    select: { id: true },
  });
  return request !== null;
}
