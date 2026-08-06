-- Moderation for the community hub (COMMUNITY_MODERATE).
--
-- Soft removal rather than DELETE: the row is kept so the audit trail survives
-- and an accepted-answer reference cannot dangle. Reads filter removedAt IS NULL.
ALTER TABLE "community_posts"     ADD COLUMN "removedAt" TIMESTAMP(3), ADD COLUMN "removedById" TEXT;
ALTER TABLE "community_questions" ADD COLUMN "removedAt" TIMESTAMP(3), ADD COLUMN "removedById" TEXT;
ALTER TABLE "community_answers"   ADD COLUMN "removedAt" TIMESTAMP(3), ADD COLUMN "removedById" TEXT;

-- Listings are always "not removed, newest first"; keep them index-covered.
CREATE INDEX "community_posts_organizationId_removedAt_idx"     ON "community_posts" ("organizationId", "removedAt");
CREATE INDEX "community_questions_organizationId_removedAt_idx" ON "community_questions" ("organizationId", "removedAt");
