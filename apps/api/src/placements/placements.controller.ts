import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PlacementsService } from './placements.service';
import {
  createJobSchema,
  updateJobSchema,
  listJobsQuerySchema,
  applyJobSchema,
  updateApplicationSchema,
  updateProfileSchema,
  type CreateJobDto,
  type UpdateJobDto,
  type ListJobsQuery,
  type ApplyJobDto,
  type UpdateApplicationDto,
  type UpdateProfileDto,
} from './dto/placement.schemas';

@ApiTags('placements')
@ApiBearerAuth()
@Controller('placements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlacementsController {
  constructor(private readonly placements: PlacementsService) {}

  // --- Officer: job CRUD ------------------------------------------------

  @Post('jobs')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Create a job posting (DRAFT)' })
  createJob(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto,
  ) {
    return this.placements.createJob(user.userId, dto);
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'List job postings in an organization' })
  listJobs(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listJobsQuerySchema)) query: ListJobsQuery,
  ) {
    return this.placements.listJobs(user.userId, query);
  }

  @Get('jobs/open')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'List OPEN jobs for students (includes own application)' })
  listOpen(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId: string,
  ) {
    return this.placements.listOpenJobs(user.userId, organizationId);
  }

  @Get('jobs/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Get a job posting' })
  getJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placements.getJob(user.userId, id);
  }

  @Patch('jobs/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Update a job posting' })
  updateJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateJobSchema)) dto: UpdateJobDto,
  ) {
    return this.placements.updateJob(user.userId, id, dto);
  }

  @Post('jobs/:id/publish')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Publish a job (OPEN) and notify students' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placements.publishJob(user.userId, id);
  }

  @Post('jobs/:id/close')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Close a job posting' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placements.closeJob(user.userId, id);
  }

  @Get('jobs/:id/applications')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'List applicants for a job (pipeline)' })
  applications(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placements.listApplications(user.userId, id);
  }

  @Get('jobs/:id/eligible')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Eligible students ranked by match score' })
  eligible(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.placements.eligibleStudents(user.userId, id);
  }

  @Post('jobs/:id/apply')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Apply to an open job (student)' })
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applyJobSchema)) dto: ApplyJobDto,
  ) {
    return this.placements.apply(user.userId, id, dto);
  }

  @Patch('applications/:id')
  @RequirePermissions(PERMISSIONS.PLACEMENT_MANAGE)
  @ApiOperation({ summary: 'Advance / update application status' })
  updateApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationSchema)) dto: UpdateApplicationDto,
  ) {
    return this.placements.updateApplication(user.userId, id, dto);
  }

  // --- Profile ----------------------------------------------------------

  @Get('profile')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Get own placement profile' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.placements.getProfile(user.userId);
  }

  @Patch('profile')
  @RequirePermissions(PERMISSIONS.PLACEMENT_VIEW)
  @ApiOperation({ summary: 'Create or update own placement profile' })
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.placements.upsertProfile(user.userId, dto);
  }
}
