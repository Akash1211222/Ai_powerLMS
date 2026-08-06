import { describe, it, expect, beforeAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import type { Env } from '../config/env';

function makeService(): TokenService {
  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'x'.repeat(48),
        JWT_ACCESS_TTL: 900,
        JWT_REFRESH_TTL: 1209600,
      })[key],
  } as unknown as ConfigService<Env, true>;
  return new TokenService(new JwtService({}), config);
}

describe('TokenService', () => {
  let service: TokenService;
  beforeAll(() => {
    service = makeService();
  });

  it('creates a refresh token whose stored hash matches re-hashing the raw', () => {
    const { raw, hash, expiresAt } = service.createRefreshToken();
    expect(service.hashRefreshToken(raw)).toBe(hash);
    expect(hash).not.toBe(raw); // never store raw
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('produces unique refresh tokens each call', () => {
    const a = service.createRefreshToken().raw;
    const b = service.createRefreshToken().raw;
    expect(a).not.toBe(b);
  });

  it('signs and verifies an access token round-trip', async () => {
    const token = await service.signAccessToken({ sub: 'user_1', email: 'a@b.com' });
    const claims = await service.verifyAccessToken(token);
    expect(claims.sub).toBe('user_1');
    expect(claims.email).toBe('a@b.com');
  });

  it('rejects a tampered access token', async () => {
    const token = await service.signAccessToken({ sub: 'user_1', email: 'a@b.com' });
    await expect(service.verifyAccessToken(token + 'x')).rejects.toBeTruthy();
  });

  it('creates a 6-digit OTP whose hash matches re-hashing the code', () => {
    const { code, hash } = service.createOtp();
    expect(code).toMatch(/^\d{6}$/);
    expect(service.hashOpaqueToken(code)).toBe(hash);
  });

  it('does not emit the same OTP repeatedly, and stays in range', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const { code } = service.createOtp();
      expect(Number(code)).toBeGreaterThanOrEqual(0);
      expect(Number(code)).toBeLessThan(1_000_000);
      codes.add(code);
    }
    // 200 draws from 10^6 should be almost entirely distinct; a constant or
    // badly truncated generator would collapse this set.
    expect(codes.size).toBeGreaterThan(190);
  });
});
