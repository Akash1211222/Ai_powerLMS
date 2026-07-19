-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROGRESS_REPORT';

-- CreateTable
CREATE TABLE "weekly_progress_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "achievements" TEXT[],
    "improvements" TEXT[],
    "weakAreas" TEXT[],
    "nextWeekGoals" TEXT[],
    "trainerNote" TEXT,
    "mentorNote" TEXT,
    "metrics" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_progress_reports_userId_periodStart_idx" ON "weekly_progress_reports"("userId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_progress_reports_userId_periodStart_key" ON "weekly_progress_reports"("userId", "periodStart");

-- AddForeignKey
ALTER TABLE "weekly_progress_reports" ADD CONSTRAINT "weekly_progress_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

