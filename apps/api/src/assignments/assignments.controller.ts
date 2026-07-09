import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { AssignmentsService } from './assignments.service';
import {
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  submitSchema,
  reviewEvaluationSchema,
  type CreateAssignmentDto,
  type ListAssignmentsQuery,
  type SubmitDto,
  type ReviewEvaluationDto,
} from './dto/assignment.schemas';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_CREATE)
  @ApiOperation({ summary: 'Create an assignment with a rubric (DRAFT)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAssignmentSchema)) dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(user.userId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_CREATE)
  @ApiOperation({ summary: 'List a batch’s assignments (staff)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listAssignmentsQuerySchema)) query: ListAssignmentsQuery,
  ) {
    return this.assignments.listForBatch(user.userId, query.batchId);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_CREATE)
  @ApiOperation({ summary: 'Publish an assignment (opens submissions)' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.publish(user.userId, id);
  }

  @Get(':id/submissions')
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_EVALUATE)
  @ApiOperation({ summary: 'List submissions for an assignment (with evaluations)' })
  submissions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.listSubmissions(user.userId, id);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_SUBMIT)
  @ApiOperation({ summary: 'Submit to an assignment (student)' })
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitSchema)) dto: SubmitDto,
  ) {
    return this.assignments.submit(user.userId, id, dto);
  }

  @Post('submissions/:id/evaluate')
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_EVALUATE)
  @ApiOperation({ summary: 'Trigger (re)evaluation of a submission' })
  evaluate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.evaluate(user.userId, id);
  }

  @Post('submissions/:id/review')
  @RequirePermissions(PERMISSIONS.ASSIGNMENT_EVALUATE)
  @ApiOperation({ summary: 'Trainer override + release feedback (human decision)' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewEvaluationSchema)) dto: ReviewEvaluationDto,
  ) {
    return this.assignments.review(user.userId, id, dto);
  }
}
