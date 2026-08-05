import { z } from 'zod';

export const updateMentorProfileSchema = z.object({
  headline: z.string().max(160).trim().nullable().optional(),
  bio: z.string().max(2000).trim().nullable().optional(),
  expertise: z.array(z.string().min(1).max(60).trim()).max(20).optional(),
  isAcceptingBookings: z.boolean().optional(),
});
export type UpdateMentorProfileDto = z.infer<typeof updateMentorProfileSchema>;

export const createSlotSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine((v) => v.startsAt.getTime() > Date.now(), {
    message: 'Slots must start in the future',
    path: ['startsAt'],
  });
export type CreateSlotDto = z.infer<typeof createSlotSchema>;

export const bookSchema = z.object({
  topic: z.string().min(3).max(200).trim(),
  note: z.string().max(2000).trim().optional(),
});
export type BookDto = z.infer<typeof bookSchema>;

export const completeSchema = z.object({
  mentorNotes: z.string().max(2000).trim().optional(),
  status: z.enum(['COMPLETED', 'NO_SHOW']).optional(),
});
export type CompleteDto = z.infer<typeof completeSchema>;

export const createMentorRequestSchema = z.object({
  topic: z.string().min(3).max(200).trim(),
  detail: z.string().min(10).max(4000).trim(),
  preferredExpertise: z.string().max(120).trim().optional(),
});
export type CreateMentorRequestDto = z.infer<typeof createMentorRequestSchema>;

export const arrangeMentorRequestSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    mentorNote: z.string().max(2000).trim().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine((v) => v.startsAt.getTime() > Date.now() - 60_000, {
    message: 'Call must start in the future',
    path: ['startsAt'],
  });
export type ArrangeMentorRequestDto = z.infer<typeof arrangeMentorRequestSchema>;
