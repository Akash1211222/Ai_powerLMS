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
import { slugify } from '../common/slug';
import type {
  CreateCourseDto,
  UpdateCourseDto,
  ListCoursesQuery,
  CreateModuleDto,
  CreateLessonDto,
} from './dto/course.schemas';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
  ) {}

  async create(userId: string, dto: CreateCourseDto) {
    await assertOrgAccess(this.userContext, userId, dto.organizationId);
    const slug = dto.slug ?? slugify(dto.title);

    const clash = await this.prisma.course.findUnique({
      where: { organizationId_slug: { organizationId: dto.organizationId, slug } },
    });
    if (clash) throw new ConflictException(`A course with slug "${slug}" already exists`);

    const course = await this.prisma.course.create({
      data: {
        organizationId: dto.organizationId,
        programId: dto.programId ?? null,
        title: dto.title,
        slug,
        summary: dto.summary ?? null,
        description: dto.description ?? null,
        level: dto.level ?? 'BEGINNER',
        createdById: userId,
      },
    });
    await this.audit.record({
      action: 'course.create',
      actorUserId: userId,
      organizationId: dto.organizationId,
      targetType: 'Course',
      targetId: course.id,
    });
    return course;
  }

  async list(userId: string, query: ListCoursesQuery): Promise<Paginated<unknown>> {
    await assertOrgAccess(this.userContext, userId, query.organizationId);
    const where = {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { modules: true, enrollments: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  /** Loads a course and enforces tenant access. */
  private async loadOwnedCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    await assertOrgAccess(this.userContext, userId, course.organizationId);
    return course;
  }

  async getById(userId: string, courseId: string) {
    const course = await this.loadOwnedCourse(userId, courseId);
    return this.prisma.course.findUnique({
      where: { id: course.id },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: { lessons: { orderBy: { order: 'asc' } } },
        },
      },
    });
  }

  async update(userId: string, courseId: string, dto: UpdateCourseDto) {
    await this.loadOwnedCourse(userId, courseId);
    return this.prisma.course.update({ where: { id: courseId }, data: dto });
  }

  async publish(userId: string, courseId: string) {
    await this.loadOwnedCourse(userId, courseId);
    // Explainable rule: a course must have at least one lesson to be published.
    const lessonCount = await this.prisma.lesson.count({
      where: { module: { courseId } },
    });
    if (lessonCount === 0) {
      throw new BadRequestException('Add at least one lesson before publishing');
    }
    const course = await this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await this.audit.record({
      action: 'course.publish',
      actorUserId: userId,
      organizationId: course.organizationId,
      targetType: 'Course',
      targetId: course.id,
    });
    return course;
  }

  async unpublish(userId: string, courseId: string) {
    const course = await this.loadOwnedCourse(userId, courseId);
    return this.prisma.course.update({
      where: { id: course.id },
      data: { status: 'DRAFT' },
    });
  }

  async addModule(userId: string, courseId: string, dto: CreateModuleDto) {
    await this.loadOwnedCourse(userId, courseId);
    const order = dto.order ?? (await this.prisma.courseModule.count({ where: { courseId } }));
    return this.prisma.courseModule.create({ data: { courseId, title: dto.title, order } });
  }

  async addLesson(userId: string, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('Module not found');
    await this.loadOwnedCourse(userId, mod.courseId);
    const order = dto.order ?? (await this.prisma.lesson.count({ where: { moduleId } }));
    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type ?? 'VIDEO',
        contentUrl: dto.contentUrl ?? null,
        body: dto.body ?? null,
        durationSec: dto.durationSec ?? null,
        order,
      },
    });
  }
}
