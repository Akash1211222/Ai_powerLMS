-- Force a password change after an admin issues an account with the shared
-- role-default password (see apps/api/src/admin/member-passwords.ts).
--
-- Deliberately ONLY this column. `prisma migrate dev` also wanted to drop
-- job_applications, job_postings, mentorship_bookings, placement_profiles and
-- mentor_profiles.weeklyCapacity — pre-existing drift from Phase-2 tables that
-- later phases superseded but never dropped. They are empty in production, but
-- removing them is a separate decision, not a side effect of adding a flag.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
