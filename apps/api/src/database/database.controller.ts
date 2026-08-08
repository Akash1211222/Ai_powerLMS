import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DatabaseService } from './database.service';
import {
  listRowsQuerySchema,
  rowInputSchema,
  type ListRowsQuery,
  type RowInputDto,
} from './dto/database.schemas';

/**
 * Raw table browser and row editor (/admin/database).
 *
 * Every route requires `database:admin`, which only SUPER_ADMIN holds. This
 * deliberately sits outside the org-scoping every other controller applies:
 * it is a platform-operator tool that reads across all organizations, which is
 * exactly why no org-scoped role is ever granted the permission.
 *
 * Writes here bypass service-layer validation and business rules, so all three
 * mutations are recorded in the audit log with before/after values.
 */
@ApiTags('admin-database')
@ApiBearerAuth()
@Controller('admin/database')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.DATABASE_ADMIN)
export class DatabaseController {
  constructor(private readonly database: DatabaseService) {}

  @Get('tables')
  @ApiOperation({ summary: 'Every table with its row and column counts' })
  overview() {
    return this.database.overview();
  }

  @Get('tables/:model/schema')
  @ApiOperation({ summary: 'Column types, enums and relations for one table' })
  schema(@Param('model') model: string) {
    return this.database.schema(model);
  }

  @Get('tables/:model/rows')
  @ApiOperation({ summary: 'Browse rows (paginated, sortable, searchable)' })
  listRows(
    @Param('model') model: string,
    @Query(new ZodValidationPipe(listRowsQuerySchema)) query: ListRowsQuery,
  ) {
    return this.database.listRows(model, query);
  }

  @Get('tables/:model/rows/:id')
  @ApiOperation({ summary: 'Read one row by primary key' })
  getRow(@Param('model') model: string, @Param('id') id: string) {
    return this.database.getRow(model, id);
  }

  @Post('tables/:model/rows')
  @ApiOperation({ summary: 'Insert a row. Audited.' })
  createRow(
    @CurrentUser() user: AuthUser,
    @Param('model') model: string,
    @Body(new ZodValidationPipe(rowInputSchema)) dto: RowInputDto,
  ) {
    return this.database.createRow(user.userId, model, dto.values);
  }

  @Patch('tables/:model/rows/:id')
  @ApiOperation({ summary: 'Update columns on one row. Audited with before/after.' })
  updateRow(
    @CurrentUser() user: AuthUser,
    @Param('model') model: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rowInputSchema)) dto: RowInputDto,
  ) {
    return this.database.updateRow(user.userId, model, id, dto.values);
  }

  @Get('tables/:model/rows/:id/impact')
  @ApiOperation({
    summary: 'What else a delete would remove. Call this before deleting.',
  })
  deleteImpact(@Param('model') model: string, @Param('id') id: string) {
    return this.database.deleteImpact(model, id);
  }

  @Delete('tables/:model/rows/:id')
  @ApiOperation({
    summary:
      'Delete one row. Requires ?confirm=true because cascading foreign keys ' +
      'can remove far more than the named row — see the impact endpoint. Audited.',
  })
  deleteRow(
    @CurrentUser() user: AuthUser,
    @Param('model') model: string,
    @Param('id') id: string,
    @Query('confirm') confirm?: string,
  ) {
    // An explicit opt-in, so a stray DELETE (a mis-click, a replayed URL)
    // cannot cascade through the schema on its own.
    if (confirm !== 'true') {
      throw new BadRequestException(
        'Deleting requires ?confirm=true. Check /impact first — cascading ' +
          'foreign keys may remove dependent rows in other tables.',
      );
    }
    return this.database.deleteRow(user.userId, model, id);
  }
}
