import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
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
  importMeetAttendanceSchema,
  lessonProgressSchema,
  liveNotesQuerySchema,
  liveReportQuerySchema,
  scheduleLiveClassSchema,
  setLessonVideoSchema,
  updateGoogleEmailSchema,
  updateLiveSummarySchema,
  type HeartbeatDto,
  type ImportMeetAttendanceDto,
  type LessonProgressDto,
  type LiveNotesQuery,
  type LiveReportQuery,
  type ScheduleLiveClassDto,
  type SetLessonVideoDto,
  type UpdateGoogleEmailDto,
  type UpdateLiveSummaryDto,
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
  @ApiOperation({ summary: 'Schedule a live class — paste Google Meet URL; books LMS calendar + notifies batch' })
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

  @Get('live-classes/notes')
  @ApiOperation({ summary: 'Session summaries / keypoints / homework / Q&A for a course or batch' })
  notes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(liveNotesQuerySchema)) query: LiveNotesQuery,
  ) {
    return this.live.listNotes(user.userId, query);
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

  @Patch('live-classes/:id/summary')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'Update session summary, keypoints, homework, and Q&A (trainer)' })
  updateSummary(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLiveSummarySchema)) dto: UpdateLiveSummaryDto,
  ) {
    return this.live.updateSummary(user.userId, id, dto);
  }

  @Post('live-classes/:id/attendance/import')
  @RequirePermissions(PERMISSIONS.BATCH_VIEW)
  @ApiOperation({ summary: 'Import Google Meet attendance CSV — match by registered Google email' })
  importAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(importMeetAttendanceSchema)) dto: ImportMeetAttendanceDto,
  ) {
    return this.live.importMeetAttendance(user.userId, id, dto);
  }

  @Post('live-classes/:id/join')
  @ApiOperation({ summary: 'Student joins live class — returns Meet URL and starts soft presence timer' })
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.join(user.userId, id);
  }

  @Post('live-classes/:id/heartbeat')
  @ApiOperation({ summary: 'Presence heartbeat — soft signal only; final marks come from Meet CSV' })
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
  @ApiOperation({ summary: 'End class from app presence (prefer Meet CSV import for final attendance)' })
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.endClass(user.userId, id);
  }

  @Get('me/attendance-streak')
  @ApiOperation({ summary: 'Current attendance streak for the logged-in student' })
  streak(@CurrentUser() user: AuthUser) {
    return this.live.myStreak(user.userId);
  }

  @Patch('me/google-email')
  @ApiOperation({ summary: 'Set Google account email used for Meet attendance matching' })
  setGoogleEmail(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateGoogleEmailSchema)) dto: UpdateGoogleEmailDto,
  ) {
    return this.live.updateGoogleEmail(user.userId, dto);
  }
}
