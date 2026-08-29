import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationQuerySchema,
  buildPaginationMeta,
  PERMISSIONS,
  type Paginated,
} from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';
import {
  listMembersQuerySchema,
  createMemberSchema,
  grantRoleSchema,
  revokeRoleSchema,
  updateFlagSchema,
  type ListMembersQuery,
  type CreateMemberDto,
  type GrantRoleDto,
  type RevokeRoleDto,
  type UpdateFlagDto,
} from './dto/admin.schemas';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
  ) {}

  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'List audit logs (paginated). Requires audit:view.' })
  async auditLogs(@Query() query: Record<string, unknown>): Promise<Paginated<unknown>> {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data: rows, meta: buildPaginationMeta(total, page, pageSize) };
  }

  @Get('members')
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @ApiOperation({ summary: 'List organization members with roles' })
  listMembers(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQuery,
  ) {
    return this.admin.listMembers(user.userId, query);
  }

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({
    summary:
      'Create a member (student, trainer, mentor, …). Replaces self-signup. ' +
      'Returns the issued password once so the admin can pass it on.',
  })
  createMember(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMemberSchema)) dto: CreateMemberDto,
  ) {
    return this.admin.createMember(user.userId, dto);
  }

  @Post('members/:userId/reset-password')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({
    summary:
      'Issue a new temporary password for a member who cannot sign in. ' +
      'Returns it once; the member must replace it at next login. ' +
      'Gated further by rank: you can only reset somebody below you.',
  })
  resetMemberPassword(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.admin.resetMemberPassword(user.userId, userId);
  }

  @Post('roles/grant')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Grant an org-scoped role to a member' })
  grantRole(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(grantRoleSchema)) dto: GrantRoleDto,
  ) {
    return this.admin.grantRole(user.userId, dto);
  }

  @Post('roles/revoke')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Revoke an org-scoped role from a member' })
  revokeRole(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(revokeRoleSchema)) dto: RevokeRoleDto,
  ) {
    return this.admin.revokeRole(user.userId, dto);
  }

  @Get('feature-flags')
  @RequirePermissions(PERMISSIONS.FEATURE_FLAG_MANAGE)
  @ApiOperation({ summary: 'List feature flags' })
  listFlags() {
    return this.admin.listFlags();
  }

  @Patch('feature-flags/:key')
  @RequirePermissions(PERMISSIONS.FEATURE_FLAG_MANAGE)
  @ApiOperation({ summary: 'Enable or disable a feature flag' })
  updateFlag(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateFlagSchema)) dto: UpdateFlagDto,
  ) {
    return this.admin.updateFlag(user.userId, key, dto.enabled);
  }
}
