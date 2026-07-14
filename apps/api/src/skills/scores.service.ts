import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { computeAndStoreStudentScore } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { isMemberOf } from '../authz/principal';

/**
 * Student performance scores (§17). Deterministic composite scores computed by
 * @fca/analytics; this service handles persistence access + authorization.
 */
@Injectable()
export class ScoresService {
  private readonly logger = new Logger(ScoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  async getUserScore(userId: string) {
    return this.prisma.studentScore.findUnique({ where: { userId } });
  }

  private async assertCanViewStudent(actorId: string, studentId: string) {
    const principal = await this.userContext.getPrincipal(actorId);
    if (principal.isSuperAdmin) return;
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: studentId },
      select: { organizationId: true },
    });
    if (!memberships.some((m) => isMemberOf(principal, m.organizationId))) {
      throw new ForbiddenException('You do not have access to this student');
    }
  }

  async getStudentScore(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    return this.prisma.studentScore.findUnique({ where: { userId: studentId } });
  }

  async recompute(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    return computeAndStoreStudentScore(this.prisma, studentId);
  }

  /** Best-effort recompute triggered by events; never throws to the caller. */
  async recomputeSafe(studentId: string): Promise<void> {
    try {
      await computeAndStoreStudentScore(this.prisma, studentId);
    } catch (err) {
      this.logger.warn(`Score recompute failed for ${studentId}: ${(err as Error).message}`);
    }
  }
}
