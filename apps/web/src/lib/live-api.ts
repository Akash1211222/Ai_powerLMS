import { apiRequest } from './api-client';

export type LiveClassStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

export interface LiveQaItem {
  question: string;
  answer?: string;
}

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
  summary?: string | null;
  keyPoints?: string[] | null;
  homework?: string | null;
  qaItems?: LiveQaItem[] | null;
  summaryUpdatedAt?: string | null;
  batch?: { id: string; name: string; course?: { id?: string; title: string } };
  _count?: { presences: number };
}

export interface LivePresence {
  id: string;
  studentId: string;
  joinedAt: string;
  leftAt: string | null;
  watchedSec: number;
  attendedSec: number;
  attendancePct: number | null;
  meetEmail: string | null;
  source: 'APP_HEARTBEAT' | 'MEET_IMPORT';
  student: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
  };
}

export interface LiveSessionNote {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: LiveClassStatus;
  summary: string | null;
  keyPoints: string[] | null;
  homework: string | null;
  qaItems: LiveQaItem[] | null;
  summaryUpdatedAt: string | null;
  batch: { id: string; name: string; courseId: string; course: { title: string } };
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
  hasSummary?: boolean;
}

export const liveApi = {
  schedule: (input: {
    batchId: string;
    title: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    meetingUrl: string;
  }) => apiRequest<LiveClass>('/live-classes', { method: 'POST', body: input, auth: true }),

  listForBatch: (batchId: string) =>
    apiRequest<LiveClass[]>(`/batches/${batchId}/live-classes`, { auth: true }),

  upcoming: () => apiRequest<LiveClass[]>('/live-classes/upcoming', { auth: true }),

  notes: (query: { courseId?: string; batchId?: string }) => {
    const q = new URLSearchParams();
    if (query.courseId) q.set('courseId', query.courseId);
    if (query.batchId) q.set('batchId', query.batchId);
    return apiRequest<LiveSessionNote[]>(`/live-classes/notes?${q}`, { auth: true });
  },

  get: (id: string) =>
    apiRequest<LiveClass & { presences: LivePresence[] }>(`/live-classes/${id}`, { auth: true }),

  updateSummary: (
    id: string,
    input: {
      summary?: string | null;
      keyPoints?: string[] | null;
      homework?: string | null;
      qaItems?: LiveQaItem[] | null;
    },
  ) => apiRequest<LiveClass>(`/live-classes/${id}/summary`, { method: 'PATCH', body: input, auth: true }),

  importAttendance: (id: string, csv: string, endClass = true) =>
    apiRequest<{
      summary: {
        present: number;
        late: number;
        absent: number;
        matched: number;
        unmatched: number;
        avgWatchPercent: number;
        total: number;
      };
      matched: Array<{ studentId: string; email: string; attendancePct: number; status: string }>;
      unmatched: Array<{ email: string; durationSec: number }>;
    }>(`/live-classes/${id}/attendance/import`, {
      method: 'POST',
      body: { csv, endClass },
      auth: true,
    }),

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

  setGoogleEmail: (googleEmail: string | null) =>
    apiRequest<{ id: string; email: string; googleEmail: string | null }>('/me/google-email', {
      method: 'PATCH',
      body: { googleEmail },
      auth: true,
    }),

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
