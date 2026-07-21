import { apiRequest } from './api-client';

export type SlotStatus = 'OPEN' | 'BOOKED' | 'CANCELLED';
export type BookingStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface MentorProfile {
  id: string;
  userId: string;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  isAcceptingBookings: boolean;
}

export interface MentorDirectoryEntry {
  mentorId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  openSlots: number;
}

export interface MentorSlot {
  id: string;
  mentorId: string;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
}

interface Person {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string } | null;
}

export interface MentorSlotWithBookings extends MentorSlot {
  bookings: Array<{ id: string; topic: string; status: BookingStatus; student: Person }>;
}

export interface Booking {
  id: string;
  slotId: string;
  mentorId: string;
  studentId: string;
  topic: string;
  note: string | null;
  status: BookingStatus;
  mentorNotes: string | null;
  slot: MentorSlot;
  mentor?: Person;
  student?: Person;
}

export const mentorshipApi = {
  // student
  directory: () => apiRequest<MentorDirectoryEntry[]>('/mentors', { auth: true }),
  slotsFor: (mentorId: string) => apiRequest<MentorSlot[]>(`/mentors/${mentorId}/slots`, { auth: true }),
  book: (slotId: string, topic: string, note?: string) =>
    apiRequest<Booking>(`/mentor-slots/${slotId}/book`, { method: 'POST', body: note ? { topic, note } : { topic }, auth: true }),
  myBookings: () => apiRequest<Booking[]>('/me/bookings', { auth: true }),
  cancelBooking: (id: string) => apiRequest<Booking>(`/me/bookings/${id}/cancel`, { method: 'POST', auth: true }),

  // mentor
  profile: () => apiRequest<MentorProfile>('/me/mentor-profile', { auth: true }),
  updateProfile: (input: Partial<Pick<MentorProfile, 'headline' | 'bio' | 'expertise' | 'isAcceptingBookings'>>) =>
    apiRequest<MentorProfile>('/me/mentor-profile', { method: 'PUT', body: input, auth: true }),
  mySlots: () => apiRequest<MentorSlotWithBookings[]>('/me/mentor-slots', { auth: true }),
  createSlot: (startsAt: string, endsAt: string) =>
    apiRequest<MentorSlot>('/me/mentor-slots', { method: 'POST', body: { startsAt, endsAt }, auth: true }),
  removeSlot: (id: string) => apiRequest<MentorSlot>(`/me/mentor-slots/${id}`, { method: 'DELETE', auth: true }),
  complete: (id: string, mentorNotes?: string, status: 'COMPLETED' | 'NO_SHOW' = 'COMPLETED') =>
    apiRequest<Booking>(`/me/mentor-bookings/${id}/complete`, {
      method: 'POST',
      body: mentorNotes ? { mentorNotes, status } : { status },
      auth: true,
    }),
};
