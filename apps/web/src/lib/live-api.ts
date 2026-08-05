import { apiRequest } from './api-client';

export type LiveClassStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

export interface LiveClass {
  id: string;
  batchId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl: string | null;
  meetingProvider: 'GOOGLE_MEET' | 'EXTERNAL' | null;
  status: LiveClassStatus;
  batch?: { id: string; name: string; course?: { title: string } };
  _count?: { presences: number };
}

export interface AttendanceStreak {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastPresentOn: string | null;
}

export interface LiveReportRow {
  id: string;
  title: string;
  batch: { id: string; name: string; code: string };
  startsAt: string;
  endsAt: string;
  status: LiveClassStatus;
  meetingUrl: string | null;
  joinedCount: number;
  avgWatchPercent: number;
}

export const liveApi = {
  schedule: (input: {
    batchId: string;
    title: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    meetingUrl?: string;
  }) => apiRequest<LiveClass>('/live-classes', { method: 'POST', body: input, auth: true }),

  listForBatch: (batchId: string) =>
    apiRequest<LiveClass[]>(`/batches/${batchId}/live-classes`, { auth: true }),

  upcoming: () => apiRequest<LiveClass[]>('/live-classes/upcoming', { auth: true }),

  get: (id: string) => apiRequest<LiveClass & { presences: unknown[] }>(`/live-classes/${id}`, { auth: true }),

  join: (id: string) =>
    apiRequest<{ meetingUrl: string; presence: { id: string; watchedSec: number } }>(
      `/live-classes/${id}/join`,
      { method: 'POST', auth: true },
    ),

  heartbeat: (id: string, deltaSec = 30) =>
    apiRequest<{ watchedSec: number }>(`/live-classes/${id}/heartbeat`, {
      method: 'POST',
      body: { deltaSec },
      auth: true,
    }),

  leave: (id: string) =>
    apiRequest<{ success: boolean }>(`/live-classes/${id}/leave`, { method: 'POST', auth: true }),

  end: (id: string) =>
    apiRequest<{
      summary: {
        present: number;
        late: number;
        absent: number;
        avgWatchPercent: number;
        total: number;
      };
    }>(`/live-classes/${id}/end`, { method: 'POST', auth: true }),

  streak: () => apiRequest<AttendanceStreak>('/me/attendance-streak', { auth: true }),

  reports: (organizationId: string, batchId?: string) => {
    const q = new URLSearchParams({ organizationId });
    if (batchId) q.set('batchId', batchId);
    return apiRequest<LiveReportRow[]>(`/live-classes/reports?${q}`, { auth: true });
  },

  setLessonVideo: (
    lessonId: string,
    input: { contentUrl: string; thumbnailUrl?: string; durationSec?: number; title?: string },
  ) =>
    apiRequest(`/lessons/${lessonId}/video`, { method: 'PUT', body: input, auth: true }),

  trackProgress: (lessonId: string, input: { positionSec: number; watchedSec: number; completed?: boolean }) =>
    apiRequest(`/lessons/${lessonId}/progress`, { method: 'POST', body: input, auth: true }),
};
