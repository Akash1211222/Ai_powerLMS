import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { AttendanceService } from './attendance.service';
import {
  createSessionSchema,
  markSchema,
  listSessionsQuerySchema,
  correctionRequestSchema,
  reviewCorrectionSchema,
  listCorrectionsQuerySchema,
  type CreateSessionDto,
  type MarkDto,
  type ListSessionsQuery,
  type CorrectionRequestDto,
  type ReviewCorrectionDto,
  type ListCorrectionsQuery,
} from './dto/attendance.schemas';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // --- Student self-service (no special permission) ---------------------

  @Get('me')
  @ApiOperation({ summary: "The current user's attendance + computed rate" })
  myAttendance(@CurrentUser() user: AuthUser) {
    return this.attendance.myAttendance(user.userId);
  }

  @Post('records/:id/corrections')
  @ApiOperation({ summary: 'Request a correction on your own attendance record' })
  requestCorrection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctionRequestSchema)) dto: CorrectionRequestDto,
  ) {
    return this.attendance.requestCorrection(user.userId, id, dto);
  }

  // --- Trainer / admin --------------------------------------------------

  @Post('sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'Create an attendance session for a batch' })
  createSession(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSessionSchema)) dto: CreateSessionDto,
  ) {
    return this.attendance.createSession(user.userId, dto);
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'List attendance sessions for a batch' })
  listSessions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listSessionsQuerySchema)) query: ListSessionsQuery,
  ) {
    return this.attendance.listSessions(user.userId, query.batchId);
  }

  @Get('sessions/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'Get a session with its records' })
  getSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendance.getSession(user.userId, id);
  }

  @Post('sessions/:id/mark')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'Bulk mark attendance for a session' })
  mark(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markSchema)) dto: MarkDto,
  ) {
    return this.attendance.mark(user.userId, id, dto);
  }

  @Get('corrections')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'List correction requests (optionally by batch/status)' })
  listCorrections(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listCorrectionsQuerySchema)) query: ListCorrectionsQuery,
  ) {
    return this.attendance.listCorrections(user.userId, query);
  }

  @Post('corrections/:id/review')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'Approve or reject a correction request' })
  reviewCorrection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewCorrectionSchema)) dto: ReviewCorrectionDto,
  ) {
    return this.attendance.reviewCorrection(user.userId, id, dto);
  }
}
