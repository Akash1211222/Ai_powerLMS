import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { runWeeklyReport, getProvider } from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { assertStudentAccess } from '../common/tenant';

/**
 * AI weekly progress reports (§21). Deterministic metrics are gathered in
 * `runWeeklyReport` (@fca/ai) and only narrated by the provider (§17).
 * Generation is idempotent per (student, week). The heuristic provider runs
 * inline (instant/free); a real provider is generated inline here too because a
 * manual request is user-initiated and expected to return a report — but the
 * scheduled fan-out lives in the worker so no request waits on many reports.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Student self-service ---------------------------------------------

  async listMine(userId: string) {
    return this.prisma.weeklyProgressReport.findMany({
      where: { userId },
      orderBy: { periodStart: 'desc' },
      take: 12,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        summary: true,
        provider: true,
        createdAt: true,
      },
    });
  }

  async getMine(userId: string, id: string) {
    const report = await this.prisma.weeklyProgressReport.findFirst({
      where: { id, userId },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  // --- Staff ------------------------------------------------------------

  async listForStudent(actorId: string, studentId: string) {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    return this.prisma.weeklyProgressReport.findMany({
      where: { userId: studentId },
      orderBy: { periodStart: 'desc' },
      take: 12,
    });
  }

  /** Generate the current week's report for a student now (idempotent). */
  async generateForStudent(actorId: string, studentId: string) {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    const result = await runWeeklyReport(this.prisma, studentId);
    if (!result.skipped && result.reportId) {
      await this.audit.record({
        action: 'report.generated',
        actorUserId: actorId,
        targetType: 'WeeklyProgressReport',
        targetId: result.reportId,
        metadata: { via: 'staff', provider: getProvider().name },
      });
      await this.notifications.notify(studentId, {
        type: 'PROGRESS_REPORT',
        title: 'Your weekly progress report is ready',
        body: 'A summary of your week, with goals for the next one, is on your dashboard.',
        deepLink: '/reports',
      });
    }
    return result;
  }

  /** Generate this week's report for the current user (self-service). */
  async generateMine(userId: string) {
    const result = await runWeeklyReport(this.prisma, userId);
    if (!result.skipped && result.reportId) {
      await this.audit.record({
        action: 'report.generated',
        actorUserId: userId,
        targetType: 'WeeklyProgressReport',
        targetId: result.reportId,
        metadata: { via: 'self', provider: getProvider().name },
      });
    }
    return result;
  }
}
