import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OpportunitiesService } from './opportunities.service';
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  listOpportunitiesQuerySchema,
  type CreateOpportunityDto,
  type UpdateOpportunityDto,
  type ListOpportunitiesQuery,
} from './dto/opportunity.schemas';

@ApiTags('opportunities')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  // --- Student discovery ------------------------------------------------

  @Get('me/opportunities')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'OPEN opportunities in your org, with eligibility + skill match' })
  discover(@CurrentUser() user: AuthUser) {
    return this.opportunities.discover(user.userId);
  }

  @Get('me/opportunities/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'One OPEN opportunity with your fit' })
  discoverOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.opportunities.discoverOne(user.userId, id);
  }

  // --- Staff management -------------------------------------------------

  @Post('opportunities')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Create a draft opportunity' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createOpportunitySchema)) dto: CreateOpportunityDto) {
    return this.opportunities.create(user.userId, dto);
  }

  @Get('opportunities')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'List opportunities for an organization (staff)' })
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listOpportunitiesQuerySchema)) query: ListOpportunitiesQuery) {
    return this.opportunities.list(user.userId, query);
  }

  @Get('opportunities/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Get an opportunity (staff)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.opportunities.getForStaff(user.userId, id);
  }

  @Patch('opportunities/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Update an opportunity' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOpportunitySchema)) dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(user.userId, id, dto);
  }

  @Post('opportunities/:id/publish')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Publish an opportunity (OPEN) + notify open-to-work students' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.opportunities.publish(user.userId, id);
  }

  @Post('opportunities/:id/close')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Close an opportunity' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.opportunities.close(user.userId, id);
  }
}
