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
} from './dto/mentorship.schemas';

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
}
