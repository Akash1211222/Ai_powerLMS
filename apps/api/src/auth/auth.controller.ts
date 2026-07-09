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
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type RegisterDto,
  type LoginDto,
  type VerifyEmailDto,
  type RefreshDto,
  type LogoutDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
} from './dto/auth.schemas';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new account (starts email verification)' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.register(dto, ctx);
  }

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
  @ApiOperation({ summary: 'Request a password reset link (always succeeds)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.forgotPassword(dto.email, ctx);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using the emailed token' })
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
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
      status: record.status,
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
