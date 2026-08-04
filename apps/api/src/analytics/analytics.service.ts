import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computeBatchHealth,
  computeNetworkInsights,
  type BatchHealth,
  type NetworkInsights,
} from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';

/**
 * Trainer analytics (§23). Batch-health rollups are deterministic and computed
 * live in @fca/analytics (§17). Access is tenant-scoped: the caller must belong
 * to the batch's organization (or be a super admin), matching how the batches
 * module authorizes drill-downs.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  async batchHealth(actorId: string, batchId: string): Promise<BatchHealth> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { organizationId: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, actorId, batch.organizationId);
    return computeBatchHealth(this.prisma, batchId);
  }

  /**
   * Health for every batch the trainer leads/assists — the trainer analytics
   * overview. Only the caller's own batches, so no extra org check is needed.
   */
  async myBatchesHealth(actorId: string): Promise<BatchHealth[]> {
    const links = await this.prisma.batchTrainer.findMany({
      where: { userId: actorId },
      select: { batchId: true },
    });
    return Promise.all(links.map((l) => computeBatchHealth(this.prisma, l.batchId)));
  }

  /**
   * Organization-wide network insights (§33). Tenant-scoped: the caller must
   * belong to the organization (or be a super admin).
   */
  async networkInsights(actorId: string, organizationId: string): Promise<NetworkInsights> {
    await assertOrgAccess(this.userContext, actorId, organizationId);
    return computeNetworkInsights(this.prisma, organizationId);
  }
}
