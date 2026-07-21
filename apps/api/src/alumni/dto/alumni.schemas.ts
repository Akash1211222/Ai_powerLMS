import { z } from 'zod';

export const updateAlumniProfileSchema = z.object({
  graduationYear: z.number().int().min(1950).max(2100).nullable().optional(),
  currentCompany: z.string().max(160).trim().nullable().optional(),
  currentRole: z.string().max(160).trim().nullable().optional(),
  industry: z.string().max(120).trim().nullable().optional(),
  location: z.string().max(160).trim().nullable().optional(),
  story: z.string().max(4000).trim().nullable().optional(),
  linkedinUrl: z.string().url().max(500).nullable().optional(),
  isPublished: z.boolean().optional(),
  openToMentoring: z.boolean().optional(),
  openToReferrals: z.boolean().optional(),
});
export type UpdateAlumniProfileDto = z.infer<typeof updateAlumniProfileSchema>;
