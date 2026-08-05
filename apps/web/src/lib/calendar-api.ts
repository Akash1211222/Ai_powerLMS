import { apiRequest } from './api-client';

export type CalendarEventType =
  | 'LIVE_CLASS'
  | 'ASSIGNMENT_DUE'
  | 'ASSESSMENT_DUE'
  | 'MENTOR_SESSION'
  | 'WORKSHOP'
  | 'PERSONAL_TASK'
  | 'INTERVIEW';

export interface CalendarItem {
  id: string;
  type: CalendarEventType | string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  sourceType: string;
  sourceId: string;
  context: string | null;
  description: string | null;
  href: string | null;
}

export interface CreateCalendarEventInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  description?: string;
  type?: 'PERSONAL_TASK' | 'WORKSHOP';
  allDay?: boolean;
}

export interface UpdateCalendarEventInput {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  type?: 'PERSONAL_TASK' | 'WORKSHOP';
  allDay?: boolean;
}

export const calendarApi = {
  events: (from: string, to: string) =>
    apiRequest<CalendarItem[]>(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { auth: true },
    ),
  create: (input: CreateCalendarEventInput) =>
    apiRequest<CalendarItem>('/calendar/events', { method: 'POST', body: input, auth: true }),
  update: (id: string, input: UpdateCalendarEventInput) =>
    apiRequest<CalendarItem>(`/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  remove: (id: string) =>
    apiRequest<{ success: boolean }>(`/calendar/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),
};
