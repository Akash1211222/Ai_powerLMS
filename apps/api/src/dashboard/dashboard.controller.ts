import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { DashboardService } from './dashboard.service';

/**
 * Self-scoped dashboards (§8, §9). No extra permission needed — each endpoint
 * returns only the caller's own data (their enrollments / their batches).
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('student')
  @ApiOperation({ summary: "Aggregated student dashboard for the current user" })
  student(@CurrentUser() user: AuthUser) {
    return this.dashboard.student(user.userId);
  }

  @Get('trainer')
  @ApiOperation({ summary: "Aggregated trainer dashboard for the current user's batches" })
  trainer(@CurrentUser() user: AuthUser) {
    return this.dashboard.trainer(user.userId);
  }
}
