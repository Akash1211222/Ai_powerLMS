/**
 * Auth flow integration test (§41). Exercises the real AuthService against a
 * real Postgres via Prisma: register → verify → login → refresh → logout,
 * plus brute-force lockout.
 *
 * Runs only when TEST_DATABASE_URL is set (a migrated, disposable database):
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @fca/api test
 * Otherwise it is skipped so the unit suite stays infra-free.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@fca/database';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { TokenService } from '../src/auth/token.service';
import { AuthService } from '../src/auth/auth.service';
import { AuditService } from '../src/audit/audit.service';
import type { MailService } from '../src/mail/mail.service';
import type { Env } from '../src/config/env';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

function cfg(values: Record<string, unknown>): ConfigService<Env, true> {
  return { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
}

run('AuthService (integration)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest', requestId: 'test' };
  const email = `it-${Date.now()}@example.com`;
  const password = 'Password123!';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const client = new PrismaClient({ datasourceUrl: TEST_DB });
    prisma = client as unknown as PrismaService;

    const passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    const tokens = new TokenService(
      new JwtService({}),
      cfg({ JWT_ACCESS_SECRET: 'x'.repeat(48), JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 1209600 }),
    );
    const audit = new AuditService(prisma);
    const mail = {
      sendEmailVerification: async () => undefined,
      sendPasswordReset: async () => undefined,
    } as unknown as MailService;

    auth = new AuthService(
      prisma,
      passwords,
      tokens,
      audit,
      mail,
      cfg({ LOGIN_MAX_ATTEMPTS: 5, LOGIN_LOCKOUT_MINUTES: 15 }),
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.loginAttempt.deleteMany({ where: { email } });
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
      await (prisma as unknown as PrismaClient).$disconnect();
    }
  });

  it('registers a user in PENDING state and can verify email', async () => {
    const { userId } = await auth.register(
      { email, password, firstName: 'It', lastName: 'Test' },
      ctx,
    );
    const pending = await prisma.user.findUnique({ where: { id: userId } });
    expect(pending?.status).toBe('PENDING');

    const token = await prisma.emailVerificationToken.findFirst({ where: { userId } });
    expect(token).toBeTruthy();
  });

  it('blocks login before verification, then succeeds after', async () => {
    await expect(auth.login({ email, password }, ctx)).rejects.toThrow();

    // Simulate clicking the verification link by activating directly.
    await prisma.user.update({
      where: { email },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });

    const tokens = await auth.login({ email, password }, ctx);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('rotates refresh tokens and invalidates the old one', async () => {
    const first = await auth.login({ email, password }, ctx);
    const rotated = await auth.refresh({ refreshToken: first.refreshToken }, ctx);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    // Old refresh token no longer works.
    await expect(auth.refresh({ refreshToken: first.refreshToken }, ctx)).rejects.toThrow();
    // Logout the rotated session.
    await auth.logout({ refreshToken: rotated.refreshToken, allDevices: true }, ctx);
    await expect(auth.refresh({ refreshToken: rotated.refreshToken }, ctx)).rejects.toThrow();
  });

  it('locks out after too many failed attempts', async () => {
    const bad = { email, password: 'WrongPassword1' };
    for (let i = 0; i < 5; i++) {
      await auth.login(bad, ctx).catch(() => undefined);
    }
    await expect(auth.login({ email, password }, ctx)).rejects.toThrow(/Too many/i);
  });
});
