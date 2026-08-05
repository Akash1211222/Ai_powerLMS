import { z } from 'zod';

export const scheduleLiveClassSchema = z
  .object({
    batchId: z.string().min(1),
    title: z.string().min(2).max(160).trim(),
    description: z.string().max(2000).trim().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    /** Optional override; if omitted a Google Meet link is auto-generated. */
    meetingUrl: z.string().url().max(500).optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine((v) => v.startsAt.getTime() > Date.now() - 5 * 60_000, {
    message: 'startsAt should be now or in the future',
    path: ['startsAt'],
  });
export type ScheduleLiveClassDto = z.infer<typeof scheduleLiveClassSchema>;

export const heartbeatSchema = z.object({
  /** Seconds of continuous presence since last heartbeat (clamped server-side). */
  deltaSec: z.number().int().min(1).max(120).default(30),
});
export type HeartbeatDto = z.infer<typeof heartbeatSchema>;

export const setLessonVideoSchema = z.object({
  contentUrl: z.string().url().max(2000),
  thumbnailUrl: z.string().url().max(2000).optional(),
  durationSec: z.number().int().min(1).max(86_400).optional(),
  title: z.string().min(1).max(160).trim().optional(),
});
export type SetLessonVideoDto = z.infer<typeof setLessonVideoSchema>;

export const lessonProgressSchema = z.object({
  positionSec: z.number().int().min(0).max(86_400),
  watchedSec: z.number().int().min(0).max(86_400),
  completed: z.boolean().optional(),
});
export type LessonProgressDto = z.infer<typeof lessonProgressSchema>;

export const liveReportQuerySchema = z.object({
  organizationId: z.string().min(1),
  batchId: z.string().min(1).optional(),
});
export type LiveReportQuery = z.infer<typeof liveReportQuerySchema>;
