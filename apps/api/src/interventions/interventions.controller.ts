import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { InterventionsService } from './interventions.service';

@ApiTags('interventions')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterventionsController {
  constructor(private readonly interventions: InterventionsService) {}

  // --- Student self-service ---------------------------------------------

  @Get('me/interventions')
  @ApiOperation({ summary: "The current user's active intervention (with plan) + history" })
  mine(@CurrentUser() user: AuthUser) {
    return this.interventions.getMine(user.userId);
  }

  @Post('me/recovery-tasks/:id/complete')
  @ApiOperation({ summary: 'Complete one of your recovery tasks (recalculates on the last one)' })
  completeTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interventions.completeTask(user.userId, id);
  }

  // --- Staff ------------------------------------------------------------

  @Get('students/:id/interventions')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's interventions with plans (staff)" })
  studentInterventions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interventions.getStudentInterventions(user.userId, id);
  }

  @Post('interventions/:id/generate-plan')
  @RequirePermissions(PERMISSIONS.STUDENT_INTERVENE)
  @ApiOperation({ summary: 'Generate the recovery plan now (idempotent)' })
  generatePlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interventions.generatePlan(user.userId, id);
  }

  @Post('interventions/:id/resolve')
  @RequirePermissions(PERMISSIONS.STUDENT_INTERVENE)
  @ApiOperation({ summary: 'Resolve an intervention (staff decision)' })
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interventions.resolve(user.userId, id);
  }
}
