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
