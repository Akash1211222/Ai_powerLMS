import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('me/batches/health')
  @RequirePermissions(PERMISSIONS.ANALYTICS_VIEW)
  @ApiOperation({ summary: 'Health of every batch the current trainer runs' })
  myBatches(@CurrentUser() user: AuthUser) {
    return this.analytics.myBatchesHealth(user.userId);
  }

  @Get('batches/:id/health')
  @RequirePermissions(PERMISSIONS.ANALYTICS_VIEW)
  @ApiOperation({ summary: 'Batch health rollup + per-student breakdown' })
  batch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.analytics.batchHealth(user.userId, id);
  }
}
