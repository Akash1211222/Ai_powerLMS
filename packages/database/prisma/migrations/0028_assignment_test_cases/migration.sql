-- Assignment test cases + per-submission results.
--
-- Written by hand rather than generated. `prisma migrate diff` against this
-- schema also proposes dropping job_postings, job_applications,
-- placement_profiles and mentorship_bookings: those tables exist in the
-- database but were removed from schema.prisma earlier without a drop
-- migration. That drift predates this change and is not ours to resolve
-- here, so this migration touches only the two new tables.

-- CreateTable
CREATE TABLE "assignment_test_cases" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "stdin" TEXT NOT NULL DEFAULT '',
    "expectedOutput" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_test_results" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "actualOutput" TEXT NOT NULL,
    "stderr" TEXT,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_test_cases_assignmentId_idx" ON "assignment_test_cases"("assignmentId");

-- CreateIndex
CREATE INDEX "submission_test_results_submissionId_idx" ON "submission_test_results"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_test_results_submissionId_testCaseId_key" ON "submission_test_results"("submissionId", "testCaseId");

-- AddForeignKey
ALTER TABLE "assignment_test_cases" ADD CONSTRAINT "assignment_test_cases_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_test_results" ADD CONSTRAINT "submission_test_results_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_test_results" ADD CONSTRAINT "submission_test_results_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "assignment_test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
