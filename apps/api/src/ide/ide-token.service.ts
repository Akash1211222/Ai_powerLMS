import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import type { Env } from '../config/env';

/**
 * Credentials for reaching one IDE instance through the proxy.
 *
 * The workbench is loaded in an iframe and opens dozens of requests and
 * websockets of its own, none of which can carry our bearer header. So the
 * browser trades its access token for a one-minute *ticket* (in the iframe
 * URL), and the proxy trades the ticket for an httpOnly *cookie* scoped to
 * that instance's path.
 *
 * Signed with a key derived from — never equal to — the access-token secret:
 * an IDE cookie must not verify as an API access token, or leaking one from
 * a learner's browser would open the whole API.
 */
export interface IdeClaims {
  sub: string;
  slug: string;
  typ: 'ticket' | 'cookie';
  jti: string;
}

const TICKET_TTL_SECONDS = 60;
export const IDE_COOKIE_TTL_SECONDS = 12 * 60 * 60;

@Injectable()
export class IdeTokenService {
  private readonly secret: string;
  /** Tickets already exchanged. A ticket is single-use; the TTL bounds the set. */
  private readonly spent = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = createHmac('sha256', config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update('fca-ide-proxy')
      .digest('base64url');
  }

  signTicket(userId: string, slug: string): Promise<string> {
    return this.sign({ sub: userId, slug, typ: 'ticket' }, TICKET_TTL_SECONDS);
  }

  signCookie(userId: string, slug: string): Promise<string> {
    return this.sign({ sub: userId, slug, typ: 'cookie' }, IDE_COOKIE_TTL_SECONDS);
  }

  /** Verifies a ticket for `slug` and burns it. Null when unusable. */
  async redeemTicket(token: string, slug: string): Promise<IdeClaims | null> {
    const claims = await this.verify(token, slug, 'ticket');
    if (!claims) return null;
    this.prune();
    if (this.spent.has(claims.jti)) return null;
    this.spent.set(claims.jti, Date.now() + TICKET_TTL_SECONDS * 1000);
    return claims;
  }

  verifyCookie(token: string, slug: string): Promise<IdeClaims | null> {
    return this.verify(token, slug, 'cookie');
  }

  private sign(claims: Omit<IdeClaims, 'jti'>, ttl: number): Promise<string> {
    return this.jwt.signAsync(
      { ...claims, jti: randomBytes(12).toString('hex') },
      { secret: this.secret, expiresIn: ttl, algorithm: 'HS256' },
    );
  }

  private async verify(
    token: string,
    slug: string,
    typ: IdeClaims['typ'],
  ): Promise<IdeClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<IdeClaims>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      return claims.typ === typ && claims.slug === slug ? claims : null;
    } catch {
      return null;
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [jti, expires] of this.spent) if (expires < now) this.spent.delete(jti);
  }
}
