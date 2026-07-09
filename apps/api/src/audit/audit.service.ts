import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  requestId?: string | null;
}

/**
 * Central audit writer (§8, §39). Sensitive actions call `record()`. Audit
 * writes must never break the request they describe, so failures are logged,
 * not thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorUserId: entry.actorUserId ?? null,
          organizationId: entry.organizationId ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as object | undefined,
          ipAddress: entry.ipAddress ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for "${entry.action}"`, err as Error);
    }
  }
}
