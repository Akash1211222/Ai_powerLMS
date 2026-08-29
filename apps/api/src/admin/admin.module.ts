import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';

@Module({
  // JwtModule for the short-lived "view as" token. Registered empty: the secret
  // and lifetime are passed per call by TokenService.
  imports: [JwtModule.register({})],
  controllers: [AdminController],
  // PasswordService and TokenService are stateless (their secrets and costs come
  // from config), so they are provided here directly rather than importing
  // AuthModule and risking a cycle.
  providers: [AdminService, PasswordService, TokenService],
})
export class AdminModule {}
