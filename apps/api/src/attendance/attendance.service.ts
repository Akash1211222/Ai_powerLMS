import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import { computeAttendanceRate } from './attendance.calc';
import type {
  CreateSessionDto,
  MarkDto,
  CorrectionRequestDto,
  ReviewCorrectionDto,
  ListCorrectionsQuery,
} from './dto/attendance.schemas';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
  ) {}

  private async loadOwnedBatch(userId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, userId, batch.organizationId);
    return batch;
  }

  private async loadOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });
    if (!session) throw new NotFoundException('Attendance session not found');
    await assertOrgAccess(this.userContext, userId, session.batch.organizationId);
    return session;
  }

  async createSession(userId: string, dto: CreateSessionDto) {
    const batch = await this.loadOwnedBatch(userId, dto.batchId);
    const session = await this.prisma.attendanceSession.create({
      data: {
        batchId: batch.id,
        title: dto.title,
        sessionDate: dto.sessionDate ?? new Date(),
        scheduleId: dto.scheduleId ?? null,
        createdById: userId,
      },
    });
    await this.audit.record({
      action: 'attendance.session.create',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'AttendanceSession',
      targetId: session.id,
    });
    return session;
  }

  async listSessions(userId: string, batchId: string) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.attendanceSession.findMany({
      where: { batchId },
      orderBy: { sessionDate: 'desc' },
      include: { _count: { select: { records: true } } },
    });
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.loadOwnedSession(userId, sessionId);
    return this.prisma.attendanceSession.findUnique({
      where: { id: session.id },
      include: {
        records: { include: { student: { include: { profile: true } } } },
        batch: { select: { id: true, name: true } },
      },
    });
  }

  /** Bulk mark/update records. Trainer marking or admin override (§14). */
  async mark(userId: string, sessionId: string, dto: MarkDto) {
    const session = await this.loadOwnedSession(userId, sessionId);

    // Only students who belong to the batch can be marked.
    const memberIds = new Set(
      (
        await this.prisma.batchStudent.findMany({
          where: { batchId: session.batchId, status: 'ACTIVE' },
          select: { userId: true },
        })
      ).map((s) => s.userId),
    );
    const invalid = dto.records.find((r) => !memberIds.has(r.studentId));
    if (invalid) {
      throw new BadRequestException(`Student ${invalid.studentId} is not in this batch`);
    }

    await this.prisma.$transaction(
      dto.records.map((r) =>
        this.prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
          update: { status: r.status, note: r.note ?? null, source: 'MANUAL', markedById: userId },
          create: {
            sessionId,
            studentId: r.studentId,
            status: r.status,
            note: r.note ?? null,
            source: 'MANUAL',
            markedById: userId,
          },
        }),
      ),
    );

    await this.audit.record({
      action: 'attendance.mark',
      actorUserId: userId,
      organizationId: session.batch.organizationId,
      targetType: 'AttendanceSession',
      targetId: sessionId,
      metadata: { count: dto.records.length },
    });
    return { success: true, marked: dto.records.length };
  }

  /** A student's own attendance across all sessions, with a computed rate. */
  async myAttendance(userId: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        session: {
          select: { id: true, title: true, sessionDate: true, batch: { select: { name: true } } },
        },
      },
    });
    const summary = computeAttendanceRate(records);
    return { summary, records };
  }

  /** Student requests a correction on their own record. */
  async requestCorrection(userId: string, recordId: string, dto: CorrectionRequestDto) {
    const record = await this.prisma.attendanceRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Attendance record not found');
    if (record.studentId !== userId) {
      throw new ForbiddenException('You can only request corrections on your own attendance');
    }
    const pending = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: { recordId, status: 'PENDING' },
    });
    if (pending) throw new BadRequestException('A correction request is already pending');

    return this.prisma.attendanceCorrectionRequest.create({
      data: {
        recordId,
        requestedById: userId,
        requestedStatus: dto.requestedStatus,
        reason: dto.reason,
      },
    });
  }

  async listCorrections(userId: string, query: ListCorrectionsQuery) {
    // Scope to batches the caller can access.
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.batchId) {
      await this.loadOwnedBatch(userId, query.batchId);
      where.record = { session: { batchId: query.batchId } };
    }
    return this.prisma.attendanceCorrectionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        record: {
          include: {
            session: { select: { title: true, batchId: true, batch: { select: { organizationId: true } } } },
            student: { include: { profile: true } },
          },
        },
      },
    });
  }

  /** Trainer/admin approves or rejects; approval updates the record (audited). */
  async reviewCorrection(userId: string, correctionId: string, dto: ReviewCorrectionDto) {
    const correction = await this.prisma.attendanceCorrectionRequest.findUnique({
      where: { id: correctionId },
      include: { record: { include: { session: { include: { batch: true } } } } },
    });
    if (!correction) throw new NotFoundException('Correction request not found');
    await assertOrgAccess(this.userContext, userId, correction.record.session.batch.organizationId);
    if (correction.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    const approve = dto.decision === 'APPROVE';
    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          reviewedById: userId,
          reviewNote: dto.reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });
      if (approve) {
        await tx.attendanceRecord.update({
          where: { id: correction.recordId },
          data: { status: correction.requestedStatus, source: 'CORRECTION', markedById: userId },
        });
      }
    });

    await this.audit.record({
      action: approve ? 'attendance.correction.approve' : 'attendance.correction.reject',
      actorUserId: userId,
      organizationId: correction.record.session.batch.organizationId,
      targetType: 'AttendanceRecord',
      targetId: correction.recordId,
      metadata: { correctionId },
    });
    return { success: true, decision: dto.decision };
  }
}
