import { z } from 'zod';

export const askSchema = z.object({
  title: z.string().min(10).max(200).trim(),
  body: z.string().min(20).max(10000).trim(),
  tags: z.array(z.string().min(1).max(40).trim().toLowerCase()).max(5).optional(),
});
export type AskDto = z.infer<typeof askSchema>;

export const answerSchema = z.object({
  body: z.string().min(10).max(10000).trim(),
});
export type AnswerDto = z.infer<typeof answerSchema>;

export const listQuestionsQuerySchema = z.object({
  tag: z.string().max(40).trim().toLowerCase().optional(),
  status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
