import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReferralsService } from './referrals.service';
import {
  createReferralSchema,
  reviewReferralSchema,
  type CreateReferralDto,
  type ReviewReferralDto,
} from './dto/referral.schemas';

@ApiTags('referrals')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('opportunities/:id/referrals')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Vouch for a student on an open opportunity (alumni/mentors)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createReferralSchema)) dto: CreateReferralDto,
  ) {
    return this.referrals.create(user.userId, id, dto);
  }

  @Get('me/referrals')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Referrals you made and received' })
  mine(@CurrentUser() user: AuthUser) {
    return this.referrals.mine(user.userId);
  }

  @Get('opportunities/:id/referrals')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'All vouches on an opportunity (staff)' })
  forOpportunity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referrals.listForOpportunity(user.userId, id);
  }

  @Patch('referrals/:id/status')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Acknowledge or decline a referral (staff)' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewReferralSchema)) dto: ReviewReferralDto,
  ) {
    return this.referrals.review(user.userId, id, dto);
  }
}
