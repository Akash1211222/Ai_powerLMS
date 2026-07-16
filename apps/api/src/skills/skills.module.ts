import { Global, Module } from '@nestjs/common';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { ScoresService } from './scores.service';
import { RiskService } from './risk.service';

/** Global so other modules (assessments, assignments) can trigger recomputes. */
@Global()
@Module({
  controllers: [SkillsController],
  providers: [SkillsService, ScoresService, RiskService],
  exports: [SkillsService, ScoresService, RiskService],
})
export class SkillsModule {}
