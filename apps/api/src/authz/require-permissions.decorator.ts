import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fca/shared';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares the permissions required to invoke a handler (§6). All listed
 * permissions must be satisfied. Use together with JwtAuthGuard + PermissionsGuard.
 *
 * @example
 *   @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
 *   @Get('audit-logs')
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Optionally names the request param/property that carries the organization id
 * a handler operates on, so org-scoped grants are enforced against the right
 * tenant. Defaults to checking `organizationId` then `orgId`.
 */
export const ORG_SCOPE_KEY = 'org_scope_param';
export const OrgScope = (param: string) => SetMetadata(ORG_SCOPE_KEY, param);
