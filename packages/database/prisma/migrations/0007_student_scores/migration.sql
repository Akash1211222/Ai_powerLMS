-- CreateTable
CREATE TABLE "student_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performanceScore" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "consistencyScore" INTEGER NOT NULL DEFAULT 0,
    "skillMasteryScore" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "components" JSONB,
    "calcVersion" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_scores_userId_key" ON "student_scores"("userId");

-- CreateIndex
CREATE INDEX "student_scores_overallScore_idx" ON "student_scores"("overallScore");

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

