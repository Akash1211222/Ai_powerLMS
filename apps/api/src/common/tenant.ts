import { ForbiddenException } from '@nestjs/common';
import { UserContextService } from '../authz/user-context.service';
import { isMemberOf } from '../authz/principal';

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

/**
 * Verifies the actor may view a student's data: super admin, or shares an
 * organization with the student. Used by staff drill-down endpoints (§5, §39).
 */
export async function assertStudentAccess(
  userContext: UserContextService,
  prisma: { organizationMember: { findMany: (args: object) => Promise<Array<{ organizationId: string }>> } },
  actorId: string,
  studentId: string,
): Promise<void> {
  const principal = await userContext.getPrincipal(actorId);
  if (principal.isSuperAdmin) return;
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: studentId },
    select: { organizationId: true },
  });
  if (!memberships.some((m) => isMemberOf(principal, m.organizationId))) {
    throw new ForbiddenException('You do not have access to this student');
  }
}
