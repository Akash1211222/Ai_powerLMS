import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdeController } from './ide.controller';
import { IdeProxy } from './ide.proxy';
import { IdeService } from './ide.service';
import { IdeTokenService } from './ide-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [IdeController],
  providers: [IdeService, IdeTokenService, IdeProxy],
  exports: [IdeProxy],
})
export class IdeModule {}
