import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** Referrals — the network vouching for its own (§30). */
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
