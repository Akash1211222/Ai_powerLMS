import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { AssessmentsService } from './assessments.service';
import {
  createAssessmentSchema,
  listAssessmentsQuerySchema,
  submitAttemptSchema,
  type CreateAssessmentDto,
  type ListAssessmentsQuery,
  type SubmitAttemptDto,
} from './dto/assessment.schemas';

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ASSESSMENT_CREATE)
  @ApiOperation({ summary: 'Create an assessment with questions (DRAFT)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAssessmentSchema)) dto: CreateAssessmentDto,
  ) {
    return this.assessments.create(user.userId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ASSESSMENT_CREATE)
  @ApiOperation({ summary: 'List a batch’s assessments (staff)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listAssessmentsQuerySchema)) query: ListAssessmentsQuery,
  ) {
    return this.assessments.listForBatch(user.userId, query.batchId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ASSESSMENT_CREATE)
  @ApiOperation({ summary: 'Get an assessment with questions + answer key (staff)' })
  getStaff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assessments.getForStaff(user.userId, id);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.ASSESSMENT_CREATE)
  @ApiOperation({ summary: 'Publish an assessment (opens attempts)' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assessments.publish(user.userId, id);
  }

  @Get(':id/attempts')
  @RequirePermissions(PERMISSIONS.ASSESSMENT_GRADE)
  @ApiOperation({ summary: 'List graded attempts with topic breakdowns' })
  attempts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assessments.listAttempts(user.userId, id);
  }

  // --- Student (auth + enrollment; no special permission) ---------------

  @Post(':id/attempts')
  @ApiOperation({ summary: 'Start an attempt (returns questions without answers)' })
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assessments.startAttempt(user.userId, id);
  }

  @Post('attempts/:id/submit')
  @ApiOperation({ summary: 'Submit an attempt for auto-grading' })
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitAttemptSchema)) dto: SubmitAttemptDto,
  ) {
    return this.assessments.submitAttempt(user.userId, id, dto);
  }
}
