import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '@fca/shared';
import type { AuthUser } from '../auth/auth-user';
import { UserContextService } from './user-context.service';
import { hasAllPermissions, isMemberOf } from './principal';
import { PERMISSIONS_KEY, ORG_SCOPE_KEY } from './require-permissions.decorator';

/**
 * Enforces @RequirePermissions on a route (§6, §39). Must run AFTER JwtAuthGuard
 * (which populates req.user). Resolves the caller's effective permissions from
 * the database and checks them against the required set within the resolved
 * organization scope. Also enforces tenant membership when a scope is present.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userContext: UserContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true; // no permission gate

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) throw new UnauthorizedException('Authentication required');

    const principal = await this.userContext.getPrincipal(req.user.userId);

    // Resolve the org scope this action targets, if any.
    const scopeParam =
      this.reflector.getAllAndOverride<string | undefined>(ORG_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;
    const scopeOrgId = resolveOrgScope(req, scopeParam);

    if (scopeOrgId && !isMemberOf(principal, scopeOrgId)) {
      throw new ForbiddenException('Not a member of the target organization');
    }
    if (!hasAllPermissions(principal, required, scopeOrgId)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}

function resolveOrgScope(req: Request, explicitParam: string | null): string | null {
  const sources: Array<Record<string, unknown>> = [
    req.params as Record<string, unknown>,
    req.query as Record<string, unknown>,
    (req.body ?? {}) as Record<string, unknown>,
  ];
  const keys = explicitParam ? [explicitParam] : ['organizationId', 'orgId'];
  for (const src of sources) {
    for (const key of keys) {
      const val = src?.[key];
      if (typeof val === 'string' && val.length > 0) return val;
    }
  }
  return null;
}
