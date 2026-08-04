import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [AssignmentsModule, AssessmentsModule],
  controllers: [MeController],
})
export class MeModule {}
