-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('OPEN', 'PLAN_READY', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "student_interventions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT,
    "riskSnapshotId" TEXT,
    "status" "InterventionStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_plans" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "weakSkills" TEXT[],
    "mentorActions" TEXT[],
    "trainerActions" TEXT[],
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_plan_tasks" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "recovery_plan_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_interventions_userId_status_idx" ON "student_interventions"("userId", "status");

-- CreateIndex
CREATE INDEX "student_interventions_status_createdAt_idx" ON "student_interventions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_plans_interventionId_key" ON "recovery_plans"("interventionId");

-- CreateIndex
CREATE INDEX "recovery_plan_tasks_planId_idx" ON "recovery_plan_tasks"("planId");

-- AddForeignKey
ALTER TABLE "student_interventions" ADD CONSTRAINT "student_interventions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "student_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plan_tasks" ADD CONSTRAINT "recovery_plan_tasks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "recovery_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

