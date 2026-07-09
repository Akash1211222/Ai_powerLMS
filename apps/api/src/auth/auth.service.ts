import {
  Injectable,
  ConflictException,
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
import type {
  RegisterDto,
  LoginDto,
  RefreshDto,
  LogoutDto,
} from './dto/auth.schemas';

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

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

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

  // ---- Registration ------------------------------------------------------

  async register(dto: RegisterDto, ctx: RequestContext): Promise<{ userId: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // Avoid account enumeration nuance: registration legitimately conflicts.
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const { raw, hash } = this.tokens.createOpaqueToken();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          status: 'PENDING',
          profile: { create: { firstName: dto.firstName, lastName: dto.lastName } },
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      });
      return created;
    });

    await this.mail.sendEmailVerification(dto.email, raw);
    await this.audit.record({
      action: 'auth.register',
      actorUserId: user.id,
      targetType: 'User',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
      requestId: ctx.requestId,
    });

    return { userId: user.id };
  }

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
    const ok = user ? await this.passwords.verify(user.passwordHash, dto.password) : false;

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

    const tokens = await this.issueSession(user.id, user.email, ctx);

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

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
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
    });

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
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
          data: { revokedAt: new Date() },
        });
      } else {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
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

  // ---- Password reset ----------------------------------------------------

  async forgotPassword(email: string, ctx: RequestContext): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always respond success — never reveal whether the email exists (§39).
    if (user && user.status !== 'DEACTIVATED') {
      const { raw, hash } = this.tokens.createOpaqueToken();
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.mail.sendPasswordReset(email, raw);
      await this.audit.record({
        action: 'auth.password.reset_requested',
        actorUserId: user.id,
        ipAddress: ctx.ipAddress,
        requestId: ctx.requestId,
      });
    }
    return { success: true };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ success: true }> {
    const tokenHash = this.tokens.hashOpaqueToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      // Revoke all sessions — a reset invalidates existing logins (§6, §39).
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
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
  ): Promise<AuthTokens> {
    const refresh = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.signAccessToken({ sub: userId, email });
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
