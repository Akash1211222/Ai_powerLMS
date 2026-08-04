import { z } from 'zod';

const TYPES = ['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT'] as const;
const MODES = ['ONSITE', 'REMOTE', 'HYBRID'] as const;

export const createOpportunitySchema = z
  .object({
    organizationId: z.string().min(1),
    title: z.string().min(2).max(160).trim(),
    companyName: z.string().min(1).max(160).trim(),
    location: z.string().max(160).trim().nullable().optional(),
    type: z.enum(TYPES).optional(),
    workMode: z.enum(MODES).optional(),
    description: z.string().min(10).max(8000).trim(),
    requirements: z.array(z.string().min(1).max(60).trim()).max(30).optional(),
    minReadiness: z.number().int().min(0).max(100).nullable().optional(),
    openings: z.number().int().min(1).max(100000).nullable().optional(),
    salaryMin: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    applyUrl: z.string().url().max(500).nullable().optional(),
    deadline: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMax >= v.salaryMin, {
    message: 'salaryMax must be >= salaryMin',
    path: ['salaryMax'],
  });
export type CreateOpportunityDto = z.infer<typeof createOpportunitySchema>;

// Update: everything except organizationId, all optional.
export const updateOpportunitySchema = z
  .object({
    title: z.string().min(2).max(160).trim().optional(),
    companyName: z.string().min(1).max(160).trim().optional(),
    location: z.string().max(160).trim().nullable().optional(),
    type: z.enum(TYPES).optional(),
    workMode: z.enum(MODES).optional(),
    description: z.string().min(10).max(8000).trim().optional(),
    requirements: z.array(z.string().min(1).max(60).trim()).max(30).optional(),
    minReadiness: z.number().int().min(0).max(100).nullable().optional(),
    openings: z.number().int().min(1).max(100000).nullable().optional(),
    salaryMin: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    applyUrl: z.string().url().max(500).nullable().optional(),
    deadline: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMax >= v.salaryMin, {
    message: 'salaryMax must be >= salaryMin',
    path: ['salaryMax'],
  });
export type UpdateOpportunityDto = z.infer<typeof updateOpportunitySchema>;

export const listOpportunitiesQuerySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;
