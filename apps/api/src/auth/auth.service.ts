import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { LoginDto, RefreshDto, LogoutDto } from './dto/auth.schemas';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const RESET_TTL_MS = 15 * 60 * 1000; // 15m — short, because a 6-digit OTP is weaker than an opaque token

/**
 * How long after rotation a repeat of the same refresh token can still be a
 * race between two tabs rather than a stolen token. Seconds, not minutes: it
 * only has to cover concurrent page loads.
 */
const REPLAY_GRACE_MS = 15_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(config.get('LOGIN_MAX_ATTEMPTS') ?? 5);
    this.lockoutMs = Number(config.get('LOGIN_LOCKOUT_MINUTES') ?? 15) * 60 * 1000;
  }

  // Registration is intentionally absent: this is a paid LMS, so accounts are
  // created by an admin (POST /admin/members), never self-served.

  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const tokenHash = this.tokens.hashOpaqueToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'auth.email.verified',
      actorUserId: record.userId,
      targetType: 'User',
      targetId: record.userId,
    });
    return { verified: true };
  }

  // ---- Login -------------------------------------------------------------

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthTokens> {
    await this.assertNotLockedOut(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Hash either way. Skipping the work when there is no account answers a
    // stranger's "does this person study here?" in about a fifth of the time
    // it takes to answer "is this their password?" — same words, different
    // duration, and the roster leaks through the gap.
    const ok = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyDecoy(dto.password);

    if (!user || !ok) {
      await this.recordLoginAttempt(dto.email, ctx, false, user ? 'bad_password' : 'no_user');
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'PENDING') {
      await this.recordLoginAttempt(dto.email, ctx, false, 'email_unverified');
      throw new UnauthorizedException('Please verify your email before signing in');
    }
    if (user.status !== 'ACTIVE') {
      await this.recordLoginAttempt(dto.email, ctx, false, 'inactive');
      throw new UnauthorizedException('This account is not active');
    }

    const tokens = await this.issueSession(user.id, user.email, ctx, user.mustChangePassword);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.recordLoginAttempt(dto.email, ctx, true, null);
    await this.audit.record({
      action: 'auth.login',
      actorUserId: user.id,
      targetType: 'User',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
      requestId: ctx.requestId,
    });

    return tokens;
  }

  // ---- Refresh (rotation) ------------------------------------------------

  async refresh(dto: RefreshDto, ctx: RequestContext): Promise<AuthTokens> {
    const hash = this.tokens.hashRefreshToken(dto.refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    /**
     * A refresh token presented twice is proof that a copy of it exists.
     *
     * Rotation on its own does not survive theft: whoever redeems the token
     * first gets the live session, and the loser sees a single failed refresh
     * and simply logs in again. If that loser is the real user, the thief
     * keeps rotating a valid session indefinitely and nothing ever says so.
     *
     * So a replay burns the whole family — including the token that replaced
     * this one — and the user has to sign in again. Whichever side was the
     * thief, they are left holding nothing.
     *
     * Except that one honest client also replays: the token lives in
     * localStorage and every tab exchanges it on load, so two tabs restored
     * together both present the same one. That is a race, not a burglary, and
     * treating it as theft would log real users out for opening a second tab.
     * A replay is therefore only benign when it arrives within seconds, from
     * the same address and the same browser as the session it is replaying —
     * anything else is treated as stolen.
     *
     * The grace is limited to sessions that ended by *rotation*. One ended by
     * logout, a password change or reuse detection must stop working at once:
     * those are what a user reaches for when they think they are compromised,
     * and a session that outlived them by even a few seconds would make them
     * a lie.
     */
    if (session?.revokedAt) {
      const sinceRevoked = Date.now() - session.revokedAt.getTime();
      const sameClient =
        session.ipAddress === (ctx.ipAddress ?? null) &&
        session.userAgent === (ctx.userAgent ?? null);
      const concurrentRetry =
        session.revokedReason === 'ROTATED' && sinceRevoked <= REPLAY_GRACE_MS && sameClient;

      if (!concurrentRetry) {
        await this.prisma.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
        });
        this.logger.warn(
          `Refresh token replay for user ${session.userId} — every live session revoked`,
        );
        await this.audit.record({
          action: 'auth.refresh.reuse_detected',
          actorUserId: session.userId,
          targetType: 'User',
          targetId: session.userId,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
        });
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
    }

    // Deliberately one message for every failure: telling a caller that a
    // token was *revoked* rather than unknown confirms it was once real.
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate: revoke the old session and issue a new one atomically.
    const next = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.signAccessToken({
      sub: session.userId,
      email: session.user.email,
      ...(session.user.mustChangePassword ? { mcp: true } : {}),
    });

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      }),
      this.prisma.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: next.hash,
          expiresAt: next.expiresAt,
          userAgent: ctx.userAgent ?? null,
          ipAddress: ctx.ipAddress ?? null,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken: next.raw,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  // ---- Logout ------------------------------------------------------------

  async logout(dto: LogoutDto, ctx: RequestContext): Promise<{ success: true }> {
    const hash = this.tokens.hashRefreshToken(dto.refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });

    if (session && !session.revokedAt) {
      if (dto.allDevices) {
        await this.prisma.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
        });
      } else {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
        });
      }
      await this.audit.record({
        action: dto.allDevices ? 'auth.logout.all' : 'auth.logout',
        actorUserId: session.userId,
        targetType: 'Session',
        targetId: session.id,
        ipAddress: ctx.ipAddress,
        requestId: ctx.requestId,
      });
    }
    // Idempotent: logging out an unknown/revoked token still succeeds.
    return { success: true };
  }

  // ---- Password change (authenticated) -----------------------------------

  /**
   * Replace your own password. Also the only way out of the
   * mustChangePassword lock, so it returns a fresh token pair — otherwise the
   * caller would keep the `mcp` claim until their access token expired and
   * stay locked out of the app they just unlocked.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found');

    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      // Any other session was established with the old password — drop them.
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGE' },
      }),
    ]);

    await this.audit.record({
      action: 'auth.password.changed',
      actorUserId: user.id,
      targetType: 'User',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
      requestId: ctx.requestId,
    });

    return this.issueSession(user.id, user.email, ctx, false);
  }

  // ---- Password reset ----------------------------------------------------

  async forgotPassword(email: string, ctx: RequestContext): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always respond success — never reveal whether the email exists (§39).
    if (user && user.status !== 'DEACTIVATED') {
      const { code, hash } = this.tokens.createOtp();
      // Invalidate any outstanding codes: requesting a new one must retire the
      // old, so only the most recent code in the user's inbox ever works.
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.mail.sendPasswordResetOtp(email, code, RESET_TTL_MS / 60000);
      await this.audit.record({
        action: 'auth.password.reset_requested',
        actorUserId: user.id,
        ipAddress: ctx.ipAddress,
        requestId: ctx.requestId,
      });
    }
    return { success: true };
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ success: true }> {
    // Scope the lookup to the user rather than searching by code hash alone:
    // 6-digit codes collide across users, so a global hash lookup could match
    // a different account's code.
    const user = await this.prisma.user.findUnique({ where: { email } });
    const tokenHash = this.tokens.hashOpaqueToken(otp);
    const record = user
      ? await this.prisma.passwordResetToken.findFirst({
          where: { userId: user.id, tokenHash, consumedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    // One message for every failure mode — never reveal whether the address
    // exists, only that this code is not usable.
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        // Choosing a password via the emailed code satisfies the requirement.
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      // Revoke all sessions — a reset invalidates existing logins (§6, §39).
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      }),
    ]);

    await this.audit.record({
      action: 'auth.password.reset',
      actorUserId: record.userId,
      targetType: 'User',
      targetId: record.userId,
    });
    return { success: true };
  }

  // ---- Helpers -----------------------------------------------------------

  private async issueSession(
    userId: string,
    email: string,
    ctx: RequestContext,
    mustChangePassword = false,
  ): Promise<AuthTokens> {
    const refresh = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.signAccessToken({
      sub: userId,
      email,
      ...(mustChangePassword ? { mcp: true } : {}),
    });
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
      },
    });
    return {
      accessToken,
      refreshToken: refresh.raw,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  private async assertNotLockedOut(email: string): Promise<void> {
    const since = new Date(Date.now() - this.lockoutMs);
    const recentFailures = await this.prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: since } },
    });
    if (recentFailures >= this.maxAttempts) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordLoginAttempt(
    email: string,
    ctx: RequestContext,
    success: boolean,
    reason: string | null,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: { email, ipAddress: ctx.ipAddress ?? null, success, reason },
    });
  }
}
