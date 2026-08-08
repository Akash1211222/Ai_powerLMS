import { Module } from '@nestjs/common';
import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';

/** Raw table browser + row editor, gated on `database:admin` (SUPER_ADMIN). */
@Module({
  controllers: [DatabaseController],
  providers: [DatabaseService],
})
export class DatabaseAdminModule {}
