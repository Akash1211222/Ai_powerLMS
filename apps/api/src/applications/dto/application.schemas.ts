import { z } from 'zod';

export const applySchema = z.object({
  coverNote: z.string().max(2000).trim().optional(),
});
export type ApplyDto = z.infer<typeof applySchema>;

// Statuses a reviewer may set (not APPLIED, not WITHDRAWN — those are implicit
// or student-driven).
export const updateStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED']),
  decisionNote: z.string().max(2000).trim().optional(),
});
export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;
