import { z } from 'zod';

const meetUrl = z
  .string()
  .trim()
  .min(1, 'Paste the Google Meet link for this class')
  .max(500)
  // Google Meet shows a link as "meet.google.com/abc-defg-hij" — no scheme —
  // and that is what trainers copy. Requiring z.string().url() rejected the
  // exact string Meet puts in front of them, with no hint as to why. Add the
  // scheme instead of refusing the paste.
  .transform((u) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`))
  .refine(
    (u) => {
      try {
        const { hostname, protocol } = new URL(u);
        if (protocol !== 'https:' && protocol !== 'http:') return false;
        return hostname === 'meet.google.com' || hostname.endsWith('.meet.google.com');
      } catch {
        return false;
      }
    },
    { message: 'Enter a Google Meet link, for example meet.google.com/abc-defg-hij' },
  );

export const scheduleLiveClassSchema = z
  .object({
    batchId: z.string().min(1),
    title: z.string().min(2).max(160).trim(),
    description: z.string().max(2000).trim().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    /** Required — paste the real Google Meet link created by the trainer. */
    meetingUrl: meetUrl,
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

export const liveNotesQuerySchema = z.object({
  courseId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
});
export type LiveNotesQuery = z.infer<typeof liveNotesQuerySchema>;

const qaItemSchema = z.object({
  question: z.string().min(1).max(500).trim(),
  answer: z.string().max(2000).trim().optional(),
});

export const updateLiveSummarySchema = z.object({
  summary: z.string().max(20_000).trim().optional().nullable(),
  keyPoints: z.array(z.string().min(1).max(400).trim()).max(40).optional().nullable(),
  homework: z.string().max(5000).trim().optional().nullable(),
  qaItems: z.array(qaItemSchema).max(40).optional().nullable(),
});
export type UpdateLiveSummaryDto = z.infer<typeof updateLiveSummarySchema>;

export const importMeetAttendanceSchema = z.object({
  /** Raw CSV text from Google Meet attendance report. */
  csv: z.string().min(10).max(2_000_000),
  /** When true, mark class ENDED and close attendance session. Default true. */
  endClass: z.boolean().optional().default(true),
});
export type ImportMeetAttendanceDto = z.infer<typeof importMeetAttendanceSchema>;

export const updateGoogleEmailSchema = z.object({
  googleEmail: z
    .string()
    .email()
    .max(320)
    .transform((e) => e.toLowerCase())
    .nullable()
    .optional(),
});
export type UpdateGoogleEmailDto = z.infer<typeof updateGoogleEmailSchema>;
