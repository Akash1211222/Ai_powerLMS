import { apiRequest } from './api-client';

export interface MentorCard {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  weeklyCapacity: number;
  isAcceptingBookings: boolean;
  confirmedThisWeek: number;
}

export interface MentorProfile {
  id: string;
  userId: string;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  weeklyCapacity: number;
  isAcceptingBookings: boolean;
}

export interface BookingParty {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string } | null;
}

export interface Booking {
  id: string;
  mentorId: string;
  studentId: string;
  topic: string;
  note: string | null;
  scheduledAt: string;
  durationMin: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';
  meetingUrl: string | null;
  outcomeNote: string | null;
  rating: number | null;
  mentor: BookingParty;
  student: BookingParty;
}

export const mentorshipApi = {
  mentors: (organizationId: string) =>
    apiRequest<MentorCard[]>(
      `/mentorship/mentors?organizationId=${encodeURIComponent(organizationId)}`,
      { auth: true },
    ),
  myProfile: () => apiRequest<MentorProfile | null>('/mentorship/profile', { auth: true }),
  updateProfile: (input: {
    headline?: string;
    bio?: string;
    expertise?: string[];
    weeklyCapacity?: number;
    isAcceptingBookings?: boolean;
  }) => apiRequest<MentorProfile>('/mentorship/profile', { method: 'PATCH', body: input, auth: true }),
  book: (input: {
    mentorId: string;
    topic: string;
    note?: string;
    scheduledAt: string;
    durationMin?: number;
  }) => apiRequest<Booking>('/mentorship/bookings', { method: 'POST', body: input, auth: true }),
  myBookings: () =>
    apiRequest<{ asMentor: Booking[]; asStudent: Booking[] }>('/mentorship/bookings', {
      auth: true,
    }),
  update: (
    id: string,
    input: {
      action: 'CONFIRM' | 'DECLINE' | 'COMPLETE' | 'CANCEL' | 'RATE';
      meetingUrl?: string;
      outcomeNote?: string;
      rating?: number;
    },
  ) => apiRequest<Booking>(`/mentorship/bookings/${id}`, { method: 'PATCH', body: input, auth: true }),
};
