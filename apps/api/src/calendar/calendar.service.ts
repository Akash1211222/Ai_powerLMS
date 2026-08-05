import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto, UpdateEventDto } from './dto/calendar.schemas';

export interface CalendarItem {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  sourceType: string;
  sourceId: string;
  context: string | null;
  description: string | null;
  href: string | null;
}

/**
 * Unified calendar (§33). Derives live-class, assignment-due, assessment-due
 * and mentor sessions on the fly, then merges stored personal events.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(userId: string, from?: Date, to?: Date): Promise<CalendarItem[]> {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [asStudent, asTrainer] = await Promise.all([
      this.prisma.batchStudent.findMany({ where: { userId, status: 'ACTIVE' }, select: { batchId: true } }),
      this.prisma.batchTrainer.findMany({ where: { userId }, select: { batchId: true } }),
    ]);
    const batchIds = [...new Set([...asStudent, ...asTrainer].map((b) => b.batchId))];

    const range = { gte: start, lte: end };
    const [schedules, assignments, assessments, personal, mentorBookings, mentorRequests] =
      await Promise.all([
        batchIds.length
          ? this.prisma.batchSchedule.findMany({
              where: { batchId: { in: batchIds }, startsAt: range },
              include: { batch: { select: { name: true } } },
            })
          : Promise.resolve([]),
        batchIds.length
          ? this.prisma.assignment.findMany({
              where: { batchId: { in: batchIds }, status: 'PUBLISHED', dueAt: range },
              include: { batch: { select: { name: true } } },
            })
          : Promise.resolve([]),
        batchIds.length
          ? this.prisma.assessment.findMany({
              where: { batchId: { in: batchIds }, status: 'PUBLISHED', dueAt: range },
              include: { batch: { select: { name: true } } },
            })
          : Promise.resolve([]),
        this.prisma.calendarEvent.findMany({ where: { userId, startsAt: range } }),
        this.prisma.mentorBooking.findMany({
          where: {
            status: { in: ['CONFIRMED', 'COMPLETED'] },
            OR: [{ studentId: userId }, { mentorId: userId }],
            slot: { startsAt: range },
          },
          include: {
            slot: true,
            mentor: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } },
            student: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } },
          },
        }),
        this.prisma.mentorRequest.findMany({
          where: {
            status: 'SCHEDULED',
            scheduledAt: range,
            OR: [{ studentId: userId }, { mentorId: userId }],
          },
          include: {
            mentor: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } },
            student: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } },
          },
        }),
      ]);

    const personName = (p?: {
      email: string;
      profile: { firstName: string; lastName: string } | null;
    } | null) => {
      if (!p) return 'Mentor';
      return p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email;
    };

    const items: CalendarItem[] = [
      ...schedules.map((s) => ({
        id: `sch_${s.id}`,
        type: 'LIVE_CLASS',
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        allDay: false,
        location: s.location,
        meetingUrl: s.meetingUrl ?? null,
        sourceType: 'BatchSchedule',
        sourceId: s.id,
        context: s.batch.name,
        description: null,
        href: `/live/${s.id}`,
      })),
      ...assignments.map((a) => ({
        id: `asg_${a.id}`,
        type: 'ASSIGNMENT_DUE',
        title: `Due: ${a.title}`,
        startsAt: a.dueAt!,
        endsAt: null,
        allDay: false,
        location: null,
        meetingUrl: null,
        sourceType: 'Assignment',
        sourceId: a.id,
        context: a.batch.name,
        description: null,
        href: `/assignments/${a.id}`,
      })),
      ...assessments.map((a) => ({
        id: `asm_${a.id}`,
        type: 'ASSESSMENT_DUE',
        title: `Test due: ${a.title}`,
        startsAt: a.dueAt!,
        endsAt: null,
        allDay: false,
        location: null,
        meetingUrl: null,
        sourceType: 'Assessment',
        sourceId: a.id,
        context: a.batch.name,
        description: null,
        href: `/assessments/${a.id}`,
      })),
      ...mentorBookings.map((b) => {
        const other = b.studentId === userId ? b.mentor : b.student;
        return {
          id: `mbk_${b.id}`,
          type: 'MENTOR_SESSION',
          title: `Mentor: ${b.topic}`,
          startsAt: b.slot.startsAt,
          endsAt: b.slot.endsAt,
          allDay: false,
          location: null,
          meetingUrl: b.meetUrl ?? null,
          sourceType: 'MentorBooking',
          sourceId: b.id,
          context: personName(other),
          description: b.note,
          href: '/mentorship',
        };
      }),
      ...mentorRequests
        .filter((r) => r.scheduledAt)
        .map((r) => {
          const other = r.studentId === userId ? r.mentor : r.student;
          return {
            id: `mrq_${r.id}`,
            type: 'MENTOR_SESSION',
            title: `Mentor call: ${r.topic}`,
            startsAt: r.scheduledAt!,
            endsAt: null,
            allDay: false,
            location: null,
            meetingUrl: r.meetUrl ?? null,
            sourceType: 'MentorRequest',
            sourceId: r.id,
            context: personName(other),
            description: r.detail,
            href: '/mentorship',
          };
        }),
      ...personal.map((e) => ({
        id: `evt_${e.id}`,
        type: e.type,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        allDay: e.allDay,
        location: e.location,
        meetingUrl: null,
        sourceType: 'CalendarEvent',
        sourceId: e.id,
        context: null,
        description: e.description,
        href: null,
      })),
    ];

    return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  private toItem(e: {
    id: string;
    type: string;
    title: string;
    startsAt: Date;
    endsAt: Date | null;
    allDay: boolean;
    location: string | null;
    description: string | null;
  }): CalendarItem {
    return {
      id: `evt_${e.id}`,
      type: e.type,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      location: e.location,
      meetingUrl: null,
      sourceType: 'CalendarEvent',
      sourceId: e.id,
      context: null,
      description: e.description,
      href: null,
    };
  }

  async createPersonalEvent(userId: string, dto: CreateEventDto): Promise<CalendarItem> {
    const e = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        type: dto.type ?? 'PERSONAL_TASK',
        startsAt: dto.startsAt,
        endsAt: dto.endsAt ?? null,
        allDay: dto.allDay ?? false,
        location: dto.location ?? null,
        createdById: userId,
      },
    });
    return this.toItem(e);
  }

  async updatePersonalEvent(userId: string, id: string, dto: UpdateEventDto): Promise<CalendarItem> {
    const rawId = id.startsWith('evt_') ? id.slice(4) : id;
    const existing = await this.prisma.calendarEvent.findFirst({ where: { id: rawId, userId } });
    if (!existing) throw new NotFoundException('Event not found');

    const e = await this.prisma.calendarEvent.update({
      where: { id: rawId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ?? null } : {}),
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
        ...(dto.location !== undefined ? { location: dto.location ?? null } : {}),
      },
    });
    return this.toItem(e);
  }

  async deletePersonalEvent(userId: string, id: string) {
    const rawId = id.startsWith('evt_') ? id.slice(4) : id;
    const result = await this.prisma.calendarEvent.deleteMany({ where: { id: rawId, userId } });
    if (result.count === 0) throw new NotFoundException('Event not found');
    return { success: true };
  }
}
