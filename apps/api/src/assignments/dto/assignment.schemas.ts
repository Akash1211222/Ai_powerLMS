import { z } from 'zod';

export const codeLanguageSchema = z.enum([
  'NONE',
  'PYTHON',
  'JAVASCRIPT',
  'TYPESCRIPT',
  'JAVA',
  'C',
  'CPP',
  'SQL',
  'WEB',
]);

export const createAssignmentSchema = z.object({
  batchId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  moduleId: z.string().min(1).optional(),
  title: z.string().min(2).max(160).trim(),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(5000).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  dueAt: z.coerce.date().optional(),
  allowLate: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  aiEvaluationEnabled: z.boolean().optional(),
  language: codeLanguageSchema.optional(),
  starterCode: z.string().max(50000).nullable().optional(),
  aiGenerated: z.boolean().optional(),
  publish: z.boolean().optional(),
  criteria: z
    .array(
      z.object({
        title: z.string().min(1).max(160).trim(),
        description: z.string().max(500).optional(),
        weight: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(20),
});
export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;

export const aiGenerateAssignmentSchema = z.object({
  batchId: z.string().min(1),
  topicHint: z.string().min(2).max(200).trim(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  languageHint: z
    .enum(['NONE', 'PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP', 'SQL', 'WEB'])
    .optional(),
  // No `publish` here on purpose. AI drafts the work; a trainer reads it and
  // publishes it. Leaving the flag in place — even defaulting to false — would
  // keep a one-parameter route from model output straight to every student.
});
export type AiGenerateAssignmentDto = z.infer<typeof aiGenerateAssignmentSchema>;

export const listAssignmentsQuerySchema = z.object({ batchId: z.string().min(1) });
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

export const submitSchema = z
  .object({
    contentText: z.string().max(100000).optional(),
    codeOutput: z.string().max(50000).optional(),
    repoUrl: z.string().url().max(500).optional(),
  })
  .refine((v) => Boolean(v.contentText?.trim() || v.repoUrl), {
    message: 'Provide source code / submission text or a repository URL',
    path: ['contentText'],
  });
export type SubmitDto = z.infer<typeof submitSchema>;

export const reviewEvaluationSchema = z.object({
  trainerScore: z.number().int().min(0).max(1000),
  release: z.boolean().default(true),
  reason: z.string().max(2000).optional(),
});
export type ReviewEvaluationDto = z.infer<typeof reviewEvaluationSchema>;
