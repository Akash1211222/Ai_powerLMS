-- CreateTable
CREATE TABLE "alumni_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "graduationYear" INTEGER,
    "currentCompany" TEXT,
    "currentRole" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "story" TEXT,
    "linkedinUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "openToMentoring" BOOLEAN NOT NULL DEFAULT false,
    "openToReferrals" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alumni_profiles_userId_key" ON "alumni_profiles"("userId");

-- CreateIndex
CREATE INDEX "alumni_profiles_currentCompany_idx" ON "alumni_profiles"("currentCompany");

-- CreateIndex
CREATE INDEX "alumni_profiles_industry_idx" ON "alumni_profiles"("industry");

-- AddForeignKey
ALTER TABLE "alumni_profiles" ADD CONSTRAINT "alumni_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

