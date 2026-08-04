import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ReputationService } from './reputation.service';

@ApiTags('reputation')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Get('me/reputation')
  @ApiOperation({ summary: 'Your contribution score, breakdown and earned badges' })
  mine(@CurrentUser() user: AuthUser) {
    return this.reputation.mine(user.userId);
  }

  @Get('community/leaderboard')
  @ApiOperation({ summary: 'Top contributors in your organization' })
  leaderboard(@CurrentUser() user: AuthUser) {
    return this.reputation.leaderboard(user.userId);
  }
}
