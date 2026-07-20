import { z } from 'zod';

const url = z.string().url().max(500);

export const updateProfileSchema = z.object({
  headline: z.string().max(160).trim().nullable().optional(),
  summary: z.string().max(2000).trim().nullable().optional(),
  location: z.string().max(160).trim().nullable().optional(),
  phone: z.string().max(40).trim().nullable().optional(),
  websiteUrl: url.nullable().optional(),
  linkedinUrl: url.nullable().optional(),
  githubUrl: url.nullable().optional(),
  resumeUrl: url.nullable().optional(),
  openToWork: z.boolean().optional(),
  visibility: z.enum(['PRIVATE', 'PLACEMENT', 'PUBLIC']).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const projectSchema = z.object({
  title: z.string().min(2).max(160).trim(),
  description: z.string().max(2000).trim().nullable().optional(),
  url: url.nullable().optional(),
  skills: z.array(z.string().min(1).max(60).trim()).max(20).optional(),
  order: z.number().int().min(0).max(1000).optional(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const experienceSchema = z
  .object({
    kind: z.enum(['WORK', 'EDUCATION', 'CERTIFICATION', 'VOLUNTEER']).optional(),
    title: z.string().min(2).max(160).trim(),
    organization: z.string().min(1).max(160).trim(),
    location: z.string().max(160).trim().nullable().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    current: z.boolean().optional(),
    description: z.string().max(2000).trim().nullable().optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => v.current || !v.endDate || v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export type ExperienceDto = z.infer<typeof experienceSchema>;
