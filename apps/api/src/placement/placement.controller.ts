import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PlacementService } from './placement.service';

@ApiTags('placement')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  @Get('me/placement')
  @ApiOperation({ summary: "The current user's placement readiness + checklist" })
  mine(@CurrentUser() user: AuthUser) {
    return this.placement.mine(user.userId);
  }

  @Get('students/:id/placement')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's placement readiness (staff)" })
  forStudent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placement.forStudent(user.userId, id);
  }

  @Get('batches/:id/placement')
  @RequirePermissions(PERMISSIONS.ANALYTICS_VIEW)
  @ApiOperation({ summary: 'Cohort placement readiness for a batch (placement officer)' })
  forBatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placement.forBatch(user.userId, id);
  }
}
