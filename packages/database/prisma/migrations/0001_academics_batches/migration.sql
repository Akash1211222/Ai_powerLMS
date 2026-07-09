-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'READING', 'QUIZ', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED');

-- CreateEnum
CREATE TYPE "LessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchStudentStatus" AS ENUM ('ACTIVE', 'REMOVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BatchTrainerRole" AS ENUM ('LEAD', 'ASSISTANT');

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'BEGINNER',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" "LessonType" NOT NULL DEFAULT 'VIDEO',
    "contentUrl" TEXT,
    "body" TEXT,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_resources" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_progress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "completedLessons" INTEGER NOT NULL DEFAULT 0,
    "totalLessons" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LessonProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastPositionSec" INTEGER NOT NULL DEFAULT 0,
    "watchedSec" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PLANNED',
    "capacity" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_students" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BatchStudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_trainers" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BatchTrainerRole" NOT NULL DEFAULT 'LEAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_schedules" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_announcements" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programs_organizationId_idx" ON "programs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "programs_organizationId_slug_key" ON "programs"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "courses_organizationId_status_idx" ON "courses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "courses_programId_idx" ON "courses"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_slug_key" ON "courses"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "course_modules_courseId_idx" ON "course_modules"("courseId");

-- CreateIndex
CREATE INDEX "lessons_moduleId_idx" ON "lessons"("moduleId");

-- CreateIndex
CREATE INDEX "learning_resources_lessonId_idx" ON "learning_resources"("lessonId");

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");

-- CreateIndex
CREATE INDEX "enrollments_batchId_idx" ON "enrollments"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_progress_enrollmentId_key" ON "course_progress"("enrollmentId");

-- CreateIndex
CREATE INDEX "lesson_progress_userId_idx" ON "lesson_progress"("userId");

-- CreateIndex
CREATE INDEX "lesson_progress_lessonId_idx" ON "lesson_progress"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_enrollmentId_lessonId_key" ON "lesson_progress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "batches_organizationId_status_idx" ON "batches"("organizationId", "status");

-- CreateIndex
CREATE INDEX "batches_courseId_idx" ON "batches"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "batches_organizationId_code_key" ON "batches"("organizationId", "code");

-- CreateIndex
CREATE INDEX "batch_students_userId_idx" ON "batch_students"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_batchId_userId_key" ON "batch_students"("batchId", "userId");

-- CreateIndex
CREATE INDEX "batch_trainers_userId_idx" ON "batch_trainers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_trainers_batchId_userId_key" ON "batch_trainers"("batchId", "userId");

-- CreateIndex
CREATE INDEX "batch_schedules_batchId_startsAt_idx" ON "batch_schedules"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "batch_announcements_batchId_createdAt_idx" ON "batch_announcements"("batchId", "createdAt");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainers" ADD CONSTRAINT "batch_trainers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_schedules" ADD CONSTRAINT "batch_schedules_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_announcements" ADD CONSTRAINT "batch_announcements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_announcements" ADD CONSTRAINT "batch_announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

