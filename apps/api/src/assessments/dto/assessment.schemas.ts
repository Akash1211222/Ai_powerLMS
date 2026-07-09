import { z } from 'zod';

const questionType = z.enum([
  'MCQ',
  'MULTI_SELECT',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'CODING',
  'SQL',
  'CASE_STUDY',
  'FILE_TASK',
]);

export const createAssessmentSchema = z.object({
  batchId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  title: z.string().min(2).max(160).trim(),
  description: z.string().max(2000).optional(),
  timeLimitMin: z.number().int().min(1).max(600).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  shuffleQuestions: z.boolean().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  dueAt: z.coerce.date().optional(),
  questions: z
    .array(
      z.object({
        type: questionType,
        prompt: z.string().min(1).max(4000).trim(),
        topic: z.string().max(80).optional(),
        skillTag: z.string().max(80).optional(),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
        points: z.number().int().min(1).max(100).optional(),
        correctText: z.string().max(500).optional(),
        explanation: z.string().max(1000).optional(),
        options: z
          .array(z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean().optional() }))
          .max(10)
          .optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type CreateAssessmentDto = z.infer<typeof createAssessmentSchema>;

export const listAssessmentsQuerySchema = z.object({ batchId: z.string().min(1) });
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;

export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIds: z.array(z.string().min(1)).max(10).optional(),
        textAnswer: z.string().max(20000).optional(),
      }),
    )
    .max(500),
});
export type SubmitAttemptDto = z.infer<typeof submitAttemptSchema>;
