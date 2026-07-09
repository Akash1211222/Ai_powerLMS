-- CreateEnum
CREATE TYPE "AssignmentDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'RETURNED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'AI_COMPLETED', 'NEEDS_REVIEW', 'RELEASED');

-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('ASSIGNMENT_EVALUATION', 'QUESTION_GENERATION', 'PROGRESS_REPORT', 'RECOVERY_PLAN');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "courseId" TEXT,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "difficulty" "AssignmentDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "dueAt" TIMESTAMP(3),
    "allowLate" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "aiEvaluationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "contentText" TEXT,
    "repoUrl" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_evaluations" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "aiScore" INTEGER,
    "trainerScore" INTEGER,
    "finalScore" INTEGER,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evaluatedByAi" BOOLEAN NOT NULL DEFAULT false,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_criterion_scores" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "evaluation_criterion_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL,
    "type" "AIJobType" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputRef" TEXT,
    "output" JSONB,
    "error" TEXT,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignments_batchId_status_idx" ON "assignments"("batchId", "status");

-- CreateIndex
CREATE INDEX "rubric_criteria_assignmentId_idx" ON "rubric_criteria"("assignmentId");

-- CreateIndex
CREATE INDEX "assignment_submissions_studentId_idx" ON "assignment_submissions"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignmentId_studentId_attemptNumber_key" ON "assignment_submissions"("assignmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "submission_attachments_submissionId_idx" ON "submission_attachments"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_evaluations_submissionId_key" ON "assignment_evaluations"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_criterion_scores_evaluationId_criterionId_key" ON "evaluation_criterion_scores"("evaluationId", "criterionId");

-- CreateIndex
CREATE INDEX "ai_jobs_type_status_idx" ON "ai_jobs"("type", "status");

-- CreateIndex
CREATE INDEX "ai_jobs_inputRef_idx" ON "ai_jobs"("inputRef");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_evaluations" ADD CONSTRAINT "assignment_evaluations_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_evaluations" ADD CONSTRAINT "assignment_evaluations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criterion_scores" ADD CONSTRAINT "evaluation_criterion_scores_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "assignment_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_criterion_scores" ADD CONSTRAINT "evaluation_criterion_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "rubric_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

