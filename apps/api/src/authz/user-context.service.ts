import { Injectable } from '@nestjs/common';
import type { Permission } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Principal } from './principal';

/**
 * Resolves a user's effective {@link Principal} from their role assignments and
 * organization memberships. This is the ONLY source of authorization truth —
 * never trust client-supplied roles/permissions/org ids (§39).
 */
@Injectable()
export class UserContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrincipal(userId: string): Promise<Principal> {
    const [userRoles, memberships] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      }),
      this.prisma.organizationMember.findMany({ where: { userId }, select: { organizationId: true } }),
    ]);

    const globalPermissions = new Set<Permission>();
    const orgPermissions = new Map<string, Set<Permission>>();
    const organizationIds = new Set<string>(memberships.map((m) => m.organizationId));
    let isSuperAdmin = false;

    for (const ur of userRoles) {
      if (ur.role.name === 'SUPER_ADMIN') isSuperAdmin = true;
      const perms = ur.role.permissions.map((rp) => rp.permission.key as Permission);

      if (ur.organizationId === null) {
        perms.forEach((p) => globalPermissions.add(p));
      } else {
        organizationIds.add(ur.organizationId);
        let set = orgPermissions.get(ur.organizationId);
        if (!set) {
          set = new Set<Permission>();
          orgPermissions.set(ur.organizationId, set);
        }
        perms.forEach((p) => set!.add(p));
      }
    }

    return { userId, isSuperAdmin, globalPermissions, orgPermissions, organizationIds };
  }
}
