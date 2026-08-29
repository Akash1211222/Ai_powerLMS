import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env';

/** The only algorithm access tokens are signed with, and the only one accepted. */
const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;

/**
 * How long a borrowed session lasts. Long enough to look at a problem with the
 * person on the phone, short enough that a forgotten tab is not a standing key
 * to somebody else's account.
 */
const VIEW_AS_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  /**
   * "must change password" — carried in the token so the guard needs no DB
   * round-trip per request. Access tokens are short-lived, and
   * POST /auth/change-password returns a fresh pair, so the user is never
   * stuck behind a stale claim after setting their own password.
   */
  mcp?: boolean;
  /**
   * Who is really driving, when staff are viewing a member's account.
   *
   * Present only on a "view as" token. Its absence is what makes an ordinary
   * session ordinary, so nothing else may set it.
   */
  act?: string;
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

  /**
   * A token for looking at somebody else's account.
   *
   * Deliberately short-lived and issued alone — there is no refresh token, so
   * the borrowed session cannot be extended and expires on its own. Staff who
   * need longer ask again, and that ask is audited each time.
   */
  signViewAsToken(claims: AccessTokenClaims & { act: string }): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.accessSecret,
      expiresIn: VIEW_AS_TTL_SECONDS,
      algorithm: ACCESS_TOKEN_ALGORITHM,
    });
  }

  get viewAsTtlSeconds(): number {
    return VIEW_AS_TTL_SECONDS;
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
      algorithm: ACCESS_TOKEN_ALGORITHM,
    });
  }

  /**
   * Pinned to the one algorithm we issue. A verifier that accepts whatever the
   * `alg` header asks for is trusting a field the caller controls, which is
   * where algorithm-confusion attacks begin.
   */
  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.accessSecret,
      algorithms: [ACCESS_TOKEN_ALGORITHM],
    });
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

  /**
   * 6-digit numeric OTP for password reset. Uses rejection sampling rather
   * than `% 1000000`, which would bias the low end of the range.
   *
   * A 6-digit code is only 10^6 possibilities, so it is guessable given
   * unlimited attempts. It is protected by a short TTL, single use, and the
   * tight per-IP bucket on /auth/reset-password (see auth-route.ts) — the
   * code alone is never the only barrier.
   */
  createOtp(): { code: string; hash: string } {
    const max = 1_000_000;
    const limit = Math.floor(0xffffffff / max) * max;
    let n: number;
    do {
      n = randomBytes(4).readUInt32BE(0);
    } while (n >= limit);
    const code = String(n % max).padStart(6, '0');
    return { code, hash: this.hashOpaqueToken(code) };
  }
}
