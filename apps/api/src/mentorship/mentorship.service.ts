import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import type {
  UpdateMentorProfileDto,
  CreateSlotDto,
  BookDto,
  CompleteDto,
  CreateMentorRequestDto,
  ArrangeMentorRequestDto,
} from './dto/mentorship.schemas';
import { createGoogleMeetLink } from '../live/meet.provider';
import { resolvePrimaryOrgId } from '../common/tenant';

const studentSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
};

/**
 * Mentorship (§28). Mentors publish concrete availability windows; students in
 * the same organization book them. Booking flips the slot to BOOKED (guarded
 * against double-booking); cancelling releases it back to OPEN. Both sides are
 * notified on every transition.
 */
@Injectable()
export class MentorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Mentor: profile --------------------------------------------------

  async getOrCreateProfile(userId: string) {
    const existing = await this.prisma.mentorProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.mentorProfile.create({ data: { userId } });
  }

  async updateProfile(userId: string, dto: UpdateMentorProfileDto) {
    await this.getOrCreateProfile(userId);
    return this.prisma.mentorProfile.update({ where: { userId }, data: dto });
  }

  // --- Mentor: availability ---------------------------------------------

  async createSlot(mentorId: string, dto: CreateSlotDto) {
    // Reject overlaps with the mentor's existing live slots.
    const overlap = await this.prisma.mentorSlot.findFirst({
      where: {
        mentorId,
        status: { in: ['OPEN', 'BOOKED'] },
        startsAt: { lt: dto.endsAt },
        endsAt: { gt: dto.startsAt },
      },
    });
    if (overlap) throw new ConflictException('This overlaps an existing slot');

    await this.getOrCreateProfile(mentorId);
    return this.prisma.mentorSlot.create({
      data: { mentorId, startsAt: dto.startsAt, endsAt: dto.endsAt },
    });
  }

  async listMySlots(mentorId: string) {
    return this.prisma.mentorSlot.findMany({
      where: { mentorId, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      // Cancelled bookings are history; at most one live booking per slot.
      include: {
        bookings: {
          where: { status: { not: 'CANCELLED' } },
          include: { student: { select: studentSelect } },
        },
      },
    });
  }

  async cancelSlot(mentorId: string, slotId: string) {
    const slot = await this.prisma.mentorSlot.findUnique({
      where: { id: slotId },
      include: { bookings: { where: { status: 'CONFIRMED' } } },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.mentorId !== mentorId) throw new ForbiddenException('Not your slot');
    if (slot.bookings.length > 0) {
      throw new BadRequestException('Cancel the booking before removing this slot');
    }
    return this.prisma.mentorSlot.update({ where: { id: slotId }, data: { status: 'CANCELLED' } });
  }

  // --- Mentor: bookings -------------------------------------------------

  async listMentorBookings(mentorId: string) {
    return this.prisma.mentorBooking.findMany({
      where: { mentorId },
      orderBy: { createdAt: 'desc' },
      include: { slot: true, student: { select: studentSelect } },
    });
  }

  /** Close out a session after it happened (COMPLETED or NO_SHOW). */
  async completeBooking(mentorId: string, bookingId: string, dto: CompleteDto) {
    const booking = await this.prisma.mentorBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.mentorId !== mentorId) throw new ForbiddenException('Not your booking');
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(`This booking is already ${booking.status.toLowerCase()}`);
    }
    const updated = await this.prisma.mentorBooking.update({
      where: { id: bookingId },
      data: { status: dto.status ?? 'COMPLETED', mentorNotes: dto.mentorNotes ?? null },
    });
    await this.notifications.notify(booking.studentId, {
      type: 'MENTOR_BOOKING',
      title: 'Mentor session closed',
      body: `Your mentor marked the session "${booking.topic}" as ${(dto.status ?? 'COMPLETED').toLowerCase()}.`,
      deepLink: '/mentors',
    });
    return updated;
  }

  // --- Student: discovery + booking -------------------------------------

  /** Mentors accepting bookings who share an organization with the student. */
  async listMentors(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) return [];

    const profiles = await this.prisma.mentorProfile.findMany({
      where: {
        isAcceptingBookings: true,
        user: { orgMemberships: { some: { organizationId: { in: orgIds } } } },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
            _count: { select: { mentorSlots: { where: { status: 'OPEN', startsAt: { gt: new Date() } } } } },
          },
        },
      },
    });

    return profiles.map((p) => ({
      mentorId: p.userId,
      name: p.user.profile ? `${p.user.profile.firstName} ${p.user.profile.lastName}` : p.user.email,
      avatarUrl: p.user.profile?.avatarUrl ?? null,
      headline: p.headline,
      bio: p.bio,
      expertise: p.expertise,
      openSlots: p.user._count.mentorSlots,
    }));
  }

  async listMentorSlots(mentorId: string) {
    return this.prisma.mentorSlot.findMany({
      where: { mentorId, status: 'OPEN', startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
  }

  /**
   * Books an OPEN future slot. The slot flip is conditional (updateMany on
   * status OPEN) so two concurrent bookings can't both succeed.
   */
  async book(studentId: string, slotId: string, dto: BookDto) {
    const slot = await this.prisma.mentorSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.status !== 'OPEN') throw new ConflictException('This slot is no longer available');
    if (slot.startsAt.getTime() <= Date.now()) throw new BadRequestException('This slot has already started');
    if (slot.mentorId === studentId) throw new BadRequestException('You cannot book your own slot');

    const booking = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mentorSlot.updateMany({
        where: { id: slotId, status: 'OPEN' },
        data: { status: 'BOOKED' },
      });
      if (claimed.count === 0) throw new ConflictException('This slot was just booked by someone else');
      return tx.mentorBooking.create({
        data: {
          slotId,
          mentorId: slot.mentorId,
          studentId,
          topic: dto.topic,
          note: dto.note ?? null,
        },
      });
    });

    await this.audit.record({
      action: 'mentor.booking.create',
      actorUserId: studentId,
      targetType: 'MentorBooking',
      targetId: booking.id,
    });
    await this.notifications.notify(slot.mentorId, {
      type: 'MENTOR_BOOKING',
      title: 'New mentorship booking',
      body: `A student booked your ${slot.startsAt.toLocaleString()} slot: "${dto.topic}".`,
      deepLink: '/mentors',
    });
    return booking;
  }

  async listMyBookings(studentId: string) {
    return this.prisma.mentorBooking.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        slot: true,
        mentor: { select: studentSelect },
      },
    });
  }

  /** Either side may cancel a confirmed future booking; the slot reopens. */
  async cancelBooking(actorId: string, bookingId: string) {
    const booking = await this.prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      include: { slot: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.studentId !== actorId && booking.mentorId !== actorId) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(`This booking is already ${booking.status.toLowerCase()}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const b = await tx.mentorBooking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });
      // Reopen the slot only if it hasn't started yet.
      if (booking.slot.startsAt.getTime() > Date.now()) {
        await tx.mentorSlot.update({ where: { id: booking.slotId }, data: { status: 'OPEN' } });
      }
      return b;
    });

    const notifyUserId = actorId === booking.studentId ? booking.mentorId : booking.studentId;
    await this.notifications.notify(notifyUserId, {
      type: 'MENTOR_BOOKING',
      title: 'Mentorship booking cancelled',
      body: `The session "${booking.topic}" was cancelled.`,
      deepLink: '/mentors',
    });
    return updated;
  }

  // --- Help requests (topic / doubt when no mentor slot is free) ---------

  private async primaryOrgId(userId: string) {
    // Was ordered by createdAt alone, which ignored the isPrimary flag an
    // admin sets when issuing the account.
    const primary = await resolvePrimaryOrgId(this.prisma, userId);
    if (!primary) throw new BadRequestException('Join an organization first');
    return primary;
  }

  async createRequest(studentId: string, dto: CreateMentorRequestDto) {
    const organizationId = await this.primaryOrgId(studentId);
    const openCount = await this.prisma.mentorRequest.count({
      where: { studentId, status: 'OPEN' },
    });
    if (openCount >= 5) {
      throw new BadRequestException('You already have 5 open help requests — wait for a mentor or cancel one');
    }

    const request = await this.prisma.mentorRequest.create({
      data: {
        organizationId,
        studentId,
        topic: dto.topic,
        detail: dto.detail,
        preferredExpertise: dto.preferredExpertise ?? null,
      },
    });

    // Notify mentors in the same org who are accepting bookings.
    const mentors = await this.prisma.mentorProfile.findMany({
      where: {
        isAcceptingBookings: true,
        user: { orgMemberships: { some: { organizationId } } },
      },
      select: { userId: true },
      take: 40,
    });
    await Promise.all(
      mentors
        .filter((m) => m.userId !== studentId)
        .map((m) =>
          this.notifications.notify(m.userId, {
            type: 'MENTOR_REQUEST',
            title: 'New student help request',
            body: `"${dto.topic}" — arrange a call if you can help.`,
            deepLink: '/mentorship',
          }),
        ),
    );

    await this.audit.record({
      action: 'mentor.request.create',
      actorUserId: studentId,
      targetType: 'MentorRequest',
      targetId: request.id,
    });
    return request;
  }

  async listMyRequests(studentId: string) {
    return this.prisma.mentorRequest.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        mentor: { select: studentSelect },
        booking: { include: { slot: true } },
      },
    });
  }

  async cancelRequest(studentId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.studentId !== studentId) throw new ForbiddenException('Not your request');
    if (request.status !== 'OPEN') {
      throw new BadRequestException(`This request is already ${request.status.toLowerCase()}`);
    }
    return this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });
  }

  /** Open help requests in the mentor's organization. */
  async listOpenRequestsForMentor(mentorId: string) {
    const organizationId = await this.primaryOrgId(mentorId);
    return this.prisma.mentorRequest.findMany({
      where: {
        organizationId,
        status: { in: ['OPEN', 'SCHEDULED'] },
        OR: [{ status: 'OPEN' }, { mentorId }],
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        student: { select: studentSelect },
        booking: { include: { slot: true } },
      },
      take: 100,
    });
  }

  /**
   * Mentor arranges a call for an OPEN request: creates a booked slot + booking
   * with a Meet stub link, then marks the request SCHEDULED.
   */
  async arrangeRequest(mentorId: string, requestId: string, dto: ArrangeMentorRequestDto) {
    const request = await this.prisma.mentorRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'OPEN') {
      throw new ConflictException(`This request is already ${request.status.toLowerCase()}`);
    }
    if (request.studentId === mentorId) {
      throw new BadRequestException('You cannot arrange a call for your own request');
    }

    const organizationId = await this.primaryOrgId(mentorId);
    if (request.organizationId !== organizationId) {
      throw new ForbiddenException('Request is outside your organization');
    }

    await this.getOrCreateProfile(mentorId);
    const meetUrl = createGoogleMeetLink(`${requestId}-${mentorId}`).meetingUrl;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mentorRequest.updateMany({
        where: { id: requestId, status: 'OPEN' },
        data: {
          status: 'SCHEDULED',
          mentorId,
          meetUrl,
          mentorNote: dto.mentorNote ?? null,
          scheduledAt: dto.startsAt,
        },
      });
      if (claimed.count === 0) throw new ConflictException('Another mentor just claimed this request');

      const slot = await tx.mentorSlot.create({
        data: {
          mentorId,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          status: 'BOOKED',
        },
      });
      const booking = await tx.mentorBooking.create({
        data: {
          slotId: slot.id,
          mentorId,
          studentId: request.studentId,
          topic: request.topic,
          note: request.detail,
          meetUrl,
        },
      });
      const updated = await tx.mentorRequest.update({
        where: { id: requestId },
        data: { bookingId: booking.id },
        include: {
          student: { select: studentSelect },
          booking: { include: { slot: true } },
          mentor: { select: studentSelect },
        },
      });
      return updated;
    });

    await this.notifications.notify(request.studentId, {
      type: 'MENTOR_REQUEST',
      title: 'Mentor call arranged',
      body: `A mentor booked a call for "${request.topic}" — join via the Meet link.`,
      deepLink: '/mentorship',
    });
    await this.audit.record({
      action: 'mentor.request.arrange',
      actorUserId: mentorId,
      targetType: 'MentorRequest',
      targetId: requestId,
    });
    return result;
  }

  async closeRequest(mentorId: string, requestId: string) {
    const request = await this.prisma.mentorRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'OPEN') {
      throw new BadRequestException(`This request is already ${request.status.toLowerCase()}`);
    }
    const organizationId = await this.primaryOrgId(mentorId);
    if (request.organizationId !== organizationId) throw new ForbiddenException('Not in your organization');

    const updated = await this.prisma.mentorRequest.update({
      where: { id: requestId },
      data: { status: 'CLOSED', mentorId },
    });
    await this.notifications.notify(request.studentId, {
      type: 'MENTOR_REQUEST',
      title: 'Help request closed',
      body: `Your request "${request.topic}" was closed by a mentor.`,
      deepLink: '/mentorship',
    });
    return updated;
  }
}
