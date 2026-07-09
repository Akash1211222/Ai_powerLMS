import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CoursesService } from './courses.service';
import {
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
  createModuleSchema,
  createLessonSchema,
  type CreateCourseDto,
  type UpdateCourseDto,
  type ListCoursesQuery,
  type CreateModuleDto,
  type CreateLessonDto,
} from './dto/course.schemas';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.COURSE_CREATE)
  @ApiOperation({ summary: 'Create a course (DRAFT)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCourseSchema)) dto: CreateCourseDto,
  ) {
    return this.courses.create(user.userId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.COURSE_VIEW)
  @ApiOperation({ summary: 'List courses in an organization (paginated)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listCoursesQuerySchema)) query: ListCoursesQuery,
  ) {
    return this.courses.list(user.userId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COURSE_VIEW)
  @ApiOperation({ summary: 'Get a course with modules and lessons' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.getById(user.userId, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COURSE_UPDATE)
  @ApiOperation({ summary: 'Update course details' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCourseSchema)) dto: UpdateCourseDto,
  ) {
    return this.courses.update(user.userId, id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.COURSE_PUBLISH)
  @ApiOperation({ summary: 'Publish a course (requires >= 1 lesson)' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.publish(user.userId, id);
  }

  @Post(':id/unpublish')
  @RequirePermissions(PERMISSIONS.COURSE_PUBLISH)
  @ApiOperation({ summary: 'Return a course to DRAFT' })
  unpublish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.unpublish(user.userId, id);
  }

  @Post(':id/modules')
  @RequirePermissions(PERMISSIONS.COURSE_UPDATE)
  @ApiOperation({ summary: 'Add a module to a course' })
  addModule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createModuleSchema)) dto: CreateModuleDto,
  ) {
    return this.courses.addModule(user.userId, id, dto);
  }

  @Post('modules/:moduleId/lessons')
  @RequirePermissions(PERMISSIONS.COURSE_UPDATE)
  @ApiOperation({ summary: 'Add a lesson to a module' })
  addLesson(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(createLessonSchema)) dto: CreateLessonDto,
  ) {
    return this.courses.addLesson(user.userId, moduleId, dto);
  }
}
