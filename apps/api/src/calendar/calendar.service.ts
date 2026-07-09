import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/calendar.schemas';

export interface CalendarItem {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  sourceType: string;
  sourceId: string;
  context: string | null; // e.g. batch/course name
}

/**
 * Unified calendar (§33). Derives live-class, assignment-due and assessment-due
 * events on the fly from their source tables (no duplicated data) and merges
 * them with stored personal events. Aggregation uses parallel queries.
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
    const [schedules, assignments, assessments, personal] = await Promise.all([
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
    ]);

    const items: CalendarItem[] = [
      ...schedules.map((s) => ({
        id: `sch_${s.id}`,
        type: 'LIVE_CLASS',
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        allDay: false,
        location: s.location,
        sourceType: 'BatchSchedule',
        sourceId: s.id,
        context: s.batch.name,
      })),
      ...assignments.map((a) => ({
        id: `asg_${a.id}`,
        type: 'ASSIGNMENT_DUE',
        title: `Due: ${a.title}`,
        startsAt: a.dueAt!,
        endsAt: null,
        allDay: false,
        location: null,
        sourceType: 'Assignment',
        sourceId: a.id,
        context: a.batch.name,
      })),
      ...assessments.map((a) => ({
        id: `asm_${a.id}`,
        type: 'ASSESSMENT_DUE',
        title: `Test due: ${a.title}`,
        startsAt: a.dueAt!,
        endsAt: null,
        allDay: false,
        location: null,
        sourceType: 'Assessment',
        sourceId: a.id,
        context: a.batch.name,
      })),
      ...personal.map((e) => ({
        id: `evt_${e.id}`,
        type: e.type,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        allDay: e.allDay,
        location: e.location,
        sourceType: 'CalendarEvent',
        sourceId: e.id,
        context: null,
      })),
    ];

    return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async createPersonalEvent(userId: string, dto: CreateEventDto) {
    return this.prisma.calendarEvent.create({
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
  }

  async deletePersonalEvent(userId: string, id: string) {
    await this.prisma.calendarEvent.deleteMany({ where: { id, userId } });
    return { success: true };
  }
}
