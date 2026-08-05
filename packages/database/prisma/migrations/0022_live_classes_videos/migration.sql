-- Live classes (Meet), presence/watch-time, streaks, lesson thumbnails

CREATE TYPE "LiveClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "MeetingProvider" AS ENUM ('GOOGLE_MEET', 'EXTERNAL');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LIVE_CLASS_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_REPORT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STREAK_MILESTONE';

ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;

ALTER TABLE "batch_schedules"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "meetingProvider" "MeetingProvider",
  ADD COLUMN IF NOT EXISTS "status" "LiveClassStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "batch_schedules"
  ADD CONSTRAINT "batch_schedules_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "batch_schedules_status_startsAt_idx" ON "batch_schedules"("status", "startsAt");

CREATE TABLE "live_class_presences" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "watchedSec" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_class_presences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_class_presences_scheduleId_studentId_key" ON "live_class_presences"("scheduleId", "studentId");
CREATE INDEX "live_class_presences_studentId_idx" ON "live_class_presences"("studentId");

ALTER TABLE "live_class_presences"
  ADD CONSTRAINT "live_class_presences_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "batch_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_class_presences"
  ADD CONSTRAINT "live_class_presences_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attendance_streaks" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "lastPresentOn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_streaks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_streaks_userId_key" ON "attendance_streaks"("userId");

ALTER TABLE "attendance_streaks"
  ADD CONSTRAINT "attendance_streaks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
