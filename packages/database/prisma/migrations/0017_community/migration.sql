-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "community_questions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_answers" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_answer_votes" (
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_answer_votes_pkey" PRIMARY KEY ("answerId","userId")
);

-- CreateIndex
CREATE INDEX "community_questions_organizationId_status_idx" ON "community_questions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "community_questions_organizationId_createdAt_idx" ON "community_questions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "community_answers_questionId_idx" ON "community_answers"("questionId");

-- CreateIndex
CREATE INDEX "community_answers_authorId_idx" ON "community_answers"("authorId");

-- CreateIndex
CREATE INDEX "community_answer_votes_userId_idx" ON "community_answer_votes"("userId");

-- AddForeignKey
ALTER TABLE "community_questions" ADD CONSTRAINT "community_questions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_questions" ADD CONSTRAINT "community_questions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answers" ADD CONSTRAINT "community_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answers" ADD CONSTRAINT "community_answers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answer_votes" ADD CONSTRAINT "community_answer_votes_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "community_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answer_votes" ADD CONSTRAINT "community_answer_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

