-- Community social hub + notification types

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMUNITY_POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMUNITY_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMUNITY_GROUP_INVITE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMUNITY_EVENT_REMINDER';

CREATE TYPE "CommunityChannelKind" AS ENUM ('GENERAL', 'TOPIC', 'BATCH');
CREATE TYPE "CommunityPostKind" AS ENUM ('UPDATE', 'SHOWCASE', 'QUESTION', 'AMA');
CREATE TYPE "CommunityStudyRoomStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CommunityGroupVisibility" AS ENUM ('OPEN', 'REQUEST');
CREATE TYPE "CommunityGroupMemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "ConversationKind" AS ENUM ('DM', 'GROUP_CHAT');
CREATE TYPE "CommunityEventRsvpStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

CREATE TABLE "community_channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '💬',
    "kind" "CommunityChannelKind" NOT NULL DEFAULT 'TOPIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_channel_members" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_channel_members_pkey" PRIMARY KEY ("channelId","userId")
);

CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "authorId" TEXT NOT NULL,
    "kind" "CommunityPostKind" NOT NULL DEFAULT 'UPDATE',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "questionId" TEXT,
    "showcaseTitle" TEXT,
    "showcaseSub" TEXT,
    "showcaseEmoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_post_reactions" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_post_reactions_pkey" PRIMARY KEY ("postId","userId")
);

CREATE TABLE "community_post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_post_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_study_rooms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CommunityStudyRoomStatus" NOT NULL DEFAULT 'OPEN',
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_study_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_study_room_presence" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "community_study_room_presence_pkey" PRIMARY KEY ("roomId","userId")
);

CREATE TABLE "community_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "CommunityGroupVisibility" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_group_members" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CommunityGroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_group_members_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE "community_conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL DEFAULT 'DM',
    "groupId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_conversation_members" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_conversation_members_pkey" PRIMARY KEY ("conversationId","userId")
);

CREATE TABLE "community_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_event_rsvps" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CommunityEventRsvpStatus" NOT NULL DEFAULT 'GOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_event_rsvps_pkey" PRIMARY KEY ("eventId","userId")
);

CREATE UNIQUE INDEX "community_channels_organizationId_slug_key" ON "community_channels"("organizationId", "slug");
CREATE INDEX "community_channels_organizationId_idx" ON "community_channels"("organizationId");
CREATE INDEX "community_channel_members_userId_idx" ON "community_channel_members"("userId");
CREATE INDEX "community_posts_organizationId_createdAt_idx" ON "community_posts"("organizationId", "createdAt");
CREATE INDEX "community_posts_channelId_createdAt_idx" ON "community_posts"("channelId", "createdAt");
CREATE INDEX "community_posts_authorId_idx" ON "community_posts"("authorId");
CREATE INDEX "community_post_reactions_userId_idx" ON "community_post_reactions"("userId");
CREATE INDEX "community_post_comments_postId_createdAt_idx" ON "community_post_comments"("postId", "createdAt");
CREATE INDEX "community_post_comments_authorId_idx" ON "community_post_comments"("authorId");
CREATE INDEX "community_study_rooms_organizationId_status_idx" ON "community_study_rooms"("organizationId", "status");
CREATE INDEX "community_study_room_presence_userId_idx" ON "community_study_room_presence"("userId");
CREATE INDEX "community_groups_organizationId_idx" ON "community_groups"("organizationId");
CREATE INDEX "community_group_members_userId_idx" ON "community_group_members"("userId");
CREATE UNIQUE INDEX "community_conversations_groupId_key" ON "community_conversations"("groupId");
CREATE INDEX "community_conversations_organizationId_updatedAt_idx" ON "community_conversations"("organizationId", "updatedAt");
CREATE INDEX "community_conversation_members_userId_idx" ON "community_conversation_members"("userId");
CREATE INDEX "community_messages_conversationId_createdAt_idx" ON "community_messages"("conversationId", "createdAt");
CREATE INDEX "community_messages_authorId_idx" ON "community_messages"("authorId");
CREATE INDEX "community_events_organizationId_startsAt_idx" ON "community_events"("organizationId", "startsAt");
CREATE INDEX "community_event_rsvps_userId_idx" ON "community_event_rsvps"("userId");

ALTER TABLE "community_channels" ADD CONSTRAINT "community_channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_channels" ADD CONSTRAINT "community_channels_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_channel_members" ADD CONSTRAINT "community_channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "community_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_channel_members" ADD CONSTRAINT "community_channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "community_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_study_rooms" ADD CONSTRAINT "community_study_rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_study_rooms" ADD CONSTRAINT "community_study_rooms_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "community_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_study_rooms" ADD CONSTRAINT "community_study_rooms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_study_room_presence" ADD CONSTRAINT "community_study_room_presence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "community_study_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_study_room_presence" ADD CONSTRAINT "community_study_room_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "community_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_conversations" ADD CONSTRAINT "community_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_conversations" ADD CONSTRAINT "community_conversations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "community_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_conversations" ADD CONSTRAINT "community_conversations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_conversation_members" ADD CONSTRAINT "community_conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "community_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_conversation_members" ADD CONSTRAINT "community_conversation_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "community_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_event_rsvps" ADD CONSTRAINT "community_event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_event_rsvps" ADD CONSTRAINT "community_event_rsvps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
