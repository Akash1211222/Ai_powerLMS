import { ForbiddenException } from '@nestjs/common';
import { UserContextService } from '../authz/user-context.service';
import { isMemberOf } from '../authz/principal';
import {
  mentorsStudent,
  scopeFor,
  sharesBatchWith,
  type StudentScopeReader,
} from './student-scope';

/**
 * Verifies the caller may act within a specific organization (§5, §39).
 * The PermissionsGuard checks that the user HAS a permission; for nested
 * resources whose org isn't in the request, services call this to confirm the
 * user belongs to the resource's tenant (or is a super admin).
 */
export async function assertOrgAccess(
  userContext: UserContextService,
  userId: string,
  organizationId: string,
): Promise<void> {
  const principal = await userContext.getPrincipal(userId);
  if (!isMemberOf(principal, organizationId)) {
    throw new ForbiddenException('You do not have access to this organization');
  }
}

/** Minimal Prisma surface needed to resolve memberships. */
type MembershipReader = {
  organizationMember: {
    findFirst: (args: object) => Promise<{ organizationId: string } | null>;
  };
};

/**
 * The organization a member acts in when the request doesn't name one — the
 * org a new question, post or mentor request is filed against.
 *
 * Ordering is the whole point. `isPrimary` is the flag the admin sets when
 * issuing an account, and `createdAt` breaks ties for anyone who predates it.
 * Without an explicit order Postgres may return memberships in any sequence,
 * so a user in two colleges would file into an arbitrary one — and the choice
 * could change between two identical requests.
 *
 * Returns null rather than throwing so each caller keeps the status code its
 * endpoint already documents.
 */
export async function resolvePrimaryOrgId(
  prisma: MembershipReader,
  userId: string,
): Promise<string | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { organizationId: true },
  });
  return membership?.organizationId ?? null;
}

/**
 * Verifies the actor may view a student's data. Two questions, in order:
 * do they share an organization at all, and — for staff whose remit is a set
 * of batches rather than the whole college — do they share a batch.
 *
 * Used by every staff drill-down endpoint (§5, §39). The batch narrowing is
 * applied here rather than at each call site precisely because there are
 * eleven of them: `/students/:id/skills`, `/score`, `/risk`, `/reports`,
 * `/interventions`, `/recommendations`, `/career-profile`, `/placement`. A
 * rule written once cannot be forgotten by the twelfth.
 *
 * The organization check is untouched and still runs first — it is the wall
 * between customers, and this only narrows inside one college.
 */
export async function assertStudentAccess(
  userContext: UserContextService,
  prisma: {
    organizationMember: { findMany: (args: object) => Promise<Array<{ organizationId: string }>> };
  } & StudentScopeReader,
  actorId: string,
  studentId: string,
): Promise<void> {
  const principal = await userContext.getPrincipal(actorId);
  if (principal.isSuperAdmin) return;
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: studentId },
    select: { organizationId: true },
  });
  const shared = memberships.filter((m) => isMemberOf(principal, m.organizationId));
  if (shared.length === 0) {
    throw new ForbiddenException('You do not have access to this student');
  }

  // College-wide in any one of the organizations they share is enough. A
  // placement officer in college A and a trainer in college B should reach a
  // student of A through their placement role, not be narrowed by the other.
  if (shared.some((m) => scopeFor(principal, m.organizationId).unscoped)) return;

  const reaches =
    (await sharesBatchWith(prisma, actorId, studentId)) ||
    (await mentorsStudent(prisma, actorId, studentId));
  if (!reaches) {
    // Deliberately the same message as the org failure. Distinguishing "not
    // your student" from "not your college" would confirm to a trainer that a
    // given person exists in their college, which is the fact being withheld.
    throw new ForbiddenException('You do not have access to this student');
  }
}
