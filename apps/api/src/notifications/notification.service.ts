import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@fca/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  deepLink?: string;
}

/**
 * Event-driven notification service (§32). Persists in-app notifications and
 * fans out to email (best-effort, with a delivery record for status/retry).
 * Respects user preferences (muted types, channel toggles). Emitting a
 * notification must never break the action that triggered it, so failures are
 * logged, not thrown.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Notify a single user across their enabled channels. */
  async notify(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
      if (pref?.mutedTypes.includes(payload.type)) return;
      if (pref && !pref.inAppEnabled && !pref.emailEnabled) return;

      const notification = await this.prisma.notification.create({
        data: {
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          deepLink: payload.deepLink ?? null,
          deliveries: { create: { channel: 'IN_APP', status: 'SENT', sentAt: new Date() } },
        },
      });

      // Email fan-out (default on unless explicitly disabled).
      if (!pref || pref.emailEnabled) {
        await this.deliverEmail(userId, notification.id, payload);
      }
    } catch (err) {
      this.logger.error(`Failed to notify ${userId} (${payload.type})`, err as Error);
    }
  }

  /** Notify many users (in-app only) — used for batch-wide announcements. */
  async notifyMany(userIds: string[], payload: NotificationPayload): Promise<void> {
    if (userIds.length === 0) return;
    try {
      const muted = new Set(
        (
          await this.prisma.notificationPreference.findMany({
            where: { userId: { in: userIds }, mutedTypes: { has: payload.type } },
            select: { userId: true },
          })
        ).map((p) => p.userId),
      );
      const targets = userIds.filter((id) => !muted.has(id));
      if (targets.length === 0) return;
      await this.prisma.notification.createMany({
        data: targets.map((userId) => ({
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          deepLink: payload.deepLink ?? null,
        })),
      });
    } catch (err) {
      this.logger.error(`Failed bulk notify (${payload.type})`, err as Error);
    }
  }

  private async deliverEmail(
    userId: string,
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.create({
      data: { notificationId, channel: 'EMAIL', status: 'PENDING', attempts: 1 },
    });
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('user not found');
      await this.mail.sendNotification(user.email, payload.title, payload.body, payload.deepLink);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', error: (err as Error).message },
      });
    }
  }

  // --- Read-side (REST) -------------------------------------------------

  async list(userId: string, unreadOnly: boolean, page: number, pageSize: number) {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [data, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, unread, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async unreadCount(userId: string) {
    return { unread: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: res.count };
  }

  async getPreference(userId: string) {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return pref ?? { userId, inAppEnabled: true, emailEnabled: true, mutedTypes: [] };
  }

  async updatePreference(
    userId: string,
    dto: { inAppEnabled?: boolean; emailEnabled?: boolean; mutedTypes?: string[] },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        inAppEnabled: dto.inAppEnabled ?? true,
        emailEnabled: dto.emailEnabled ?? true,
        mutedTypes: dto.mutedTypes ?? [],
      },
    });
  }
}
