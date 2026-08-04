import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import {
  applySchema,
  updateStatusSchema,
  type ApplyDto,
  type UpdateStatusDto,
} from './dto/application.schemas';

@ApiTags('applications')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  // --- Student ----------------------------------------------------------

  @Post('me/opportunities/:id/apply')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Apply to an opportunity (readiness-gated)' })
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applySchema)) dto: ApplyDto,
  ) {
    return this.applications.apply(user.userId, id, dto);
  }

  @Get('me/applications')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: "The current user's applications with status" })
  mine(@CurrentUser() user: AuthUser) {
    return this.applications.listMine(user.userId);
  }

  @Post('me/applications/:id/withdraw')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Withdraw one of your applications' })
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.withdraw(user.userId, id);
  }

  // --- Staff ------------------------------------------------------------

  @Get('opportunities/:id/applications')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Applications to an opportunity (staff)' })
  forOpportunity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.listForOpportunity(user.userId, id);
  }

  @Patch('applications/:id/status')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Advance/decide an application; notifies the student' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) dto: UpdateStatusDto,
  ) {
    return this.applications.updateStatus(user.userId, id, dto);
  }
}
