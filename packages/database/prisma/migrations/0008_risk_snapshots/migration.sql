-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "student_risk_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT,
    "level" "RiskLevel" NOT NULL,
    "score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL,
    "recommendedActions" TEXT[],
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_risk_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_risk_snapshots_userId_detectedAt_idx" ON "student_risk_snapshots"("userId", "detectedAt");

-- CreateIndex
CREATE INDEX "student_risk_snapshots_batchId_level_idx" ON "student_risk_snapshots"("batchId", "level");

-- CreateIndex
CREATE INDEX "student_risk_snapshots_level_detectedAt_idx" ON "student_risk_snapshots"("level", "detectedAt");

-- AddForeignKey
ALTER TABLE "student_risk_snapshots" ADD CONSTRAINT "student_risk_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_snapshots" ADD CONSTRAINT "student_risk_snapshots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

