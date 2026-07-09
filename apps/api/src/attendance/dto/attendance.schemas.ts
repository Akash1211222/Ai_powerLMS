import { z } from 'zod';

const attendanceStatus = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const createSessionSchema = z.object({
  batchId: z.string().min(1),
  title: z.string().min(1).max(160).trim(),
  sessionDate: z.coerce.date().optional(),
  scheduleId: z.string().min(1).optional(),
});
export type CreateSessionDto = z.infer<typeof createSessionSchema>;

export const markSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatus,
        note: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(1000),
});
export type MarkDto = z.infer<typeof markSchema>;

export const listSessionsQuerySchema = z.object({ batchId: z.string().min(1) });
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

export const correctionRequestSchema = z.object({
  requestedStatus: attendanceStatus,
  reason: z.string().min(3).max(500).trim(),
});
export type CorrectionRequestDto = z.infer<typeof correctionRequestSchema>;

export const reviewCorrectionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNote: z.string().max(500).optional(),
});
export type ReviewCorrectionDto = z.infer<typeof reviewCorrectionSchema>;

export const listCorrectionsQuerySchema = z.object({
  batchId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});
export type ListCorrectionsQuery = z.infer<typeof listCorrectionsQuerySchema>;
