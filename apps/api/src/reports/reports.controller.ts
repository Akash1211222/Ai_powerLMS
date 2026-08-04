import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // --- Student self-service ---------------------------------------------

  @Get('me/reports')
  @ApiOperation({ summary: "The current user's recent weekly progress reports" })
  mine(@CurrentUser() user: AuthUser) {
    return this.reports.listMine(user.userId);
  }

  @Get('me/reports/:id')
  @ApiOperation({ summary: 'One of the current user’s weekly reports (full detail)' })
  mineOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.getMine(user.userId, id);
  }

  @Post('me/reports/generate')
  @ApiOperation({ summary: "Generate this week's report for yourself (idempotent)" })
  generateMine(@CurrentUser() user: AuthUser) {
    return this.reports.generateMine(user.userId);
  }

  // --- Staff ------------------------------------------------------------

  @Get('students/:id/reports')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's weekly progress reports (staff)" })
  studentReports(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.listForStudent(user.userId, id);
  }

  @Post('students/:id/reports/generate')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "Generate this week's report for a student now (idempotent)" })
  generateForStudent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.generateForStudent(user.userId, id);
  }
}
