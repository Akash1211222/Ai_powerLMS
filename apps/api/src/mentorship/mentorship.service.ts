import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateBookingDto,
  UpdateBookingDto,
  UpdateMentorProfileDto,
} from './dto/mentorship.schemas';

const userSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

/**
 * Mentorship (§17): a mentor directory plus a direct-booking lifecycle
 * (REQUESTED → CONFIRMED/DECLINED → COMPLETED, student may CANCEL or RATE).
 * Access is ownership-based: mentors act on their sessions, students on theirs.
 */
@Injectable()
export class MentorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  /** Mentor directory for an organization. */
  async listMentors(callerId: string, organizationId: string) {
    await assertOrgAccess(this.userContext, callerId, organizationId);

    const profiles = await this.prisma.mentorProfile.findMany({
      where: {
        user: { orgMemberships: { some: { organizationId } }, status: 'ACTIVE' },
      },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });

    // Confirmed sessions in the current week, to surface remaining capacity.
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const mentorIds = profiles.map((p) => p.userId);
    const confirmed = mentorIds.length
      ? await this.prisma.mentorshipBooking.groupBy({
          by: ['mentorId'],
          where: {
            mentorId: { in: mentorIds },
            status: 'CONFIRMED',
            scheduledAt: { gte: weekStart, lt: weekEnd },
          },
          _count: { _all: true },
        })
      : [];
    const confirmedByMentor = new Map(confirmed.map((c) => [c.mentorId, c._count._all]));

    return profiles.map((p) => ({
      userId: p.userId,
      firstName: p.user.profile?.firstName ?? '',
      lastName: p.user.profile?.lastName ?? '',
      email: p.user.email,
      headline: p.headline,
      bio: p.bio,
      expertise: p.expertise,
      weeklyCapacity: p.weeklyCapacity,
      isAcceptingBookings: p.isAcceptingBookings,
      confirmedThisWeek: confirmedByMentor.get(p.userId) ?? 0,
    }));
  }

  async getMyProfile(userId: string) {
    return this.prisma.mentorProfile.findUnique({ where: { userId } });
  }

  async upsertProfile(userId: string, dto: UpdateMentorProfileDto) {
    return this.prisma.mentorProfile.upsert({
      where: { userId },
      update: { ...dto },
      create: {
        userId,
        headline: dto.headline,
        bio: dto.bio,
        expertise: dto.expertise ?? [],
        weeklyCapacity: dto.weeklyCapacity ?? 5,
        isAcceptingBookings: dto.isAcceptingBookings ?? true,
      },
    });
  }

  async createBooking(studentId: string, dto: CreateBookingDto) {
    if (dto.mentorId === studentId) {
      throw new BadRequestException('You cannot book a session with yourself');
    }
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId: dto.mentorId },
      include: { user: { select: userSelect } },
    });
    if (!mentorProfile) throw new NotFoundException('Mentor not found');
    if (!mentorProfile.isAcceptingBookings) {
      throw new BadRequestException('This mentor is not accepting bookings right now');
    }
    if (dto.scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException('Session time must be in the future');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: userSelect,
    });

    const booking = await this.prisma.mentorshipBooking.create({
      data: {
        mentorId: dto.mentorId,
        studentId,
        topic: dto.topic,
        note: dto.note,
        scheduledAt: dto.scheduledAt,
        durationMin: dto.durationMin,
      },
      include: {
        mentor: { select: userSelect },
        student: { select: userSelect },
      },
    });

    await this.notifications.notify(dto.mentorId, {
      type: 'MENTOR_BOOKING',
      title: 'New mentorship request',
      body: `${student?.profile?.firstName ?? 'A student'} requested a session: "${dto.topic}".`,
      deepLink: '/mentorship',
    });

    return booking;
  }

  /** All bookings where the caller is the mentor or the student. */
  async myBookings(userId: string) {
    const bookings = await this.prisma.mentorshipBooking.findMany({
      where: { OR: [{ mentorId: userId }, { studentId: userId }] },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      include: {
        mentor: { select: userSelect },
        student: { select: userSelect },
      },
    });
    return {
      asMentor: bookings.filter((b) => b.mentorId === userId),
      asStudent: bookings.filter((b) => b.studentId === userId),
    };
  }

  async updateBooking(userId: string, bookingId: string, dto: UpdateBookingDto) {
    const booking = await this.prisma.mentorshipBooking.findUnique({
      where: { id: bookingId },
      include: {
        mentor: { select: userSelect },
        student: { select: userSelect },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isMentor = booking.mentorId === userId;
    const isStudent = booking.studentId === userId;
    if (!isMentor && !isStudent) {
      throw new ForbiddenException('You are not part of this session');
    }

    const now = new Date();
    let data: Record<string, unknown>;
    let notifyUserId: string;
    let notifyBody: string;

    switch (dto.action) {
      case 'CONFIRM':
        if (!isMentor) throw new ForbiddenException('Only the mentor can confirm');
        if (booking.status !== 'REQUESTED') {
          throw new BadRequestException(`Cannot confirm a ${booking.status} session`);
        }
        data = { status: 'CONFIRMED', meetingUrl: dto.meetingUrl, respondedAt: now };
        notifyUserId = booking.studentId;
        notifyBody = `Your session "${booking.topic}" was confirmed.`;
        break;
      case 'DECLINE':
        if (!isMentor) throw new ForbiddenException('Only the mentor can decline');
        if (booking.status !== 'REQUESTED') {
          throw new BadRequestException(`Cannot decline a ${booking.status} session`);
        }
        data = { status: 'DECLINED', respondedAt: now };
        notifyUserId = booking.studentId;
        notifyBody = `Your session "${booking.topic}" was declined — try another time slot.`;
        break;
      case 'COMPLETE':
        if (!isMentor) throw new ForbiddenException('Only the mentor can complete');
        if (booking.status !== 'CONFIRMED') {
          throw new BadRequestException('Only confirmed sessions can be completed');
        }
        data = { status: 'COMPLETED', outcomeNote: dto.outcomeNote };
        notifyUserId = booking.studentId;
        notifyBody = `Your session "${booking.topic}" was marked complete. You can rate it now.`;
        break;
      case 'CANCEL':
        if (!isStudent) throw new ForbiddenException('Only the student can cancel');
        if (booking.status === 'COMPLETED' || booking.status === 'DECLINED') {
          throw new BadRequestException(`Cannot cancel a ${booking.status} session`);
        }
        data = { status: 'CANCELLED' };
        notifyUserId = booking.mentorId;
        notifyBody = `The session "${booking.topic}" was cancelled by the student.`;
        break;
      case 'RATE':
        if (!isStudent) throw new ForbiddenException('Only the student can rate');
        if (booking.status !== 'COMPLETED') {
          throw new BadRequestException('Only completed sessions can be rated');
        }
        if (!dto.rating) throw new BadRequestException('rating is required');
        data = { rating: dto.rating };
        notifyUserId = booking.mentorId;
        notifyBody = `You received a ${dto.rating}★ rating for "${booking.topic}".`;
        break;
    }

    const updated = await this.prisma.mentorshipBooking.update({
      where: { id: bookingId },
      data,
      include: {
        mentor: { select: userSelect },
        student: { select: userSelect },
      },
    });

    await this.notifications.notify(notifyUserId, {
      type: 'MENTOR_BOOKING',
      title: 'Mentorship update',
      body: notifyBody,
      deepLink: '/mentorship',
    });

    return updated;
  }
}
