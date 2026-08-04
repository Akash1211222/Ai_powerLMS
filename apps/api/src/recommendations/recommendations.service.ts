import { Injectable } from '@nestjs/common';
import { computeRecommendations, type Recommendation } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertStudentAccess } from '../common/tenant';

/**
 * Personalized "next best actions" for a student (§22). The ranking is
 * deterministic and computed live (§17) — fast enough to serve inside a request
 * (§46). Staff reads are tenant-scoped through assertStudentAccess.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  mine(userId: string): Promise<Recommendation[]> {
    return computeRecommendations(this.prisma, userId);
  }

  async forStudent(actorId: string, studentId: string): Promise<Recommendation[]> {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    return computeRecommendations(this.prisma, studentId);
  }
}
