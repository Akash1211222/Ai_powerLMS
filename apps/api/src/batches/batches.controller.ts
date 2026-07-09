import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { BatchesService } from './batches.service';
import {
  createBatchSchema,
  updateBatchSchema,
  listBatchesQuerySchema,
  addStudentSchema,
  assignTrainerSchema,
  addScheduleSchema,
  type CreateBatchDto,
  type UpdateBatchDto,
  type ListBatchesQuery,
  type AddStudentDto,
  type AssignTrainerDto,
  type AddScheduleDto,
} from './dto/batch.schemas';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('batches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.BATCH_CREATE)
  @ApiOperation({ summary: 'Create a batch for a course' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBatchSchema)) dto: CreateBatchDto,
  ) {
    return this.batches.create(user.userId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'List batches in an organization (paginated)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listBatchesQuerySchema)) query: ListBatchesQuery,
  ) {
    return this.batches.list(user.userId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'Get a batch with course, trainers and schedule' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.batches.getById(user.userId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BATCH_MANAGE)
  @ApiOperation({ summary: 'Update batch details/status' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchSchema)) dto: UpdateBatchDto,
  ) {
    return this.batches.update(user.userId, id, dto);
  }

  @Get(':id/students')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'List active students in a batch' })
  listStudents(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.batches.listStudents(user.userId, id);
  }

  @Post(':id/students')
  @RequirePermissions(PERMISSIONS.BATCH_MANAGE)
  @ApiOperation({ summary: 'Add a student (enrolls them in the course)' })
  addStudent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addStudentSchema)) dto: AddStudentDto,
  ) {
    return this.batches.addStudent(user.userId, id, dto);
  }

  @Delete(':id/students/:studentId')
  @RequirePermissions(PERMISSIONS.BATCH_MANAGE)
  @ApiOperation({ summary: 'Remove a student from a batch' })
  removeStudent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.batches.removeStudent(user.userId, id, studentId);
  }

  @Post(':id/trainers')
  @RequirePermissions(PERMISSIONS.BATCH_MANAGE)
  @ApiOperation({ summary: 'Assign a trainer to a batch' })
  assignTrainer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignTrainerSchema)) dto: AssignTrainerDto,
  ) {
    return this.batches.assignTrainer(user.userId, id, dto);
  }

  @Post(':id/schedules')
  @RequirePermissions(PERMISSIONS.BATCH_MANAGE)
  @ApiOperation({ summary: 'Add a session to the batch schedule' })
  addSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addScheduleSchema)) dto: AddScheduleDto,
  ) {
    return this.batches.addSchedule(user.userId, id, dto);
  }
}
