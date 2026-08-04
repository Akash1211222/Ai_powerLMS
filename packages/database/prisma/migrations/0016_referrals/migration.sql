-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'DECLINED');

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referrals_studentId_status_idx" ON "referrals"("studentId", "status");

-- CreateIndex
CREATE INDEX "referrals_opportunityId_status_idx" ON "referrals"("opportunityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_opportunityId_studentId_referrerId_key" ON "referrals"("opportunityId", "studentId", "referrerId");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

