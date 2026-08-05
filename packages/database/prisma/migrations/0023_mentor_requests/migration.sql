-- Mentor topic/doubt requests + arrange-a-call Meet links

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTOR_REQUEST';

ALTER TABLE "mentor_bookings" ADD COLUMN IF NOT EXISTS "meetUrl" TEXT;

CREATE TYPE "MentorRequestStatus" AS ENUM ('OPEN', 'SCHEDULED', 'CLOSED', 'CANCELLED');

CREATE TABLE "mentor_requests" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "preferredExpertise" TEXT,
  "status" "MentorRequestStatus" NOT NULL DEFAULT 'OPEN',
  "mentorId" TEXT,
  "bookingId" TEXT,
  "meetUrl" TEXT,
  "mentorNote" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentor_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mentor_requests_bookingId_key" ON "mentor_requests"("bookingId");
CREATE INDEX "mentor_requests_organizationId_status_createdAt_idx" ON "mentor_requests"("organizationId", "status", "createdAt");
CREATE INDEX "mentor_requests_studentId_status_idx" ON "mentor_requests"("studentId", "status");
CREATE INDEX "mentor_requests_mentorId_status_idx" ON "mentor_requests"("mentorId", "status");

ALTER TABLE "mentor_requests"
  ADD CONSTRAINT "mentor_requests_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentor_requests"
  ADD CONSTRAINT "mentor_requests_mentorId_fkey"
  FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mentor_requests"
  ADD CONSTRAINT "mentor_requests_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "mentor_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
