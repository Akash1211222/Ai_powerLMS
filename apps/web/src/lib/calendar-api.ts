import { apiRequest } from './api-client';

export interface CalendarItem {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  sourceType: string;
  sourceId: string;
  context: string | null;
}

export const calendarApi = {
  events: (from: string, to: string) =>
    apiRequest<CalendarItem[]>(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { auth: true },
    ),
  create: (input: { title: string; startsAt: string; endsAt?: string; location?: string }) =>
    apiRequest<CalendarItem>('/calendar/events', { method: 'POST', body: input, auth: true }),
};
