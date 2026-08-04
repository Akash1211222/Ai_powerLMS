-- CreateEnum
CREATE TYPE "MentorshipBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'CANCELLED');

-- AlterTable: "mentor_profiles" already exists from an earlier phase; this
-- release adds the weekly capacity setting to it.
ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "weeklyCapacity" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "mentorship_bookings" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "note" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status" "MentorshipBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "meetingUrl" TEXT,
    "outcomeNote" TEXT,
    "rating" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentorship_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentorship_bookings_mentorId_status_scheduledAt_idx" ON "mentorship_bookings"("mentorId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "mentorship_bookings_studentId_status_scheduledAt_idx" ON "mentorship_bookings"("studentId", "status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "mentorship_bookings" ADD CONSTRAINT "mentorship_bookings_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_bookings" ADD CONSTRAINT "mentorship_bookings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
