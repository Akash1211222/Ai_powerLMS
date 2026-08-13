/**
 * Auth flow integration test (§41). Exercises the real AuthService against a
 * real Postgres via Prisma: activation → login → refresh → logout, brute-force
 * lockout, and the emailed-OTP password reset.
 *
 * There is no registration step: this is a paid LMS, so accounts are created
 * by an admin (POST /admin/members) and the fixture is seeded directly.
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
  let sentOtp = '';

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
      // Capture the emitted code so the reset flow can be driven end to end.
      sendPasswordResetOtp: async (_to: string, code: string) => {
        sentOtp = code;
      },
    } as unknown as MailService;

    auth = new AuthService(
      prisma,
      passwords,
      tokens,
      audit,
      mail,
      cfg({ LOGIN_MAX_ATTEMPTS: 5, LOGIN_LOCKOUT_MINUTES: 15 }),
    );

    // Stand in for POST /admin/members, but PENDING so the status gate below
    // is exercised before the account is activated.
    await prisma.user.create({
      data: {
        email,
        passwordHash: await passwords.hash(password),
        status: 'PENDING',
        profile: { create: { firstName: 'It', lastName: 'Test' } },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.loginAttempt.deleteMany({ where: { email } });
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      await (prisma as unknown as PrismaClient).$disconnect();
    }
  });

  it('has no self-registration surface', () => {
    // Accounts come from POST /admin/members; AuthService must not grow a
    // register() again without this test being reconsidered.
    expect((auth as unknown as Record<string, unknown>).register).toBeUndefined();
  });

  it('blocks login while PENDING, then succeeds once ACTIVE', async () => {
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
    // The old token is dead to anyone but the tab that just rotated it (see
    // the replay specs below) — from another client it is gone immediately.
    await expect(
      auth.refresh({ refreshToken: first.refreshToken }, { ...ctx, ipAddress: '198.51.100.7' }),
    ).rejects.toThrow();
    // Logout the rotated session.
    await auth.logout({ refreshToken: rotated.refreshToken, allDevices: true }, ctx);
    await expect(auth.refresh({ refreshToken: rotated.refreshToken }, ctx)).rejects.toThrow();
  });

  it('burns every session when a stolen refresh token is replayed', async () => {
    /**
     * Rotation alone does not survive a stolen token. Whoever redeems it
     * first holds a live session, and the loser sees one failed refresh and
     * simply logs in again — so a thief keeps rotating forever and nothing
     * ever says so.
     *
     * Here the victim rotates first, leaving the thief holding a stale copy.
     * Presenting it must not merely fail: it is proof the token was cloned,
     * so the victim's live session dies with it.
     */
    const stolen = await auth.login({ email, password }, ctx);
    await auth.refresh({ refreshToken: stolen.refreshToken }, ctx); // victim rotates

    const thiefCtx = { ipAddress: '203.0.113.9', userAgent: 'curl/8', requestId: 'thief' };
    await expect(auth.refresh({ refreshToken: stolen.refreshToken }, thiefCtx)).rejects.toThrow();

    // The thief gets nothing, and the victim's live session is gone too.
    const live = await prisma.session.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('does not punish two tabs racing to exchange the same token', async () => {
    /**
     * The refresh token lives in localStorage and every tab exchanges it on
     * load, so tabs restored together present the same one within
     * milliseconds. That is a race, not a burglary — treating it as theft
     * would log real users out for opening a second tab.
     */
    const first = await auth.login({ email, password }, ctx);
    await auth.refresh({ refreshToken: first.refreshToken }, ctx); // tab A
    const tabB = await auth.refresh({ refreshToken: first.refreshToken }, ctx); // tab B

    expect(tabB.accessToken).toBeTruthy();
    const live = await prisma.session.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBeGreaterThan(0);
  });

  it('resets the password with an emailed OTP, once, and revokes sessions', async () => {
    const live = await auth.login({ email, password }, ctx);

    await auth.forgotPassword(email, ctx);
    expect(sentOtp).toMatch(/^\d{6}$/);

    // A wrong code must not work, and must not consume the real one.
    await expect(auth.resetPassword(email, '000000', 'Rejected123')).rejects.toThrow(
      /invalid or expired/i,
    );

    const newPassword = 'Rotated456';
    await auth.resetPassword(email, sentOtp, newPassword);

    // Old password dead, new one live.
    await expect(auth.login({ email, password }, ctx)).rejects.toThrow();
    const after = await auth.login({ email, password: newPassword }, ctx);
    expect(after.accessToken).toBeTruthy();

    // A reset invalidates sessions that existed before it.
    await expect(auth.refresh({ refreshToken: live.refreshToken }, ctx)).rejects.toThrow();

    // The code is single use.
    await expect(auth.resetPassword(email, sentOtp, 'Another789')).rejects.toThrow(
      /invalid or expired/i,
    );

    // Requesting a new code retires the previous one.
    const first = sentOtp;
    await auth.forgotPassword(email, ctx);
    expect(sentOtp).not.toBe('');
    await expect(auth.resetPassword(email, first, 'Stale123456')).rejects.toThrow();
  });

  it('clears mustChangePassword when the member sets their own password', async () => {
    // Simulate an admin-issued account (POST /admin/members sets this flag).
    await prisma.user.update({ where: { email }, data: { mustChangePassword: true } });

    const issued = await auth.login({ email, password: 'Rotated456' }, ctx);
    expect(issued.accessToken).toBeTruthy();

    await expect(
      auth.changePassword(
        (await prisma.user.findUnique({ where: { email } }))!.id,
        'WrongOne1',
        'Chosen789',
        ctx,
      ),
    ).rejects.toThrow(/current password/i);

    const user = (await prisma.user.findUnique({ where: { email } }))!;
    const tokens = await auth.changePassword(user.id, 'Rotated456', 'Chosen789', ctx);
    expect(tokens.accessToken).toBeTruthy();

    const after = await prisma.user.findUnique({ where: { email } });
    expect(after?.mustChangePassword).toBe(false);

    // Old password dead, chosen one live.
    await expect(auth.login({ email, password: 'Rotated456' }, ctx)).rejects.toThrow();
    expect((await auth.login({ email, password: 'Chosen789' }, ctx)).accessToken).toBeTruthy();
  });

  it('locks out after too many failed attempts', async () => {
    const bad = { email, password: 'WrongPassword1' };
    for (let i = 0; i < 5; i++) {
      await auth.login(bad, ctx).catch(() => undefined);
    }
    await expect(auth.login({ email, password }, ctx)).rejects.toThrow(/Too many/i);
  });
});
