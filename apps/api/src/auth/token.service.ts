import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env';

export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
}

/**
 * Issues short-lived access JWTs and opaque refresh tokens (§6).
 * Refresh tokens are random 256-bit strings; only their SHA-256 hash is stored
 * (in the Session table), so a database leak cannot be used to mint sessions.
 */
@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtl = config.get('JWT_REFRESH_TTL', { infer: true });
  }

  get accessTtlSeconds(): number {
    return this.accessTtl;
  }

  get refreshTtlSeconds(): number {
    return this.refreshTtl;
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token, { secret: this.accessSecret });
  }

  /** Generates a raw refresh token (returned to client) + its stored hash. */
  createRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomBytes(32).toString('base64url');
    return {
      raw,
      hash: this.hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
    };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Opaque token for email verification / password reset + its stored hash. */
  createOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: createHash('sha256').update(raw).digest('hex') };
  }

  hashOpaqueToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
