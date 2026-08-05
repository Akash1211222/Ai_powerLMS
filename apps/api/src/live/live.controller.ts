import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LiveService } from './live.service';
import {
  heartbeatSchema,
  lessonProgressSchema,
  liveReportQuerySchema,
  scheduleLiveClassSchema,
  setLessonVideoSchema,
  type HeartbeatDto,
  type LessonProgressDto,
  type LiveReportQuery,
  type ScheduleLiveClassDto,
  type SetLessonVideoDto,
} from './dto/live.schemas';

@ApiTags('live')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LiveController {
  constructor(private readonly live: LiveService) {}

  // --- Course videos ----------------------------------------------------

  @Put('lessons/:id/video')
  @RequirePermissions(PERMISSIONS.COURSE_VIEW)
  @ApiOperation({ summary: 'Attach / update a course lesson video URL (trainer)' })
  setVideo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setLessonVideoSchema)) dto: SetLessonVideoDto,
  ) {
    return this.live.setLessonVideo(user.userId, id, dto);
  }

  @Post('lessons/:id/progress')
  @ApiOperation({ summary: 'Track lesson video watch progress (student)' })
  progress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(lessonProgressSchema)) dto: LessonProgressDto,
  ) {
    return this.live.trackLessonProgress(user.userId, id, dto);
  }

  // --- Live classes -----------------------------------------------------

  @Post('live-classes')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'Schedule a live class — auto-creates a Google Meet link + notifies students' })
  schedule(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(scheduleLiveClassSchema)) dto: ScheduleLiveClassDto,
  ) {
    return this.live.schedule(user.userId, dto);
  }

  @Get('batches/:id/live-classes')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'List live classes for a batch' })
  listForBatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.listForBatch(user.userId, id);
  }

  @Get('live-classes/upcoming')
  @ApiOperation({ summary: 'Upcoming live classes for the current student' })
  upcoming(@CurrentUser() user: AuthUser) {
    return this.live.upcomingForStudent(user.userId);
  }

  @Get('live-classes/reports')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: 'Live-class attendance reports (teacher / college admin / placement)' })
  report(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(liveReportQuerySchema)) query: LiveReportQuery,
  ) {
    return this.live.report(user.userId, query);
  }

  @Get('live-classes/:id')
  @ApiOperation({ summary: 'Live class detail + presence roster' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.getOne(user.userId, id);
  }

  @Post('live-classes/:id/join')
  @ApiOperation({ summary: 'Student joins live class — returns Meet URL and starts watch timer' })
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.join(user.userId, id);
  }

  @Post('live-classes/:id/heartbeat')
  @ApiOperation({ summary: 'Presence heartbeat — accumulates watched seconds' })
  heartbeat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(heartbeatSchema)) dto: HeartbeatDto,
  ) {
    return this.live.heartbeat(user.userId, id, dto);
  }

  @Post('live-classes/:id/leave')
  @ApiOperation({ summary: 'Student leaves the live class' })
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.leave(user.userId, id);
  }

  @Post('live-classes/:id/end')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'End class — auto-mark attendance from watch %, update streaks, share report' })
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.endClass(user.userId, id);
  }

  @Get('me/attendance-streak')
  @ApiOperation({ summary: 'Current attendance streak for the logged-in student' })
  streak(@CurrentUser() user: AuthUser) {
    return this.live.myStreak(user.userId);
  }
}
