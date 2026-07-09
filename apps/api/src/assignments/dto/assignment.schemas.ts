import { z } from 'zod';

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

export const listAssignmentsQuerySchema = z.object({ batchId: z.string().min(1) });
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

export const submitSchema = z
  .object({
    contentText: z.string().max(20000).optional(),
    repoUrl: z.string().url().max(500).optional(),
  })
  .refine((v) => Boolean(v.contentText?.trim() || v.repoUrl), {
    message: 'Provide submission text or a repository URL',
    path: ['contentText'],
  });
export type SubmitDto = z.infer<typeof submitSchema>;

export const reviewEvaluationSchema = z.object({
  trainerScore: z.number().int().min(0).max(1000),
  release: z.boolean().default(true),
  reason: z.string().max(2000).optional(),
});
export type ReviewEvaluationDto = z.infer<typeof reviewEvaluationSchema>;
