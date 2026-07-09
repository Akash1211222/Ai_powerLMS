import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [AssignmentsModule],
  controllers: [MeController],
})
export class MeModule {}
