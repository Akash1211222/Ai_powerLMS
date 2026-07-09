import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AssessmentsService } from '../assessments/assessments.service';

/**
 * Authenticated self-service endpoints. No special permission required — a user
 * may always read their OWN data (scoped by userId from the verified token).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly assessments: AssessmentsService,
  ) {}

  @Get('assessments')
  @ApiOperation({ summary: "The current student's published assessments + latest attempt" })
  myAssessments(@CurrentUser() user: AuthUser) {
    return this.assessments.listMine(user.userId);
  }

  @Get('assessments/attempts/:id')
  @ApiOperation({ summary: 'Own attempt result with topic breakdown' })
  myAttempt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assessments.getMyAttempt(user.userId, id);
  }

  @Get('assignments')
  @ApiOperation({ summary: "The current student's assignments (with own latest submission)" })
  myAssignments(@CurrentUser() user: AuthUser) {
    return this.assignments.listMine(user.userId);
  }

  @Get('assignments/:id')
  @ApiOperation({ summary: 'Assignment detail + own submission + released feedback' })
  myAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.getMine(user.userId, id);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Organizations the current user belongs to' })
  async organizations(@CurrentUser() user: AuthUser) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.userId },
      include: { organization: { select: { id: true, name: true, slug: true, type: true } } },
      orderBy: { isPrimary: 'desc' },
    });
    return memberships.map((m) => ({ ...m.organization, isPrimary: m.isPrimary }));
  }

  @Get('enrollments')
  @ApiOperation({ summary: "The current user's course enrollments with progress" })
  enrollments(@CurrentUser() user: AuthUser) {
    return this.prisma.enrollment.findMany({
      where: { userId: user.userId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: { select: { id: true, title: true, slug: true, level: true, status: true } },
        batch: { select: { id: true, name: true, code: true, status: true } },
        progress: true,
      },
    });
  }
}
