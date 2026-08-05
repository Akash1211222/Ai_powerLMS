import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '@fca/shared';
import { UserContextService } from '../authz/user-context.service';
import { hasPermission } from '../authz/principal';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import { attendanceFromWatchTime, createGoogleMeetLink, utcDay } from './meet.provider';
import type {
  HeartbeatDto,
  LessonProgressDto,
  LiveReportQuery,
  ScheduleLiveClassDto,
  SetLessonVideoDto,
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

    const duration = lesson.durationSec ?? 0;
    const completed =
      dto.completed === true || (duration > 0 && dto.watchedSec >= Math.floor(duration * 0.9));

    const progress = await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      update: {
        lastPositionSec: dto.positionSec,
        watchedSec: Math.max(dto.watchedSec, 0),
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: completed ? new Date() : undefined,
        userId,
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        userId,
        lastPositionSec: dto.positionSec,
        watchedSec: dto.watchedSec,
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

    const meet = dto.meetingUrl
      ? { meetingUrl: dto.meetingUrl, provider: 'EXTERNAL' as const }
      : createGoogleMeetLink(`${dto.batchId}:${dto.title}:${dto.startsAt.toISOString()}`);

    const schedule = await this.prisma.batchSchedule.create({
      data: {
        batchId: batch.id,
        title: dto.title,
        description: dto.description ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        location: 'Google Meet',
        meetingUrl: meet.meetingUrl,
        meetingProvider: meet.provider,
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
      metadata: { meetingUrl: meet.meetingUrl },
    });

    return schedule;
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
        update: { status, source: 'LIVE', note: `Watched ${watchPercent}% of live session` },
        create: {
          sessionId: session.id,
          studentId: s.userId,
          status,
          source: 'LIVE',
          markedById: actorId,
          note: `Watched ${watchPercent}% of live session`,
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
      include: {
        batch: { select: { id: true, name: true, code: true } },
        _count: { select: { presences: true } },
        presences: { select: { watchedSec: true, studentId: true } },
      },
    });

    return schedules.map((s) => {
      const durationSec = Math.max(1, Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 1000));
      const watches = s.presences.map((p) => Math.min(100, Math.round((p.watchedSec / durationSec) * 100)));
      const avgWatch = watches.length ? Math.round(watches.reduce((a, b) => a + b, 0) / watches.length) : 0;
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
