import { Module } from '@nestjs/common';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';

/** Placement readiness scoring + cohort views (§24). */
@Module({
  controllers: [PlacementController],
  providers: [PlacementService],
  exports: [PlacementService],
})
export class PlacementModule {}
