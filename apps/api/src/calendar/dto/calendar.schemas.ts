import { z } from 'zod';

export const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(160).trim(),
    description: z.string().max(2000).optional(),
    type: z.enum(['PERSONAL_TASK', 'WORKSHOP']).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    location: z.string().max(200).optional(),
  })
  .refine((v) => !v.endsAt || v.endsAt >= v.startsAt, {
    message: 'endsAt must be at or after startsAt',
    path: ['endsAt'],
  });
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(160).trim().optional(),
    description: z.string().max(2000).nullable().optional(),
    type: z.enum(['PERSONAL_TASK', 'WORKSHOP']).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    allDay: z.boolean().optional(),
    location: z.string().max(200).nullable().optional(),
  })
  .refine((v) => !v.endsAt || !v.startsAt || v.endsAt >= v.startsAt, {
    message: 'endsAt must be at or after startsAt',
    path: ['endsAt'],
  });
export type UpdateEventDto = z.infer<typeof updateEventSchema>;
