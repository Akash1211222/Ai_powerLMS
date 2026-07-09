import { z } from 'zod';

const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');

export const createCourseSchema = z.object({
  organizationId: z.string().min(1),
  programId: z.string().min(1).optional(),
  title: z.string().min(2).max(160).trim(),
  slug: slug.optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
});
export type CreateCourseDto = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  title: z.string().min(2).max(160).trim().optional(),
  summary: z.string().max(500).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  programId: z.string().min(1).nullable().optional(),
});
export type UpdateCourseDto = z.infer<typeof updateCourseSchema>;

export const listCoursesQuerySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

export const createModuleSchema = z.object({
  title: z.string().min(1).max(160).trim(),
  order: z.number().int().min(0).optional(),
});
export type CreateModuleDto = z.infer<typeof createModuleSchema>;

export const createLessonSchema = z.object({
  title: z.string().min(1).max(160).trim(),
  type: z.enum(['VIDEO', 'READING', 'QUIZ', 'ASSIGNMENT']).optional(),
  contentUrl: z.string().url().optional(),
  body: z.string().max(20000).optional(),
  durationSec: z.number().int().min(0).max(86400).optional(),
  order: z.number().int().min(0).optional(),
});
export type CreateLessonDto = z.infer<typeof createLessonSchema>;
