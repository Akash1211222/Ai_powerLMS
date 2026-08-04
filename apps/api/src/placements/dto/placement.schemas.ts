import { z } from 'zod';

export const createJobSchema = z.object({
  organizationId: z.string().min(1),
  companyName: z.string().min(1).max(160).trim(),
  title: z.string().min(2).max(160).trim(),
  description: z.string().max(10000).optional(),
  jobType: z.enum(['FULL_TIME', 'INTERNSHIP', 'CONTRACT', 'PART_TIME']).optional(),
  location: z.string().max(200).optional(),
  ctcMinLpa: z.number().min(0).max(500).optional(),
  ctcMaxLpa: z.number().min(0).max(500).optional(),
  skills: z.array(z.string().min(1).max(60)).max(30).optional(),
  eligibility: z.string().max(2000).optional(),
  deadline: z.coerce.date().optional(),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;

export const updateJobSchema = z.object({
  companyName: z.string().min(1).max(160).trim().optional(),
  title: z.string().min(2).max(160).trim().optional(),
  description: z.string().max(10000).nullable().optional(),
  jobType: z.enum(['FULL_TIME', 'INTERNSHIP', 'CONTRACT', 'PART_TIME']).optional(),
  location: z.string().max(200).nullable().optional(),
  ctcMinLpa: z.number().min(0).max(500).nullable().optional(),
  ctcMaxLpa: z.number().min(0).max(500).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(30).optional(),
  eligibility: z.string().max(2000).nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
});
export type UpdateJobDto = z.infer<typeof updateJobSchema>;

export const listJobsQuerySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const applyJobSchema = z.object({
  coverLetter: z.string().max(5000).optional(),
});
export type ApplyJobDto = z.infer<typeof applyJobSchema>;

export const updateApplicationSchema = z.object({
  status: z.enum(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'PLACED', 'REJECTED', 'WITHDRAWN']),
  note: z.string().max(1000).optional(),
});
export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;

export const updateProfileSchema = z.object({
  resumeUrl: z.string().url().max(500).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(40).optional(),
  preferredRoles: z.array(z.string().min(1).max(80)).max(20).optional(),
  preferredLocations: z.array(z.string().min(1).max(80)).max(20).optional(),
  expectedCtcLpa: z.number().min(0).max(500).nullable().optional(),
  status: z.enum(['LOOKING', 'INTERVIEWING', 'OFFERED', 'PLACED', 'NOT_LOOKING']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
