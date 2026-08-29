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
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            // Branding travels with the organisation so the shell can theme
            // itself the moment the active college is known.
            displayName: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
      },
      orderBy: { isPrimary: 'desc' },
    });
    return memberships.map((m) => ({ ...m.organization, isPrimary: m.isPrimary }));
  }

  @Get('portfolio')
  @ApiOperation({
    summary:
      'Every organisation the user belongs to, with the numbers that say ' +
      'whether it needs attention. For an operations lead running several ' +
      'colleges; one row for everybody else.',
  })
  async portfolio(@CurrentUser() user: AuthUser) {
    // Scoped to memberships, never "all organisations". An operations lead
    // reaches several colleges by belonging to them, so this is the same
    // boundary every other endpoint uses rather than a new one.
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.userId },
      include: {
        organization: {
          select: { id: true, name: true, displayName: true, slug: true, type: true },
        },
      },
      orderBy: { isPrimary: 'desc' },
    });

    return Promise.all(
      memberships.map(async (m) => {
        const organizationId = m.organizationId;
        const [batches, activeBatches, students, openRoles, pendingApplications] =
          await Promise.all([
            this.prisma.batch.count({ where: { organizationId } }),
            this.prisma.batch.count({ where: { organizationId, status: 'ACTIVE' } }),
            this.prisma.batchStudent.count({
              where: { status: 'ACTIVE', batch: { organizationId } },
            }),
            this.prisma.opportunity.count({ where: { organizationId, status: 'OPEN' } }),
            this.prisma.application.count({
              where: { status: 'APPLIED', opportunity: { organizationId } },
            }),
          ]);

        // Attendance across the college, as a single number a lead can scan.
        const [present, total] = await Promise.all([
          this.prisma.attendanceRecord.count({
            where: { status: 'PRESENT', session: { batch: { organizationId } } },
          }),
          this.prisma.attendanceRecord.count({ where: { session: { batch: { organizationId } } } }),
        ]);

        return {
          organization: m.organization,
          isPrimary: m.isPrimary,
          batches,
          activeBatches,
          students,
          openRoles,
          pendingApplications,
          // Null rather than 0% when nothing has been recorded — an empty
          // college is not a college with terrible attendance.
          attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
        };
      }),
    );
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
