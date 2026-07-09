import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Authenticated self-service endpoints. No special permission required — a user
 * may always read their OWN data (scoped by userId from the verified token).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

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
