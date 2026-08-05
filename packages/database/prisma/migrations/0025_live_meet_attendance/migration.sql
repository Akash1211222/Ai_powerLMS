-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleEmail" TEXT;

-- AlterTable
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "keyPoints" JSONB;
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "homework" TEXT;
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "qaItems" JSONB;
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "summaryUpdatedAt" TIMESTAMP(3);
ALTER TABLE "batch_schedules" ADD COLUMN IF NOT EXISTS "summaryUpdatedById" TEXT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LivePresenceSource" AS ENUM ('APP_HEARTBEAT', 'MEET_IMPORT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "live_class_presences" ADD COLUMN IF NOT EXISTS "attendedSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "live_class_presences" ADD COLUMN IF NOT EXISTS "attendancePct" DOUBLE PRECISION;
ALTER TABLE "live_class_presences" ADD COLUMN IF NOT EXISTS "meetEmail" TEXT;
ALTER TABLE "live_class_presences" ADD COLUMN IF NOT EXISTS "source" "LivePresenceSource" NOT NULL DEFAULT 'APP_HEARTBEAT';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "attendancePct" DOUBLE PRECISION;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "batch_schedules"
    ADD CONSTRAINT "batch_schedules_summaryUpdatedById_fkey"
    FOREIGN KEY ("summaryUpdatedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
