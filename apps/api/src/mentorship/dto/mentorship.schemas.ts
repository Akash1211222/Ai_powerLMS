import { z } from 'zod';

export const updateMentorProfileSchema = z.object({
  headline: z.string().max(120).optional(),
  bio: z.string().max(2000).optional(),
  expertise: z.array(z.string().min(1).max(40)).max(20).optional(),
  weeklyCapacity: z.number().int().min(1).max(50).optional(),
  isAcceptingBookings: z.boolean().optional(),
});
export type UpdateMentorProfileDto = z.infer<typeof updateMentorProfileSchema>;

export const createBookingSchema = z.object({
  mentorId: z.string().min(1),
  topic: z.string().min(3).max(200),
  note: z.string().max(2000).optional(),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(120).default(30),
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  action: z.enum(['CONFIRM', 'DECLINE', 'COMPLETE', 'CANCEL', 'RATE']),
  meetingUrl: z.string().url().max(500).optional(),
  outcomeNote: z.string().max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
export type UpdateBookingDto = z.infer<typeof updateBookingSchema>;
