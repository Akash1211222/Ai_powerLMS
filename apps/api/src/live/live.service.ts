import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@fca/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '@fca/shared';
import { UserContextService } from '../authz/user-context.service';
import { hasPermission } from '../authz/principal';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import {
  attendanceFromPercent,
  attendanceFromWatchTime,
  parseMeetAttendanceCsv,
  utcDay,
} from './meet.provider';
import type {
  HeartbeatDto,
  ImportMeetAttendanceDto,
  LessonProgressDto,
  LiveNotesQuery,
  LiveReportQuery,
  ScheduleLiveClassDto,
  SetLessonVideoDto,
  UpdateGoogleEmailDto,
  UpdateLiveSummaryDto,
} from './dto/live.schemas';

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Course videos ----------------------------------------------------

  async setLessonVideo(actorId: string, lessonId: string, dto: SetLessonVideoDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await assertOrgAccess(this.userContext, actorId, lesson.module.course.organizationId);
    await this.assertCanTeachCourse(actorId, lesson.module.course.id, lesson.module.course.organizationId);

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        type: 'VIDEO',
        contentUrl: dto.contentUrl,
        thumbnailUrl: dto.thumbnailUrl ?? undefined,
        durationSec: dto.durationSec ?? undefined,
        title: dto.title ?? undefined,
      },
    });
  }

  async trackLessonProgress(userId: string, lessonId: string, dto: LessonProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: lesson.module.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');

    const existing = await this.prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    });

    // Never decrease accumulated watch / reading time.
    const watchedSec = Math.max(existing?.watchedSec ?? 0, Math.max(0, dto.watchedSec));
    const positionSec = Math.max(0, dto.positionSec);
    const duration = lesson.durationSec ?? 0;
    const completed =
      dto.completed === true ||
      existing?.status === 'COMPLETED' ||
      (duration > 0 && watchedSec >= Math.floor(duration * 0.9));

    const progress = await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      update: {
        lastPositionSec: positionSec,
        watchedSec,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: completed ? (existing?.completedAt ?? new Date()) : undefined,
        userId,
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        userId,
        lastPositionSec: positionSec,
        watchedSec,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: completed ? new Date() : null,
      },
    });

    await this.recomputeCourseProgress(enrollment.id);
    return progress;
  }

  // --- Live class scheduling --------------------------------------------

  async schedule(actorId: string, dto: ScheduleLiveClassDto) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
      include: {
        course: { select: { title: true } },
        students: { where: { status: 'ACTIVE' }, select: { userId: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, actorId, batch.organizationId);
    await this.assertCanTeachBatch(actorId, batch.id, batch.organizationId);

    const schedule = await this.prisma.batchSchedule.create({
      data: {
        batchId: batch.id,
        title: dto.title,
        description: dto.description ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        location: 'Google Meet',
        meetingUrl: dto.meetingUrl,
        meetingProvider: 'GOOGLE_MEET',
        status: 'SCHEDULED',
        createdById: actorId,
      },
    });

    // Mirror an OPEN attendance session linked to this schedule.
    await this.prisma.attendanceSession.create({
      data: {
        batchId: batch.id,
        scheduleId: schedule.id,
        title: dto.title,
        sessionDate: dto.startsAt,
        status: 'OPEN',
        createdById: actorId,
      },
    });

    const studentIds = batch.students.map((s) => s.userId);
    await this.notifications.notifyMany(studentIds, {
      type: 'LIVE_CLASS_SCHEDULED',
      title: `Live class: ${dto.title}`,
      body: `${batch.course.title} · ${batch.name} — join via Google Meet at the scheduled time.`,
      deepLink: `/live/${schedule.id}`,
    });

    // Staff fan-out: college admins + placement officers in the org.
    const staff = await this.prisma.userRole.findMany({
      where: {
        organizationId: batch.organizationId,
        role: { name: { in: ['COLLEGE_ADMIN', 'PLACEMENT_OFFICER', 'BATCH_MANAGER'] } },
      },
      select: { userId: true },
    });
    await this.notifications.notifyMany(
      [...new Set(staff.map((s) => s.userId))],
      {
        type: 'LIVE_CLASS_SCHEDULED',
        title: `Live class scheduled — ${batch.name}`,
        body: `${dto.title} on ${dto.startsAt.toLocaleString()} · Meet link shared with ${studentIds.length} students.`,
        deepLink: `/batches/${batch.id}`,
      },
    );

    await this.audit.record({
      action: 'live.schedule',
      actorUserId: actorId,
      organizationId: batch.organizationId,
      targetType: 'BatchSchedule',
      targetId: schedule.id,
      metadata: { meetingUrl: dto.meetingUrl },
    });

    return schedule;
  }

  async updateSummary(actorId: string, scheduleId: string, dto: UpdateLiveSummaryDto) {
    const schedule = await this.prisma.batchSchedule.findUnique({
      where: { id: scheduleId },
      include: { batch: true },
    });
    if (!schedule) throw new NotFoundException('Live class not found');
    await assertOrgAccess(this.userContext, actorId, schedule.batch.organizationId);
    await this.assertCanTeachBatch(actorId, schedule.batchId, schedule.batch.organizationId);

    const data: Prisma.BatchScheduleUpdateInput = {
      summaryUpdatedAt: new Date(),
      summaryUpdatedBy: { connect: { id: actorId } },
    };
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.homework !== undefined) data.homework = dto.homework;
    if (dto.keyPoints !== undefined) {
      data.keyPoints = dto.keyPoints === null ? Prisma.JsonNull : dto.keyPoints;
    }
    if (dto.qaItems !== undefined) {
      data.qaItems = dto.qaItems === null ? Prisma.JsonNull : dto.qaItems;
    }

    return this.prisma.batchSchedule.update({
      where: { id: scheduleId },
      data,
    });
  }

  async listNotes(actorId: string, query: LiveNotesQuery) {
    if (!query.courseId && !query.batchId) {
      throw new BadRequestException('courseId or batchId is required');
    }

    const whereBatch = query.batchId
      ? { id: query.batchId }
      : { courseId: query.courseId! };

    const batches = await this.prisma.batch.findMany({
      where: whereBatch,
      select: { id: true, organizationId: true, name: true, courseId: true },
    });
    if (batches.length === 0) return [];

    const orgIds = [...new Set(batches.map((b) => b.organizationId))];
    for (const orgId of orgIds) {
      await assertOrgAccess(this.userContext, actorId, orgId);
    }

    const schedules = await this.prisma.batchSchedule.findMany({
      where: { batchId: { in: batches.map((b) => b.id) } },
      orderBy: { startsAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        summary: true,
        keyPoints: true,
        homework: true,
        qaItems: true,
        summaryUpdatedAt: true,
        batch: { select: { id: true, name: true, courseId: true, course: { select: { title: true } } } },
      },
    });

    return schedules
      .filter(
        (s) =>
          Boolean(s.summary) ||
          Boolean(s.homework) ||
          (Array.isArray(s.keyPoints) && s.keyPoints.length > 0) ||
          (Array.isArray(s.qaItems) && s.qaItems.length > 0),
      )
      .slice(0, 20);
  }

  /**
   * Import Google Meet attendance CSV — match participant emails to LMS users
   * (googleEmail ?? email) and mark % of class duration attended.
   */
  async importMeetAttendance(actorId: string, scheduleId: string, dto: ImportMeetAttendanceDto) {
    const schedule = await this.prisma.batchSchedule.findUnique({
      where: { id: scheduleId },
      include: { batch: true },
    });
    if (!schedule) throw new NotFoundException('Live class not found');
    await assertOrgAccess(this.userContext, actorId, schedule.batch.organizationId);
    await this.assertCanTeachBatch(actorId, schedule.batchId, schedule.batch.organizationId);

    let rows;
    try {
      rows = parseMeetAttendanceCsv(dto.csv);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid CSV');
    }
    if (rows.length === 0) throw new BadRequestException('No participant rows found in CSV');

    const durationSec = Math.max(
      1,
      Math.round((schedule.endsAt.getTime() - schedule.startsAt.getTime()) / 1000),
    );

    const students = await this.prisma.batchStudent.findMany({
      where: { batchId: schedule.batchId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, email: true, googleEmail: true } },
      },
    });

    const byEmail = new Map<string, string>();
    for (const s of students) {
      const primary = (s.user.googleEmail ?? s.user.email).toLowerCase();
      byEmail.set(primary, s.user.id);
      byEmail.set(s.user.email.toLowerCase(), s.user.id);
      if (s.user.googleEmail) byEmail.set(s.user.googleEmail.toLowerCase(), s.user.id);
    }

    let session = await this.prisma.attendanceSession.findFirst({ where: { scheduleId } });
    if (!session) {
      session = await this.prisma.attendanceSession.create({
        data: {
          batchId: schedule.batchId,
          scheduleId,
          title: schedule.title,
          sessionDate: schedule.startsAt,
          status: 'OPEN',
          createdById: actorId,
        },
      });
    }

    const matched: Array<{
      studentId: string;
      email: string;
      attendedSec: number;
      attendancePct: number;
      status: string;
    }> = [];
    const unmatched: Array<{ email: string; durationSec: number }> = [];
    const matchedStudentIds = new Set<string>();

    for (const row of rows) {
      const studentId = byEmail.get(row.email);
      if (!studentId) {
        unmatched.push({ email: row.email, durationSec: row.durationSec });
        continue;
      }
      // If same student appears twice, keep max duration.
      const existing = matched.find((m) => m.studentId === studentId);
      const attendedSec = Math.min(durationSec, Math.max(existing?.attendedSec ?? 0, row.durationSec));
      const attendancePct = Math.round((attendedSec / durationSec) * 1000) / 10;
      const status = attendanceFromPercent(attendancePct);

      if (existing) {
        existing.attendedSec = attendedSec;
        existing.attendancePct = attendancePct;
        existing.status = status;
        existing.email = row.email;
      } else {
        matched.push({ studentId, email: row.email, attendedSec, attendancePct, status });
      }
      matchedStudentIds.add(studentId);
    }

    const now = new Date();
    for (const m of matched) {
      await this.prisma.liveClassPresence.upsert({
        where: { scheduleId_studentId: { scheduleId, studentId: m.studentId } },
        update: {
          attendedSec: m.attendedSec,
          watchedSec: m.attendedSec,
          attendancePct: m.attendancePct,
          meetEmail: m.email,
          source: 'MEET_IMPORT',
          leftAt: now,
          lastHeartbeatAt: now,
        },
        create: {
          scheduleId,
          studentId: m.studentId,
          joinedAt: schedule.startsAt,
          leftAt: now,
          watchedSec: m.attendedSec,
          attendedSec: m.attendedSec,
          attendancePct: m.attendancePct,
          meetEmail: m.email,
          source: 'MEET_IMPORT',
          lastHeartbeatAt: now,
        },
      });

      await this.prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: m.studentId } },
        update: {
          status: m.status as 'PRESENT' | 'LATE' | 'ABSENT',
          source: 'IMPORT',
          attendancePct: m.attendancePct,
          note: `Meet attendance ${m.attendancePct}% (${Math.round(m.attendedSec / 60)} min of ${Math.round(durationSec / 60)} min)`,
          markedById: actorId,
        },
        create: {
          sessionId: session.id,
          studentId: m.studentId,
          status: m.status as 'PRESENT' | 'LATE' | 'ABSENT',
          source: 'IMPORT',
          attendancePct: m.attendancePct,
          markedById: actorId,
          note: `Meet attendance ${m.attendancePct}% (${Math.round(m.attendedSec / 60)} min of ${Math.round(durationSec / 60)} min)`,
        },
      });

      if (m.status === 'PRESENT' || m.status === 'LATE') {
        await this.bumpStreak(m.studentId, schedule.startsAt);
      }
    }

    // Mark unmatched batch students as ABSENT when ending.
    if (dto.endClass) {
      for (const s of students) {
        if (matchedStudentIds.has(s.userId)) continue;
        await this.prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: s.userId } },
          update: {
            status: 'ABSENT',
            source: 'IMPORT',
            attendancePct: 0,
            note: 'Not found in Meet attendance export',
            markedById: actorId,
          },
          create: {
            sessionId: session.id,
            studentId: s.userId,
            status: 'ABSENT',
            source: 'IMPORT',
            attendancePct: 0,
            markedById: actorId,
            note: 'Not found in Meet attendance export',
          },
        });
      }

      await this.prisma.attendanceSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED' },
      });
      await this.prisma.batchSchedule.update({
        where: { id: scheduleId },
        data: { status: 'ENDED' },
      });
    }

    const present = matched.filter((m) => m.status === 'PRESENT').length;
    const late = matched.filter((m) => m.status === 'LATE').length;
    const absent = dto.endClass
      ? students.length - matchedStudentIds.size + matched.filter((m) => m.status === 'ABSENT').length
      : matched.filter((m) => m.status === 'ABSENT').length;

    const summary = {
      scheduleId,
      title: schedule.title,
      present,
      late,
      absent,
      matched: matched.length,
      unmatched: unmatched.length,
      avgWatchPercent:
        matched.length === 0
          ? 0
          : Math.round(matched.reduce((a, m) => a + m.attendancePct, 0) / matched.length),
      total: students.length,
      durationSec,
    };

    await this.audit.record({
      action: 'live.attendance.import',
      actorUserId: actorId,
      organizationId: schedule.batch.organizationId,
      targetType: 'BatchSchedule',
      targetId: scheduleId,
      metadata: summary,
    });

    return { summary, matched, unmatched };
  }

  async updateGoogleEmail(userId: string, dto: UpdateGoogleEmailDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { googleEmail: dto.googleEmail === undefined ? undefined : dto.googleEmail },
      select: { id: true, email: true, googleEmail: true },
    });
  }

  async listForBatch(actorId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, actorId, batch.organizationId);
    return this.prisma.batchSchedule.findMany({
      where: { batchId },
      orderBy: { startsAt: 'asc' },
      include: {
        _count: { select: { presences: true } },
        createdBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async getOne(actorId: string, scheduleId: string) {
    const schedule = await this.prisma.batchSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        batch: { include: { course: { select: { id: true, title: true } } } },
        presences: {
          include: {
            student: {
              select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Live class not found');
    await assertOrgAccess(this.userContext, actorId, schedule.batch.organizationId);
    return schedule;
  }

  async join(studentId: string, scheduleId: string) {
    const schedule = await this.loadJoinable(scheduleId);
    await this.assertStudentInBatch(studentId, schedule.batchId);

    const now = new Date();
    if (schedule.status === 'CANCELLED' || schedule.status === 'ENDED') {
      throw new BadRequestException('This live class is not joinable');
    }
    // Allow join from 15 min before start until end.
    if (now.getTime() < schedule.startsAt.getTime() - 15 * 60_000) {
      throw new BadRequestException('Class has not opened yet');
    }
    if (now.getTime() > schedule.endsAt.getTime() + 10 * 60_000) {
      throw new BadRequestException('Class has already ended');
    }

    if (schedule.status === 'SCHEDULED') {
      await this.prisma.batchSchedule.update({
        where: { id: scheduleId },
        data: { status: 'LIVE' },
      });
    }

    const presence = await this.prisma.liveClassPresence.upsert({
      where: { scheduleId_studentId: { scheduleId, studentId } },
      update: { leftAt: null, lastHeartbeatAt: now },
      create: { scheduleId, studentId, joinedAt: now, lastHeartbeatAt: now },
    });

    return { meetingUrl: schedule.meetingUrl, presence };
  }

  async heartbeat(studentId: string, scheduleId: string, dto: HeartbeatDto) {
    const presence = await this.prisma.liveClassPresence.findUnique({
      where: { scheduleId_studentId: { scheduleId, studentId } },
    });
    if (!presence) throw new BadRequestException('Join the class before sending heartbeats');

    const now = new Date();
    const updated = await this.prisma.liveClassPresence.update({
      where: { id: presence.id },
      data: {
        watchedSec: presence.watchedSec + dto.deltaSec,
        lastHeartbeatAt: now,
        leftAt: null,
      },
    });
    return updated;
  }

  async leave(studentId: string, scheduleId: string) {
    const presence = await this.prisma.liveClassPresence.findUnique({
      where: { scheduleId_studentId: { scheduleId, studentId } },
    });
    if (!presence) return { success: true };
    await this.prisma.liveClassPresence.update({
      where: { id: presence.id },
      data: { leftAt: new Date() },
    });
    return { success: true };
  }

  /** Finalize attendance from watch time, update streaks, share report. */
  async endClass(actorId: string, scheduleId: string) {
    const schedule = await this.prisma.batchSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        batch: true,
        presences: true,
      },
    });
    if (!schedule) throw new NotFoundException('Live class not found');
    await assertOrgAccess(this.userContext, actorId, schedule.batch.organizationId);
    await this.assertCanTeachBatch(actorId, schedule.batchId, schedule.batch.organizationId);

    const durationSec = Math.max(
      1,
      Math.round((schedule.endsAt.getTime() - schedule.startsAt.getTime()) / 1000),
    );

    let session = await this.prisma.attendanceSession.findFirst({
      where: { scheduleId },
    });
    if (!session) {
      session = await this.prisma.attendanceSession.create({
        data: {
          batchId: schedule.batchId,
          scheduleId,
          title: schedule.title,
          sessionDate: schedule.startsAt,
          status: 'OPEN',
          createdById: actorId,
        },
      });
    }

    const students = await this.prisma.batchStudent.findMany({
      where: { batchId: schedule.batchId, status: 'ACTIVE' },
      select: { userId: true },
    });
    const presenceByStudent = new Map(schedule.presences.map((p) => [p.studentId, p]));

    const results: Array<{ studentId: string; status: string; watchedSec: number; watchPercent: number }> = [];

    for (const s of students) {
      const p = presenceByStudent.get(s.userId);
      const watchedSec = p?.watchedSec ?? 0;
      const status = attendanceFromWatchTime(watchedSec, durationSec);
      const watchPercent = Math.min(100, Math.round((watchedSec / durationSec) * 100));

      await this.prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: s.userId } },
        update: {
          status,
          source: 'LIVE',
          attendancePct: watchPercent,
          note: `App presence ${watchPercent}% of live session (prefer Meet CSV import for final marks)`,
        },
        create: {
          sessionId: session.id,
          studentId: s.userId,
          status,
          source: 'LIVE',
          attendancePct: watchPercent,
          markedById: actorId,
          note: `App presence ${watchPercent}% of live session (prefer Meet CSV import for final marks)`,
        },
      });

      if (status === 'PRESENT' || status === 'LATE') {
        await this.bumpStreak(s.userId, schedule.startsAt);
      }

      results.push({ studentId: s.userId, status, watchedSec, watchPercent });
    }

    await this.prisma.attendanceSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED' },
    });
    await this.prisma.batchSchedule.update({
      where: { id: scheduleId },
      data: { status: 'ENDED' },
    });

    const present = results.filter((r) => r.status === 'PRESENT').length;
    const late = results.filter((r) => r.status === 'LATE').length;
    const absent = results.filter((r) => r.status === 'ABSENT').length;
    const avgWatch =
      results.length === 0
        ? 0
        : Math.round(results.reduce((a, r) => a + r.watchPercent, 0) / results.length);

    const summary = {
      scheduleId,
      title: schedule.title,
      present,
      late,
      absent,
      avgWatchPercent: avgWatch,
      total: results.length,
    };

    const staff = await this.prisma.userRole.findMany({
      where: {
        organizationId: schedule.batch.organizationId,
        role: { name: { in: ['COLLEGE_ADMIN', 'PLACEMENT_OFFICER', 'BATCH_MANAGER', 'TRAINER', 'SUPER_ADMIN'] } },
      },
      select: { userId: true },
    });
    const notifyIds = new Set([actorId, ...staff.map((s) => s.userId)]);
    await this.notifications.notifyMany([...notifyIds], {
      type: 'ATTENDANCE_REPORT',
      title: `Attendance report — ${schedule.title}`,
      body: `${present} present · ${late} late · ${absent} absent · avg watch ${avgWatch}%`,
      deepLink: `/live/${scheduleId}`,
    });

    await this.audit.record({
      action: 'live.end',
      actorUserId: actorId,
      organizationId: schedule.batch.organizationId,
      targetType: 'BatchSchedule',
      targetId: scheduleId,
      metadata: summary,
    });

    return { summary, results };
  }

  async myStreak(userId: string) {
    const streak = await this.prisma.attendanceStreak.findUnique({ where: { userId } });
    return streak ?? { userId, currentStreak: 0, longestStreak: 0, lastPresentOn: null };
  }

  async upcomingForStudent(userId: string) {
    const links = await this.prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    });
    const batchIds = links.map((l) => l.batchId);
    if (batchIds.length === 0) return [];
    const now = new Date();
    return this.prisma.batchSchedule.findMany({
      where: {
        batchId: { in: batchIds },
        status: { in: ['SCHEDULED', 'LIVE'] },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: 'asc' },
      take: 8,
      include: {
        batch: { select: { id: true, name: true, course: { select: { title: true } } } },
      },
    });
  }

  async report(actorId: string, query: LiveReportQuery) {
    await assertOrgAccess(this.userContext, actorId, query.organizationId);
    const schedules = await this.prisma.batchSchedule.findMany({
      where: {
        batch: { organizationId: query.organizationId },
        ...(query.batchId ? { batchId: query.batchId } : {}),
        meetingUrl: { not: null },
      },
      orderBy: { startsAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        meetingUrl: true,
        summary: true,
        keyPoints: true,
        homework: true,
        batch: { select: { id: true, name: true, code: true } },
        _count: { select: { presences: true } },
        presences: { select: { watchedSec: true, attendedSec: true, attendancePct: true, studentId: true } },
      },
    });

    return schedules.map((s) => {
      const durationSec = Math.max(1, Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 1000));
      const watches = s.presences.map((p) => {
        if (p.attendancePct != null) return Math.min(100, Math.round(p.attendancePct));
        const sec = p.attendedSec > 0 ? p.attendedSec : p.watchedSec;
        return Math.min(100, Math.round((sec / durationSec) * 100));
      });
      const avgWatch = watches.length
        ? Math.round(watches.reduce((a: number, b: number) => a + b, 0) / watches.length)
        : 0;
      return {
        id: s.id,
        title: s.title,
        batch: s.batch,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        meetingUrl: s.meetingUrl,
        joinedCount: s._count.presences,
        avgWatchPercent: avgWatch,
        hasSummary: Boolean(s.summary || s.keyPoints || s.homework),
      };
    });
  }

  // --- helpers ----------------------------------------------------------

  private async loadJoinable(scheduleId: string) {
    const schedule = await this.prisma.batchSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Live class not found');
    if (!schedule.meetingUrl) throw new BadRequestException('No meeting link on this class');
    return schedule;
  }

  private async assertStudentInBatch(userId: string, batchId: string) {
    const link = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId } },
    });
    if (!link || link.status !== 'ACTIVE') throw new ForbiddenException('Not a student in this batch');
  }

  private async assertCanTeachBatch(userId: string, batchId: string, organizationId: string) {
    const principal = await this.userContext.getPrincipal(userId);
    if (
      hasPermission(principal, PERMISSIONS.BATCH_MANAGE, organizationId) ||
      hasPermission(principal, PERMISSIONS.COURSE_UPDATE, organizationId)
    ) {
      return;
    }
    const trainer = await this.prisma.batchTrainer.findUnique({
      where: { batchId_userId: { batchId, userId } },
    });
    if (!trainer) throw new ForbiddenException('Only batch trainers can manage live classes');
  }

  private async assertCanTeachCourse(userId: string, courseId: string, organizationId: string) {
    const principal = await this.userContext.getPrincipal(userId);
    if (
      hasPermission(principal, PERMISSIONS.COURSE_UPDATE, organizationId) ||
      hasPermission(principal, PERMISSIONS.BATCH_MANAGE, organizationId)
    ) {
      return;
    }
    const trainer = await this.prisma.batchTrainer.findFirst({
      where: { userId, batch: { courseId } },
    });
    if (!trainer) throw new ForbiddenException('Only course trainers can upload videos');
  }

  private async recomputeCourseProgress(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { include: { modules: { include: { lessons: { select: { id: true } } } } } } },
    });
    if (!enrollment) return;
    const lessonIds = enrollment.course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const total = lessonIds.length;
    const completed = total
      ? await this.prisma.lessonProgress.count({
          where: { enrollmentId, lessonId: { in: lessonIds }, status: 'COMPLETED' },
        })
      : 0;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    await this.prisma.courseProgress.upsert({
      where: { enrollmentId },
      update: { completedLessons: completed, totalLessons: total, percent, lastActivityAt: new Date() },
      create: {
        enrollmentId,
        completedLessons: completed,
        totalLessons: total,
        percent,
        lastActivityAt: new Date(),
      },
    });
  }

  private async bumpStreak(userId: string, sessionDate: Date) {
    const day = utcDay(sessionDate);
    const existing = await this.prisma.attendanceStreak.findUnique({ where: { userId } });
    if (!existing) {
      await this.prisma.attendanceStreak.create({
        data: { userId, currentStreak: 1, longestStreak: 1, lastPresentOn: day },
      });
      return;
    }
    if (existing.lastPresentOn && utcDay(existing.lastPresentOn).getTime() === day.getTime()) {
      return; // already counted today
    }
    const yesterday = new Date(day);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const continued =
      existing.lastPresentOn && utcDay(existing.lastPresentOn).getTime() === yesterday.getTime();
    const currentStreak = continued ? existing.currentStreak + 1 : 1;
    const longestStreak = Math.max(existing.longestStreak, currentStreak);
    await this.prisma.attendanceStreak.update({
      where: { userId },
      data: { currentStreak, longestStreak, lastPresentOn: day },
    });

    if (currentStreak > 0 && currentStreak % 5 === 0) {
      await this.notifications.notify(userId, {
        type: 'STREAK_MILESTONE',
        title: `${currentStreak}-day attendance streak! 🔥`,
        body: 'Keep showing up — consistency compounds.',
        deepLink: '/dashboard',
      });
    }
  }
}
