import { ForbiddenException } from '@nestjs/common';

/**
 * Keeps an impersonated session read-only.
 *
 * "View as student" exists so staff can see what a student sees when they say a
 * page is broken. It is not a licence to act as them: an account that can
 * submit work, take an assessment or post in the community while wearing
 * somebody else's name is a way to put words and marks against a student that
 * they did not put there, and the audit log would show the student doing it.
 *
 * So the borrowed token may read, and nothing else. Anything that changes state
 * is refused with a message that says why, rather than a bare 403 that looks
 * like a bug in the page.
 *
 * Invoked from JwtAuthGuard for the same reason as the password-change check:
 * Nest runs global guards before route-level ones, so a global guard would see
 * an empty `req.user` and pass everything.
 */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Ending the borrowed session must stay possible from inside it. */
const ALLOWED_PATHS = new Set(['/api/v1/auth/logout']);

export function assertViewOnly(isImpersonating: boolean, method: string, path: string): void {
  if (!isImpersonating) return;
  if (READ_METHODS.has(method.toUpperCase())) return;
  if (ALLOWED_PATHS.has(path)) return;
  throw new ForbiddenException({
    code: 'VIEW_AS_READ_ONLY',
    message:
      'You are viewing this account, not using it. Nothing can be changed while viewing as somebody else.',
  });
}
