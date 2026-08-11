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

/**
 * Edits to a draft quiz. Everything is optional so a trainer can fix one
 * prompt without resending the paper.
 *
 * `questions`, when present, replaces the whole set rather than patching
 * individual rows. A trainer reviewing AI output reorders, deletes and rewrites
 * in one pass, and a wholesale replace is far easier to reason about than a
 * diff — safe here because the service refuses to edit anything that has been
 * published or attempted.
 */
export const updateAssessmentSchema = createAssessmentSchema
  .omit({ batchId: true, courseId: true, questions: true })
  .partial()
  .extend({
    questions: createAssessmentSchema.shape.questions.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateAssessmentDto = z.infer<typeof updateAssessmentSchema>;

export const aiGenerateAssessmentSchema = z.object({
  batchId: z.string().min(1),
  topicHint: z.string().max(200).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  questionCount: z.number().int().min(3).max(15).optional(),
  // No `publish`. A generated quiz is always a draft until a trainer has read
  // the questions and the marked answers.
});
export type AiGenerateAssessmentDto = z.infer<typeof aiGenerateAssessmentSchema>;

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

/**
 * Integrity signals reported by the student's browser during an attempt.
 *
 * Counts are cumulative deltas, applied with an increment so a dropped or
 * duplicated report degrades gracefully rather than resetting the total.
 */
export const attemptIntegritySchema = z
  .object({
    blur: z.number().int().min(0).max(500).optional(),
    paste: z.number().int().min(0).max(500).optional(),
    awayMs: z.number().int().min(0).max(86_400_000).optional(),
  })
  .refine((v) => v.blur || v.paste || v.awayMs, { message: 'Nothing to report' });
export type AttemptIntegrityDto = z.infer<typeof attemptIntegritySchema>;
