import { ForbiddenException } from '@nestjs/common';

/**
 * Locks an account to the password-change flow while it still has the shared
 * role-default password an admin issued (§39).
 *
 * Enforced server-side on purpose. Redirecting in the browser would be
 * cosmetic: every member of a given role starts with the same well-known
 * password, so anyone who knows a member's email could otherwise skip the UI
 * and drive the API directly with `Student123!`. Blocking here means the
 * issued credential can do exactly one thing — replace itself.
 *
 * This is invoked from JwtAuthGuard rather than registered as a global guard.
 * Nest runs global guards BEFORE route-level ones, so a global guard would
 * always see an empty `req.user` and silently pass everything — which is
 * exactly what happened the first time round.
 */
const ALLOWED_PATHS = new Set([
  '/api/v1/auth/change-password',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/health',
  '/health/ready',
]);

export function assertPasswordChanged(mustChangePassword: boolean, path: string): void {
  if (!mustChangePassword) return;
  if (ALLOWED_PATHS.has(path)) return;
  throw new ForbiddenException({
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Set your own password before using the LMS.',
  });
}
