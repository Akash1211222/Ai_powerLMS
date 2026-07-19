import { z } from 'zod';

/** Structured evidence given to the provider to build a recovery plan (§19). */
export interface RecoveryPlanInput {
  riskLevel: string;
  riskScore: number;
  factors: Array<{ code?: string; label: string; detail: string }>;
  weakSkills: Array<{ name: string; score: number }>;
  courseTitle?: string | null;
}

/**
 * Validated structured output (§3, §36). The plan is advisory content — the
 * numeric risk/skill data it responds to was computed deterministically and is
 * never invented by the model (§17).
 */
export const recoveryPlanOutputSchema = z.object({
  summary: z.string().min(10).max(2000),
  tasks: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        detail: z.string().max(500).optional().default(''),
      }),
    )
    .min(2)
    .max(8),
  mentorActions: z.array(z.string().max(300)).max(5).default([]),
  trainerActions: z.array(z.string().max(300)).max(5).default([]),
  followUpDays: z.number().int().min(3).max(30),
});

export type RecoveryPlanOutput = z.infer<typeof recoveryPlanOutputSchema>;
