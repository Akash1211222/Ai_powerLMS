import { z } from 'zod';

// Referrers know the person, not their user id — so email is the primary key
// into the network. Either identifier is accepted.
export const createReferralSchema = z
  .object({
    studentId: z.string().min(1).optional(),
    studentEmail: z.string().email().toLowerCase().trim().optional(),
    note: z.string().min(10).max(2000).trim(),
  })
  .refine((v) => Boolean(v.studentId || v.studentEmail), {
    message: 'Provide a studentId or studentEmail',
    path: ['studentEmail'],
  });
export type CreateReferralDto = z.infer<typeof createReferralSchema>;

export const reviewReferralSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'DECLINED']),
});
export type ReviewReferralDto = z.infer<typeof reviewReferralSchema>;
