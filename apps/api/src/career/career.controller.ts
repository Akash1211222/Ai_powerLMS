import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CareerService } from './career.service';
import {
  updateProfileSchema,
  projectSchema,
  experienceSchema,
  type UpdateProfileDto,
  type ProjectDto,
  type ExperienceDto,
} from './dto/career.schemas';

@ApiTags('career')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CareerController {
  constructor(private readonly career: CareerService) {}

  // --- Profile (owner) --------------------------------------------------

  @Get('me/career-profile')
  @ApiOperation({ summary: "The current user's career profile (created on first access)" })
  mine(@CurrentUser() user: AuthUser) {
    return this.career.getOrCreate(user.userId);
  }

  @Put('me/career-profile')
  @ApiOperation({ summary: 'Update your career profile fields' })
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto) {
    return this.career.updateProfile(user.userId, dto);
  }

  @Get('me/career-profile/resume')
  @ApiOperation({ summary: 'Assembled resume: profile + top skills + placement readiness' })
  resume(@CurrentUser() user: AuthUser) {
    return this.career.resume(user.userId);
  }

  // --- Projects ---------------------------------------------------------

  @Post('me/career-profile/projects')
  @ApiOperation({ summary: 'Add a portfolio project' })
  addProject(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(projectSchema)) dto: ProjectDto) {
    return this.career.addProject(user.userId, dto);
  }

  @Patch('me/career-profile/projects/:id')
  @ApiOperation({ summary: 'Update a portfolio project' })
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(projectSchema)) dto: ProjectDto,
  ) {
    return this.career.updateProject(user.userId, id, dto);
  }

  @Delete('me/career-profile/projects/:id')
  @ApiOperation({ summary: 'Delete a portfolio project' })
  deleteProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.career.deleteProject(user.userId, id);
  }

  // --- Experiences ------------------------------------------------------

  @Post('me/career-profile/experiences')
  @ApiOperation({ summary: 'Add a work/education/certification entry' })
  addExperience(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(experienceSchema)) dto: ExperienceDto) {
    return this.career.addExperience(user.userId, dto);
  }

  @Patch('me/career-profile/experiences/:id')
  @ApiOperation({ summary: 'Update a timeline entry' })
  updateExperience(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(experienceSchema)) dto: ExperienceDto,
  ) {
    return this.career.updateExperience(user.userId, id, dto);
  }

  @Delete('me/career-profile/experiences/:id')
  @ApiOperation({ summary: 'Delete a timeline entry' })
  deleteExperience(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.career.deleteExperience(user.userId, id);
  }

  // --- Staff/officer view ----------------------------------------------

  @Get('students/:id/career-profile')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's shared career profile + resume (staff/officer)" })
  studentProfile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.career.getStudentProfile(user.userId, id);
  }
}
