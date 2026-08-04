-- Placement job board (alongside existing opportunities/applications tables).
-- Uses distinct enum names to avoid clashing with ApplicationStatus / OpportunityType.

CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'CONTRACT', 'PART_TIME');
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "JobApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'PLACED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "StudentPlacementStatus" AS ENUM ('LOOKING', 'INTERVIEWING', 'OFFERED', 'PLACED', 'NOT_LOOKING');

CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "location" TEXT,
    "ctcMinLpa" DOUBLE PRECISION,
    "ctcMaxLpa" DOUBLE PRECISION,
    "skills" TEXT[],
    "eligibility" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "coverLetter" TEXT,
    "matchScore" INTEGER,
    "matchReason" TEXT,
    "statusNote" TEXT,
    "statusHistory" JSONB,
    "updatedById" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "placement_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeUrl" TEXT,
    "headline" TEXT,
    "skills" TEXT[],
    "preferredRoles" TEXT[],
    "preferredLocations" TEXT[],
    "expectedCtcLpa" DOUBLE PRECISION,
    "status" "StudentPlacementStatus" NOT NULL DEFAULT 'LOOKING',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "placement_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_postings_organizationId_status_idx" ON "job_postings"("organizationId", "status");
CREATE INDEX "job_postings_deadline_idx" ON "job_postings"("deadline");
CREATE INDEX "job_applications_studentId_status_idx" ON "job_applications"("studentId", "status");
CREATE INDEX "job_applications_jobPostingId_status_idx" ON "job_applications"("jobPostingId", "status");
CREATE UNIQUE INDEX "job_applications_jobPostingId_studentId_key" ON "job_applications"("jobPostingId", "studentId");
CREATE UNIQUE INDEX "placement_profiles_userId_key" ON "placement_profiles"("userId");

ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "placement_profiles" ADD CONSTRAINT "placement_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
