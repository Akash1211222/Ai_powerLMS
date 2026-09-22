import { describe, it, expect } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { IdeTokenService } from './ide-token.service';
import { TokenService } from '../auth/token.service';
import type { Env } from '../config/env';

const config = {
  get: (key: string) =>
    ({
      JWT_ACCESS_SECRET: 'x'.repeat(48),
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_TTL: 1209600,
    })[key],
} as unknown as ConfigService<Env, true>;

const SLUG = 'a'.repeat(24);

describe('IdeTokenService', () => {
  it('redeems a ticket once and only once', async () => {
    const ide = new IdeTokenService(new JwtService({}), config);
    const ticket = await ide.signTicket('user_1', SLUG);
    expect((await ide.redeemTicket(ticket, SLUG))?.sub).toBe('user_1');
    expect(await ide.redeemTicket(ticket, SLUG)).toBeNull();
  });

  it('binds tickets and cookies to their own instance', async () => {
    const ide = new IdeTokenService(new JwtService({}), config);
    const other = 'b'.repeat(24);
    expect(await ide.redeemTicket(await ide.signTicket('user_1', SLUG), other)).toBeNull();
    expect(await ide.verifyCookie(await ide.signCookie('user_1', SLUG), other)).toBeNull();
  });

  it('does not accept a ticket as a cookie, or a cookie as a ticket', async () => {
    const ide = new IdeTokenService(new JwtService({}), config);
    expect(await ide.verifyCookie(await ide.signTicket('user_1', SLUG), SLUG)).toBeNull();
    expect(await ide.redeemTicket(await ide.signCookie('user_1', SLUG), SLUG)).toBeNull();
  });

  // The cookie lives in a learner's browser next to a shell they control. If
  // it verified as an access token, leaking it would open the whole API.
  it('issues cookies that are not valid API access tokens', async () => {
    const ide = new IdeTokenService(new JwtService({}), config);
    const access = new TokenService(new JwtService({}), config);
    const cookie = await ide.signCookie('user_1', SLUG);
    await expect(access.verifyAccessToken(cookie)).rejects.toThrow();
  });

  it('rejects an API access token presented as an IDE cookie', async () => {
    const ide = new IdeTokenService(new JwtService({}), config);
    const access = new TokenService(new JwtService({}), config);
    const token = await access.signAccessToken({ sub: 'user_1', email: 'a@b.com' });
    expect(await ide.verifyCookie(token, SLUG)).toBeNull();
  });
});
