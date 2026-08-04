import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { IntelligenceService } from './intelligence.service';

@ApiTags('intelligence')
@ApiBearerAuth()
@Controller('intelligence')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get('me')
  @ApiOperation({ summary: "Current user's own intelligence report" })
  me(@CurrentUser() user: AuthUser) {
    return this.intelligence.me(user.userId);
  }

  @Get('students')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: 'Cohort intelligence: all active students with risk insights' })
  cohort(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.intelligence.cohort(user.userId, organizationId, batchId || undefined);
  }

  @Get('students/:id')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: 'Detailed intelligence report for one student' })
  student(
    @CurrentUser() user: AuthUser,
    @Param('id') studentUserId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return this.intelligence.studentReport(user.userId, organizationId, studentUserId);
  }
}
