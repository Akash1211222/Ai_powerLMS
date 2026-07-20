-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PRIVATE', 'PLACEMENT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ExperienceKind" AS ENUM ('WORK', 'EDUCATION', 'CERTIFICATION', 'VOLUNTEER');

-- CreateTable
CREATE TABLE "career_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "resumeUrl" TEXT,
    "openToWork" BOOLEAN NOT NULL DEFAULT true,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PLACEMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_projects" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "skills" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_experiences" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "ExperienceKind" NOT NULL DEFAULT 'WORK',
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "career_profiles_userId_key" ON "career_profiles"("userId");

-- CreateIndex
CREATE INDEX "career_projects_profileId_idx" ON "career_projects"("profileId");

-- CreateIndex
CREATE INDEX "career_experiences_profileId_idx" ON "career_experiences"("profileId");

-- AddForeignKey
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_projects" ADD CONSTRAINT "career_projects_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "career_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_experiences" ADD CONSTRAINT "career_experiences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "career_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

