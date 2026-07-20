import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computePlacementReadiness,
  computeBatchPlacement,
  type PlacementReadiness,
  type BatchPlacement,
} from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess, assertStudentAccess } from '../common/tenant';

/**
 * Placement readiness (§24). Deterministic readiness scoring computed live in
 * @fca/analytics (§17). Student self-view is open to the owner; staff drill-down
 * and cohort views are tenant-scoped.
 */
@Injectable()
export class PlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  mine(userId: string): Promise<PlacementReadiness> {
    return computePlacementReadiness(this.prisma, userId);
  }

  async forStudent(actorId: string, studentId: string): Promise<PlacementReadiness> {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    return computePlacementReadiness(this.prisma, studentId);
  }

  async forBatch(actorId: string, batchId: string): Promise<BatchPlacement> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { organizationId: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, actorId, batch.organizationId);
    return computeBatchPlacement(this.prisma, batchId);
  }
}
