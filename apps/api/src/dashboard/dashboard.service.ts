import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeAttendanceRate } from '../attendance/attendance.calc';

function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Dashboard aggregation (§8, §9, §34). Uses parallel independent queries — no
 * single giant query — and returns explainable, real data. All results are
 * scoped to the calling user (student's own enrollments; trainer's own batches).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async student(userId: string) {
    const now = new Date();
    const { start, end } = dayBounds(now);

    const batchLinks = await this.prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    });
    const batchIds = batchLinks.map((b) => b.batchId);

    const [enrollments, upcomingSessions, todaySessions, attendanceRecords] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          course: { select: { id: true, title: true, level: true, status: true } },
          batch: { select: { id: true, name: true, code: true } },
          progress: true,
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: now } },
            orderBy: { startsAt: 'asc' },
            take: 8,
            include: { batch: { select: { name: true, course: { select: { title: true } } } } },
          })
        : Promise.resolve([]),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: start, lt: end } },
            orderBy: { startsAt: 'asc' },
            include: { batch: { select: { name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.attendanceRecord.findMany({
        where: { studentId: userId },
        select: { status: true },
      }),
    ]);

    const attendance = computeAttendanceRate(attendanceRecords);
    const percents = enrollments.map((e) => e.progress?.percent ?? 0);
    const avgProgress = percents.length
      ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
      : 0;
    const completedLessons = enrollments.reduce(
      (a, e) => a + (e.progress?.completedLessons ?? 0),
      0,
    );

    return {
      stats: {
        activeCourses: enrollments.filter((e) => e.status === 'ACTIVE').length,
        avgProgress,
        completedLessons,
        upcomingSessions: upcomingSessions.length,
        attendanceRate: attendance.rate,
      },
      enrollments,
      todaySessions,
      upcomingSessions,
    };
  }

  async trainer(userId: string) {
    const now = new Date();
    const { start } = dayBounds(now);

    const trainerBatches = await this.prisma.batchTrainer.findMany({
      where: { userId },
      include: {
        batch: {
          include: {
            course: { select: { id: true, title: true } },
            _count: { select: { students: true } },
          },
        },
      },
    });
    const batchIds = trainerBatches.map((t) => t.batchId);

    const [enrollments, upcomingSessions] = await Promise.all([
      batchIds.length
        ? this.prisma.enrollment.findMany({
            where: { batchId: { in: batchIds }, status: 'ACTIVE' },
            select: { batchId: true, progress: { select: { percent: true } } },
          })
        : Promise.resolve([]),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: start } },
            orderBy: { startsAt: 'asc' },
            take: 10,
            include: { batch: { select: { name: true, course: { select: { title: true } } } } },
          })
        : Promise.resolve([]),
    ]);

    // Average progress per batch (grouped in memory to avoid N+1 queries).
    const byBatch = new Map<string, { sum: number; count: number }>();
    for (const e of enrollments) {
      const agg = byBatch.get(e.batchId!) ?? { sum: 0, count: 0 };
      agg.sum += e.progress?.percent ?? 0;
      agg.count += 1;
      byBatch.set(e.batchId!, agg);
    }

    const batches = trainerBatches.map((t) => {
      const agg = byBatch.get(t.batchId);
      return {
        id: t.batch.id,
        name: t.batch.name,
        code: t.batch.code,
        status: t.batch.status,
        role: t.role,
        courseTitle: t.batch.course.title,
        studentCount: t.batch._count.students,
        avgProgress: agg && agg.count ? Math.round(agg.sum / agg.count) : 0,
      };
    });

    const totalStudents = batches.reduce((a, b) => a + b.studentCount, 0);
    const avgProgress = batches.length
      ? Math.round(batches.reduce((a, b) => a + b.avgProgress, 0) / batches.length)
      : 0;

    return {
      stats: { totalBatches: batches.length, totalStudents, avgProgress },
      batches,
      upcomingSessions,
    };
  }
}
