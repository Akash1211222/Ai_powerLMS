import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { PlacementsModule } from '../placements/placements.module';

@Module({
  imports: [AssignmentsModule, AssessmentsModule, PlacementsModule],
  controllers: [MeController],
})
export class MeModule {}
