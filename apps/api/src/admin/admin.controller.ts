import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationQuerySchema,
  buildPaginationMeta,
  PERMISSIONS,
  type Paginated,
} from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';

/**
 * Minimal admin surface used to exercise authorization end-to-end (§35 groundwork).
 * The audit-log viewer requires the `audit:view` permission.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'List audit logs (paginated). Requires audit:view.' })
  async auditLogs(@Query() query: Record<string, unknown>): Promise<Paginated<unknown>> {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data: rows, meta: buildPaginationMeta(total, page, pageSize) };
  }
}
