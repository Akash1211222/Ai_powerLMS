import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('student')
  @ApiOperation({ summary: "Aggregated student dashboard for the current user" })
  student(@CurrentUser() user: AuthUser) {
    return this.dashboard.student(user.userId);
  }

  @Get('trainer')
  @ApiOperation({
    summary:
      'The batches this person is responsible for — the ones a trainer is on, ' +
      "or the college's, for whoever runs it. Defaults to their primary college.",
  })
  trainer(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.dashboard.trainer(user.userId, organizationId);
  }

  @Get('placement')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Placement officer dashboard (pipeline + openings)' })
  placement(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId: string) {
    return this.dashboard.placement(user.userId, organizationId);
  }

  @Get('admin')
  @RequirePermissions(PERMISSIONS.ANALYTICS_VIEW)
  @ApiOperation({ summary: 'College admin org-wide dashboard' })
  admin(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId: string) {
    return this.dashboard.admin(user.userId, organizationId);
  }
}
