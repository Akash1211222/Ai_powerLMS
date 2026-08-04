import { Global, Module } from '@nestjs/common';
import { InterventionsController } from './interventions.controller';
import { InterventionsService } from './interventions.service';

/** Global so the risk engine (SkillsModule) can trigger interventions (§19). */
@Global()
@Module({
  controllers: [InterventionsController],
  providers: [InterventionsService],
  exports: [InterventionsService],
})
export class InterventionsModule {}
