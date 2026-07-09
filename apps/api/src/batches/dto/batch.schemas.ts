import { z } from 'zod';

export const createBatchSchema = z.object({
  organizationId: z.string().min(1),
  courseId: z.string().min(1),
  name: z.string().min(2).max(120).trim(),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and hyphens only')
    .optional(),
  capacity: z.number().int().min(1).max(10000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type CreateBatchDto = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = z.object({
  name: z.string().min(2).max(120).trim().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  capacity: z.number().int().min(1).max(10000).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
});
export type UpdateBatchDto = z.infer<typeof updateBatchSchema>;

export const listBatchesQuerySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;

export const addStudentSchema = z.object({ userId: z.string().min(1) });
export type AddStudentDto = z.infer<typeof addStudentSchema>;

export const assignTrainerSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['LEAD', 'ASSISTANT']).optional(),
});
export type AssignTrainerDto = z.infer<typeof assignTrainerSchema>;

export const addScheduleSchema = z
  .object({
    title: z.string().min(1).max(160).trim(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    location: z.string().max(200).optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type AddScheduleDto = z.infer<typeof addScheduleSchema>;
