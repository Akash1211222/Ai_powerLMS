import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { scoreJobStudentMatch } from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateJobDto,
  UpdateJobDto,
  ListJobsQuery,
  ApplyJobDto,
  UpdateApplicationDto,
  UpdateProfileDto,
} from './dto/placement.schemas';

type StatusHistoryEntry = {
  status: string;
  at: string;
  byUserId: string | null;
  note?: string;
};

@Injectable()
export class PlacementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  async createJob(userId: string, dto: CreateJobDto) {
    await assertOrgAccess(this.userContext, userId, dto.organizationId);
    const job = await this.prisma.jobPosting.create({
      data: {
        organizationId: dto.organizationId,
        companyName: dto.companyName,
        title: dto.title,
        description: dto.description ?? null,
        jobType: dto.jobType ?? 'FULL_TIME',
        location: dto.location ?? null,
        ctcMinLpa: dto.ctcMinLpa ?? null,
        ctcMaxLpa: dto.ctcMaxLpa ?? null,
        skills: dto.skills ?? [],
        eligibility: dto.eligibility ?? null,
        deadline: dto.deadline ?? null,
        createdById: userId,
      },
    });
    await this.audit.record({
      action: 'placement.job.create',
      actorUserId: userId,
      organizationId: dto.organizationId,
      targetType: 'JobPosting',
      targetId: job.id,
    });
    return job;
  }

  async listJobs(userId: string, query: ListJobsQuery): Promise<Paginated<unknown>> {
    await assertOrgAccess(this.userContext, userId, query.organizationId);
    const where = {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.jobPosting.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { applications: true } } },
      }),
      this.prisma.jobPosting.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  /** Open jobs for students (no draft leakage). */
  async listOpenJobs(userId: string, organizationId: string) {
    await assertOrgAccess(this.userContext, userId, organizationId);
    const jobs = await this.prisma.jobPosting.findMany({
      where: { organizationId, status: 'OPEN' },
      orderBy: { publishedAt: 'desc' },
      include: {
        _count: { select: { applications: true } },
        applications: {
          where: { studentId: userId },
          select: { id: true, status: true, matchScore: true, appliedAt: true },
        },
      },
    });
    return jobs.map((j) => ({
      ...j,
      myApplication: j.applications[0] ?? null,
      applications: undefined,
    }));
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.prisma.jobPosting.findUnique({
      where: { id: jobId },
      include: { _count: { select: { applications: true } } },
    });
    if (!job) throw new NotFoundException('Job posting not found');
    await assertOrgAccess(this.userContext, userId, job.organizationId);
    return job;
  }

  async updateJob(userId: string, jobId: string, dto: UpdateJobDto) {
    const job = await this.loadJob(userId, jobId);
    return this.prisma.jobPosting.update({ where: { id: job.id }, data: dto });
  }

  async publishJob(userId: string, jobId: string) {
    const job = await this.loadJob(userId, jobId);
    if (job.status === 'OPEN') return job;
    const updated = await this.prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: 'OPEN', publishedAt: new Date() },
    });
    // Notify students who are looking for placement in this org.
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: job.organizationId },
      select: { userId: true },
    });
    const looking = await this.prisma.placementProfile.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        status: { in: ['LOOKING', 'INTERVIEWING'] },
      },
      select: { userId: true },
    });
    // Also notify org students without a profile (still members).
    const studentRoles = await this.prisma.userRole.findMany({
      where: {
        organizationId: job.organizationId,
        role: { name: 'STUDENT' },
      },
      select: { userId: true },
    });
    const notifyIds = new Set([
      ...looking.map((p) => p.userId),
      ...studentRoles.map((r) => r.userId),
    ]);
    await Promise.all(
      [...notifyIds].slice(0, 200).map((uid) =>
        this.notifications.notify(uid, {
          type: 'PLACEMENT_OPPORTUNITY',
          title: `New opening: ${job.title}`,
          body: `${job.companyName} is hiring. Check placements.`,
          deepLink: '/placements',
        }),
      ),
    );
    await this.audit.record({
      action: 'placement.job.publish',
      actorUserId: userId,
      organizationId: job.organizationId,
      targetType: 'JobPosting',
      targetId: jobId,
    });
    return updated;
  }

  async closeJob(userId: string, jobId: string) {
    const job = await this.loadJob(userId, jobId);
    return this.prisma.jobPosting.update({
      where: { id: job.id },
      data: { status: 'CLOSED' },
    });
  }

  async apply(userId: string, jobId: string, dto: ApplyJobDto) {
    const job = await this.prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job posting not found');
    await assertOrgAccess(this.userContext, userId, job.organizationId);
    if (job.status !== 'OPEN') throw new BadRequestException('This job is not open for applications');
    if (job.deadline && job.deadline < new Date()) {
      throw new BadRequestException('Application deadline has passed');
    }

    const existing = await this.prisma.jobApplication.findUnique({
      where: { jobPostingId_studentId: { jobPostingId: jobId, studentId: userId } },
    });
    if (existing) throw new ConflictException('You already applied to this job');

    const match = await this.computeMatch(userId, job);
    const history: StatusHistoryEntry[] = [
      { status: 'APPLIED', at: new Date().toISOString(), byUserId: userId },
    ];

    const application = await this.prisma.jobApplication.create({
      data: {
        jobPostingId: jobId,
        studentId: userId,
        coverLetter: dto.coverLetter ?? null,
        matchScore: match.score,
        matchReason: match.reason,
        statusHistory: history,
      },
      include: {
        jobPosting: { select: { id: true, title: true, companyName: true, status: true } },
      },
    });

    await this.audit.record({
      action: 'placement.application.create',
      actorUserId: userId,
      organizationId: job.organizationId,
      targetType: 'JobApplication',
      targetId: application.id,
    });
    return application;
  }

  async listApplications(userId: string, jobId: string) {
    const job = await this.loadJob(userId, jobId);
    return this.prisma.jobApplication.findMany({
      where: { jobPostingId: job.id },
      orderBy: [{ matchScore: 'desc' }, { appliedAt: 'asc' }],
      include: {
        student: {
          select: {
            id: true,
            email: true,
            profile: true,
            placementProfile: true,
          },
        },
      },
    });
  }

  async updateApplication(userId: string, applicationId: string, dto: UpdateApplicationDto) {
    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobPosting: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    await assertOrgAccess(this.userContext, userId, app.jobPosting.organizationId);

    const prev = (app.statusHistory as StatusHistoryEntry[] | null) ?? [];
    const history: StatusHistoryEntry[] = [
      ...prev,
      {
        status: dto.status,
        at: new Date().toISOString(),
        byUserId: userId,
        note: dto.note,
      },
    ];

    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: {
        status: dto.status,
        statusNote: dto.note ?? null,
        updatedById: userId,
        statusHistory: history,
      },
    });

    // Sync student placement profile status for terminal states.
    if (dto.status === 'PLACED' || dto.status === 'OFFERED' || dto.status === 'INTERVIEW') {
      const profileStatus =
        dto.status === 'PLACED' ? 'PLACED' : dto.status === 'OFFERED' ? 'OFFERED' : 'INTERVIEWING';
      await this.prisma.placementProfile.upsert({
        where: { userId: app.studentId },
        update: { status: profileStatus },
        create: { userId: app.studentId, status: profileStatus, skills: [], preferredRoles: [], preferredLocations: [] },
      });
    }

    await this.notifications.notify(app.studentId, {
      type: 'APPLICATION_UPDATE',
      title: `Application update: ${app.jobPosting.title}`,
      body: `Your application at ${app.jobPosting.companyName} is now ${dto.status}.${dto.note ? ` Note: ${dto.note}` : ''}`,
      deepLink: '/placements',
    });

    await this.audit.record({
      action: 'placement.application.update',
      actorUserId: userId,
      organizationId: app.jobPosting.organizationId,
      targetType: 'JobApplication',
      targetId: applicationId,
      metadata: { status: dto.status },
    });
    return updated;
  }

  async listMine(userId: string) {
    return this.prisma.jobApplication.findMany({
      where: { studentId: userId },
      orderBy: { appliedAt: 'desc' },
      include: {
        jobPosting: {
          select: {
            id: true,
            title: true,
            companyName: true,
            jobType: true,
            location: true,
            status: true,
            ctcMinLpa: true,
            ctcMaxLpa: true,
          },
        },
      },
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.placementProfile.findUnique({ where: { userId } });
    if (profile) return profile;
    return {
      userId,
      resumeUrl: null,
      headline: null,
      skills: [] as string[],
      preferredRoles: [] as string[],
      preferredLocations: [] as string[],
      expectedCtcLpa: null,
      status: 'LOOKING' as const,
      notes: null,
    };
  }

  async upsertProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.placementProfile.upsert({
      where: { userId },
      update: {
        ...(dto.resumeUrl !== undefined ? { resumeUrl: dto.resumeUrl } : {}),
        ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
        ...(dto.skills !== undefined ? { skills: dto.skills } : {}),
        ...(dto.preferredRoles !== undefined ? { preferredRoles: dto.preferredRoles } : {}),
        ...(dto.preferredLocations !== undefined ? { preferredLocations: dto.preferredLocations } : {}),
        ...(dto.expectedCtcLpa !== undefined ? { expectedCtcLpa: dto.expectedCtcLpa } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      create: {
        userId,
        resumeUrl: dto.resumeUrl ?? null,
        headline: dto.headline ?? null,
        skills: dto.skills ?? [],
        preferredRoles: dto.preferredRoles ?? [],
        preferredLocations: dto.preferredLocations ?? [],
        expectedCtcLpa: dto.expectedCtcLpa ?? null,
        status: dto.status ?? 'LOOKING',
        notes: dto.notes ?? null,
      },
    });
  }

  /** Eligible students for a job with match scores (officer view). */
  async eligibleStudents(userId: string, jobId: string) {
    const job = await this.loadJob(userId, jobId);
    const students = await this.prisma.userRole.findMany({
      where: { organizationId: job.organizationId, role: { name: 'STUDENT' } },
      include: {
        user: {
          include: {
            profile: true,
            placementProfile: true,
          },
        },
      },
    });
    const applied = await this.prisma.jobApplication.findMany({
      where: { jobPostingId: jobId },
      select: { studentId: true, status: true },
    });
    const appliedMap = new Map(applied.map((a) => [a.studentId, a.status]));

    const results = [];
    for (const row of students) {
      const match = await this.computeMatch(row.userId, job);
      results.push({
        userId: row.userId,
        email: row.user.email,
        profile: row.user.profile,
        placementProfile: row.user.placementProfile,
        matchScore: match.score,
        matchReason: match.reason,
        applicationStatus: appliedMap.get(row.userId) ?? null,
      });
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results;
  }

  private async loadJob(userId: string, jobId: string) {
    const job = await this.prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job posting not found');
    await assertOrgAccess(this.userContext, userId, job.organizationId);
    return job;
  }

  private async computeMatch(
    studentId: string,
    job: { title: string; skills: string[]; location: string | null },
  ) {
    const profile = await this.prisma.placementProfile.findUnique({ where: { userId: studentId } });
    const topics = await this.prisma.topicPerformance.findMany({
      where: { attempt: { studentId } },
      select: { topic: true, percent: true },
      take: 50,
      orderBy: { percent: 'desc' },
    });
    return scoreJobStudentMatch({
      jobTitle: job.title,
      jobSkills: job.skills,
      jobLocation: job.location,
      studentSkills: profile?.skills ?? [],
      preferredRoles: profile?.preferredRoles ?? [],
      preferredLocations: profile?.preferredLocations ?? [],
      topicScores: topics,
    });
  }
}
