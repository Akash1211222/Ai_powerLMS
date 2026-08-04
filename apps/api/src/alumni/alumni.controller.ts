import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AlumniService } from './alumni.service';
import { updateAlumniProfileSchema, type UpdateAlumniProfileDto } from './dto/alumni.schemas';

@ApiTags('alumni')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlumniController {
  constructor(private readonly alumni: AlumniService) {}

  @Get('me/alumni-profile')
  @ApiOperation({ summary: 'Your alumni profile (created on first access)' })
  mine(@CurrentUser() user: AuthUser) {
    return this.alumni.getOrCreate(user.userId);
  }

  @Put('me/alumni-profile')
  @ApiOperation({ summary: 'Update where you landed + your advice to students' })
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateAlumniProfileSchema)) dto: UpdateAlumniProfileDto,
  ) {
    return this.alumni.update(user.userId, dto);
  }

  @Get('alumni')
  @ApiOperation({ summary: 'Published alumni in your organization' })
  directory(@CurrentUser() user: AuthUser) {
    return this.alumni.directory(user.userId);
  }

  @Get('alumni/outcomes')
  @ApiOperation({ summary: 'Where graduates land — deterministic outcomes rollup' })
  outcomes(@CurrentUser() user: AuthUser) {
    return this.alumni.outcomes(user.userId);
  }
}
