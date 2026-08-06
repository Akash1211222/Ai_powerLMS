import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../token.service';
import type { AuthUser } from '../auth-user';
import { assertPasswordChanged } from './password-change';

/**
 * Authenticates a request via `Authorization: Bearer <accessToken>` (§6, §39).
 * On success, attaches the AuthUser principal to `req.user`. Authorization
 * (permissions) is handled separately by the PermissionsGuard (M0.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const claims = await this.tokens.verifyAccessToken(token);
      req.user = {
        userId: claims.sub,
        email: claims.email,
        mustChangePassword: claims.mcp === true,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Outside the try: a ForbiddenException here must reach the client as 403,
    // not be swallowed and rewritten as "invalid token".
    assertPasswordChanged(req.user.mustChangePassword === true, req.path);
    return true;
  }
}
