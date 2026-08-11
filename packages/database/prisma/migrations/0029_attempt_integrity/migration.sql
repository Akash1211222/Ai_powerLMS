-- Integrity signals on a quiz attempt.
--
-- Additive only, and hand-written for the same reason as 0028: `prisma
-- migrate diff` against this schema still proposes dropping job_postings,
-- job_applications, placement_profiles and mentorship_bookings, which exist
-- in the database but were removed from schema.prisma earlier without a drop
-- migration. That drift is not resolved here.

-- AlterTable
ALTER TABLE "assessment_attempts"
  ADD COLUMN "blurCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pasteCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "awayMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;
