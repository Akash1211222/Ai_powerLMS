import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Unauthenticated credential/email endpoints, which get a much tighter rate
 * budget than the rest of the API. `logout` is excluded: it needs a valid
 * refresh token, and throttling it would strand users in a signed-in state.
 */
const AUTH_PATHS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
]);

export function isAuthRoute(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;
  const path = context.switchToHttp().getRequest<Request>().path ?? '';
  return AUTH_PATHS.has(path);
}
