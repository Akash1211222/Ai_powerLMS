import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateBatchDto,
  UpdateBatchDto,
  ListBatchesQuery,
  AddStudentDto,
  AssignTrainerDto,
  AddScheduleDto,
} from './dto/batch.schemas';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
  ) {}

  async create(userId: string, dto: CreateBatchDto) {
    await assertOrgAccess(this.userContext, userId, dto.organizationId);

    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course || course.organizationId !== dto.organizationId) {
      throw new BadRequestException('Course not found in this organization');
    }

    const code = (dto.code ?? dto.name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40);
    const clash = await this.prisma.batch.findUnique({
      where: { organizationId_code: { organizationId: dto.organizationId, code } },
    });
    if (clash) throw new ConflictException(`A batch with code "${code}" already exists`);

    const batch = await this.prisma.batch.create({
      data: {
        organizationId: dto.organizationId,
        courseId: dto.courseId,
        name: dto.name,
        code,
        capacity: dto.capacity ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        createdById: userId,
      },
    });
    await this.audit.record({
      action: 'batch.create',
      actorUserId: userId,
      organizationId: dto.organizationId,
      targetType: 'Batch',
      targetId: batch.id,
    });
    return batch;
  }

  async list(userId: string, query: ListBatchesQuery): Promise<Paginated<unknown>> {
    await assertOrgAccess(this.userContext, userId, query.organizationId);
    const where = {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.batch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { students: true, trainers: true } },
        },
      }),
      this.prisma.batch.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  private async loadOwnedBatch(userId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, userId, batch.organizationId);
    return batch;
  }

  async getById(userId: string, batchId: string) {
    const batch = await this.loadOwnedBatch(userId, batchId);
    return this.prisma.batch.findUnique({
      where: { id: batch.id },
      include: {
        course: { select: { id: true, title: true, status: true } },
        trainers: { include: { user: { include: { profile: true } } } },
        schedules: { orderBy: { startsAt: 'asc' } },
        _count: { select: { students: true } },
      },
    });
  }

  async update(userId: string, batchId: string, dto: UpdateBatchDto) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.batch.update({ where: { id: batchId }, data: dto });
  }

  async listStudents(userId: string, batchId: string) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.batchStudent.findMany({
      where: { batchId, status: 'ACTIVE' },
      include: { user: { include: { profile: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** Adds a student and enrolls them in the batch's course atomically. */
  async addStudent(userId: string, batchId: string, dto: AddStudentDto) {
    const batch = await this.loadOwnedBatch(userId, batchId);

    const student = dto.userId
      ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
      : await this.prisma.user.findUnique({ where: { email: dto.email! } });
    if (!student) throw new NotFoundException('Student user not found');
    const studentId = student.id;

    if (batch.capacity) {
      const active = await this.prisma.batchStudent.count({
        where: { batchId, status: 'ACTIVE' },
      });
      if (active >= batch.capacity) throw new ConflictException('Batch is at capacity');
    }

    const existing = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId: studentId } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new ConflictException('Student already in this batch');
    }

    const totalLessons = await this.prisma.lesson.count({
      where: { module: { courseId: batch.courseId } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.batchStudent.upsert({
        where: { batchId_userId: { batchId, userId: studentId } },
        update: { status: 'ACTIVE' },
        create: { batchId, userId: studentId, status: 'ACTIVE' },
      });

      const enrollment = await tx.enrollment.upsert({
        where: { userId_courseId: { userId: studentId, courseId: batch.courseId } },
        update: { batchId, status: 'ACTIVE' },
        create: { userId: studentId, courseId: batch.courseId, batchId, status: 'ACTIVE' },
      });

      await tx.courseProgress.upsert({
        where: { enrollmentId: enrollment.id },
        update: { totalLessons },
        create: { enrollmentId: enrollment.id, totalLessons, completedLessons: 0, percent: 0 },
      });
    });

    await this.audit.record({
      action: 'batch.student.add',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'Batch',
      targetId: batchId,
      metadata: { studentId },
    });
    return { success: true };
  }

  async removeStudent(userId: string, batchId: string, studentId: string) {
    const batch = await this.loadOwnedBatch(userId, batchId);
    await this.prisma.$transaction([
      this.prisma.batchStudent.updateMany({
        where: { batchId, userId: studentId },
        data: { status: 'REMOVED' },
      }),
      this.prisma.enrollment.updateMany({
        where: { batchId, userId: studentId },
        data: { status: 'DROPPED' },
      }),
    ]);
    await this.audit.record({
      action: 'batch.student.remove',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'Batch',
      targetId: batchId,
      metadata: { studentId },
    });
    return { success: true };
  }

  async assignTrainer(userId: string, batchId: string, dto: AssignTrainerDto) {
    const batch = await this.loadOwnedBatch(userId, batchId);
    const trainer = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!trainer) throw new NotFoundException('Trainer user not found');

    await this.prisma.batchTrainer.upsert({
      where: { batchId_userId: { batchId, userId: dto.userId } },
      update: { role: dto.role ?? 'LEAD' },
      create: { batchId, userId: dto.userId, role: dto.role ?? 'LEAD' },
    });
    await this.audit.record({
      action: 'batch.trainer.assign',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'Batch',
      targetId: batchId,
      metadata: { trainerId: dto.userId },
    });
    return { success: true };
  }

  async addSchedule(userId: string, batchId: string, dto: AddScheduleDto) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.batchSchedule.create({
      data: {
        batchId,
        title: dto.title,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        location: dto.location ?? null,
      },
    });
  }
}
