import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PasswordService } from '../auth/password.service';

@Module({
  controllers: [AdminController],
  // PasswordService is stateless (argon2 cost from config), so it is provided
  // here directly rather than importing AuthModule and risking a cycle.
  providers: [AdminService, PasswordService],
})
export class AdminModule {}
