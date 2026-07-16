import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { SkillsService } from './skills.service';
import { ScoresService } from './scores.service';
import { RiskService } from './risk.service';

@ApiTags('skills')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly scores: ScoresService,
    private readonly risk: RiskService,
  ) {}

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

  // --- Performance scores (§17) -----------------------------------------

  @Get('me/score')
  @ApiOperation({ summary: "The current user's performance scores + components" })
  myScore(@CurrentUser() user: AuthUser) {
    return this.scores.getUserScore(user.userId);
  }

  @Get('students/:id/score')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's performance scores (staff)" })
  studentScore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scores.getStudentScore(user.userId, id);
  }

  @Post('students/:id/score/recompute')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "Recompute a student's performance scores" })
  recomputeScore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scores.recompute(user.userId, id);
  }

  // --- At-risk detection (§18) ------------------------------------------

  @Get('students/:id/risk')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "A student's latest risk snapshot + history (with factors)" })
  studentRisk(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.risk.getStudentRisk(user.userId, id);
  }

  @Post('students/:id/risk/evaluate')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: "Evaluate a student's risk now" })
  evaluateRisk(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.risk.evaluate(user.userId, id);
  }

  @Get('me/at-risk')
  @ApiOperation({ summary: "At-risk students across the caller's batches (trainer queue)" })
  myAtRisk(@CurrentUser() user: AuthUser) {
    return this.risk.getTrainerAtRisk(user.userId);
  }

  @Get('batches/:id/at-risk')
  @RequirePermissions(PERMISSIONS.STUDENT_VIEW)
  @ApiOperation({ summary: 'At-risk students in a batch, worst first (trainer queue)' })
  batchAtRisk(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.risk.getBatchAtRisk(user.userId, id);
  }

  @Post('admin/risk/evaluate-all')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Sweep every active student for risk (ops)' })
  evaluateAllRisk(@CurrentUser() user: AuthUser) {
    return this.risk.evaluateAll(user.userId);
  }
}
