import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('me/recommendations')
  @ApiOperation({ summary: "The current user's ranked next-best-actions" })
  mine(@CurrentUser() user: AuthUser) {
    return this.recommendations.mine(user.userId);
  }

  @Get('students/:id/recommendations')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's ranked next-best-actions (staff)" })
  forStudent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recommendations.forStudent(user.userId, id);
  }
}
