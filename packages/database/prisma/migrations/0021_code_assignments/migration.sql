-- Code assignments: per-language in-browser compiler support + AI generation flag
CREATE TYPE "CodeLanguage" AS ENUM ('NONE', 'PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP', 'SQL', 'WEB');

ALTER TABLE "assignments" ADD COLUMN "language" "CodeLanguage" NOT NULL DEFAULT 'NONE';
ALTER TABLE "assignments" ADD COLUMN "starterCode" TEXT;
ALTER TABLE "assignments" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "assignment_submissions" ADD COLUMN "codeOutput" TEXT;
