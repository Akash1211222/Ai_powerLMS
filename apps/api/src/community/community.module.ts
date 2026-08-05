import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { CommunityFeedService } from './community-feed.service';
import { CommunitySocialService } from './community-social.service';

/** Community social hub + legacy Q&A. */
@Module({
  controllers: [CommunityController],
  providers: [CommunityService, CommunityFeedService, CommunitySocialService],
  exports: [CommunityService, CommunityFeedService, CommunitySocialService],
})
export class CommunityModule {}
