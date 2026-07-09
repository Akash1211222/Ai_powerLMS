import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get('skills')
  @ApiOperation({ summary: 'The skill taxonomy (categories + skills)' })
  taxonomy() {
    return this.skills.getTaxonomy();
  }

  @Get('me/skills')
  @ApiOperation({ summary: "The current user's skill profile" })
  mySkills(@CurrentUser() user: AuthUser) {
    return this.skills.getUserSkills(user.userId);
  }

  @Get('students/:id/skills')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's skills + evidence (staff drill-down)" })
  studentSkills(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skills.getStudentSkills(user.userId, id);
  }

  @Post('students/:id/skills/recompute')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "Recompute a student's skill profile from evidence" })
  recompute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skills.recompute(user.userId, id);
  }

  @Post('admin/skills/recompute-all')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Recompute skill profiles for all students (ops)' })
  recomputeAll(@CurrentUser() user: AuthUser) {
    return this.skills.recomputeAll(user.userId);
  }
}
