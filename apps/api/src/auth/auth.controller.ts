import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReqContext } from '../common/decorators/request-context.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type RequestContext } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth-user';
import {
  loginSchema,
  verifyEmailSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  type LoginDto,
  type VerifyEmailDto,
  type RefreshDto,
  type LogoutDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
  type ChangePasswordDto,
} from './dto/auth.schemas';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // No public registration: this is a paid LMS and accounts are created by an
  // admin via POST /admin/members. There is deliberately no self-signup route.

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email using the emailed token' })
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.login(dto, ctx);
  }

  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in to the shared read-and-write demo account (public, when enabled)',
  })
  demo(@ReqContext() ctx: RequestContext) {
    // Takes no body on purpose. There is nothing for a caller to choose here:
    // the account is fixed by configuration, so no input can steer which
    // session gets handed out.
    return this.auth.demoSignIn(ctx);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotates)' })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.refresh(dto, ctx);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session (or all sessions)' })
  logout(
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.logout(dto, ctx);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset code by email (always succeeds)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.forgotPassword(dto.email, ctx);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using the 6-digit code emailed to the account' })
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.otp, dto.password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Change your own password. Returns a fresh token pair, and clears the ' +
      'must-change-password lock on admin-issued accounts.',
  })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.password, ctx);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user with profile, roles & permissions' })
  async me(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        profile: true,
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            organization: true,
          },
        },
      },
    });
    if (!record) return null;

    const permissions = new Set<string>();
    const roles = record.roles.map((ur) => {
      ur.role.permissions.forEach((rp) => permissions.add(rp.permission.key));
      return {
        role: ur.role.name,
        organizationId: ur.organizationId,
        organizationName: ur.organization?.name ?? null,
      };
    });

    return {
      id: record.id,
      email: record.email,
      googleEmail: record.googleEmail,
      status: record.status,
      mustChangePassword: record.mustChangePassword,
      profile: record.profile
        ? {
            firstName: record.profile.firstName,
            lastName: record.profile.lastName,
            avatarUrl: record.profile.avatarUrl,
          }
        : null,
      roles,
      permissions: [...permissions],
    };
  }
}
