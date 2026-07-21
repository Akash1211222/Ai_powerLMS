'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { mentorshipApi, type BookingStatus, type MentorDirectoryEntry } from '@/lib/mentorship-api';

const bookingTone: Record<BookingStatus, 'brand' | 'success' | 'neutral' | 'danger'> = {
  CONFIRMED: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

function when(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return `${s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export default function MentorsPage() {
  const { user } = useAuth();
  const isMentor = user?.permissions.includes('mentor:manage');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mentorship</h1>
        <p className="mt-1 text-sm text-faint">
          {isMentor ? 'Open availability and manage your 1:1 sessions.' : 'Book a 1:1 with a mentor in your program.'}
        </p>
      </div>
      {isMentor ? <MentorView /> : <StudentView />}
    </div>
  );
}

// --- Student ------------------------------------------------------------

function StudentView() {
  const directory = useQuery({ queryKey: ['mentors'], queryFn: mentorshipApi.directory });
  const bookings = useQuery({ queryKey: ['me', 'bookings'], queryFn: mentorshipApi.myBookings });
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: mentorshipApi.cancelBooking,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'bookings'] });
      qc.invalidateQueries({ queryKey: ['mentors'] });
    },
  });

  if (directory.isLoading) return <Spinner />;
  if (directory.error) return <Alert tone="error">Could not load mentors.</Alert>;
  const mentors = directory.data ?? [];
  const active = (bookings.data ?? []).filter((b) => b.status !== 'CANCELLED');

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <div>
          <h2 className="mb-3 font-bold">My sessions</h2>
          <Card className="p-0">
            <ul className="divide-y divide-hair">
              {active.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{b.topic}</div>
                    <div className="truncate text-xs text-faint">{when(b.slot.startsAt, b.slot.endsAt)}</div>
                    {b.mentorNotes && <div className="mt-1 text-xs text-faint">Note: {b.mentorNotes}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={bookingTone[b.status]}>{label(b.status)}</Badge>
                    {b.status === 'CONFIRMED' && (
                      <button
                        onClick={() => cancel.mutate(b.id)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-bold">Available mentors</h2>
        {mentors.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">No mentors are accepting bookings right now.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {mentors.map((m) => (
              <MentorCard key={m.mentorId} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MentorCard({ m }: { m: MentorDirectoryEntry }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');

  const slots = useQuery({
    queryKey: ['mentors', m.mentorId, 'slots'],
    queryFn: () => mentorshipApi.slotsFor(m.mentorId),
    enabled: open,
  });
  const book = useMutation({
    mutationFn: () => mentorshipApi.book(slotId!, topic.trim()),
    onSuccess: () => {
      setSlotId(null);
      setTopic('');
      qc.invalidateQueries({ queryKey: ['mentors'] });
      qc.invalidateQueries({ queryKey: ['me', 'bookings'] });
      qc.invalidateQueries({ queryKey: ['mentors', m.mentorId, 'slots'] });
    },
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{m.name}</div>
          {m.headline && <div className="text-sm text-faint">{m.headline}</div>}
        </div>
        <Badge tone={m.openSlots > 0 ? 'success' : 'neutral'}>
          {m.openSlots} open slot{m.openSlots === 1 ? '' : 's'}
        </Badge>
      </div>

      {m.bio && <p className="text-sm text-faint">{m.bio}</p>}

      {m.expertise.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.expertise.map((e) => (
            <Badge key={e} tone="brand">{e}</Badge>
          ))}
        </div>
      )}

      <div>
        <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-brand-500">
          {open ? 'Hide availability' : 'View availability'}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t border-hair pt-3">
          {slots.isLoading ? (
            <Spinner />
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">No open slots right now.</p>
          ) : (
            (slots.data ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{when(s.startsAt, s.endsAt)}</span>
                  <Button
                    variant={slotId === s.id ? 'primary' : 'secondary'}
                    onClick={() => setSlotId(slotId === s.id ? null : s.id)}
                  >
                    {slotId === s.id ? 'Selected' : 'Choose'}
                  </Button>
                </div>
                {slotId === s.id && (
                  <div className="flex flex-col gap-2 rounded-panel bg-soft p-3">
                    <Input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="What do you want to discuss?"
                    />
                    <Button onClick={() => book.mutate()} loading={book.isPending} disabled={topic.trim().length < 3}>
                      Confirm booking
                    </Button>
                    {book.isError && <span className="text-sm text-danger">Could not book — the slot may be taken.</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// --- Mentor -------------------------------------------------------------

function MentorView() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['me', 'mentor-profile'], queryFn: mentorshipApi.profile });
  const slots = useQuery({ queryKey: ['me', 'mentor-slots'], queryFn: mentorshipApi.mySlots });

  const [headline, setHeadline] = useState<string | null>(null);
  const [expertise, setExpertise] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me', 'mentor-slots'] });
    qc.invalidateQueries({ queryKey: ['me', 'mentor-profile'] });
  };
  const save = useMutation({
    mutationFn: () =>
      mentorshipApi.updateProfile({
        headline: headline ?? profile.data?.headline ?? null,
        expertise: (expertise ?? (profile.data?.expertise ?? []).join(', '))
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: invalidate,
  });
  const addSlot = useMutation({
    mutationFn: () => mentorshipApi.createSlot(new Date(startsAt).toISOString(), new Date(endsAt).toISOString()),
    onSuccess: () => {
      setStartsAt('');
      setEndsAt('');
      invalidate();
    },
  });
  const removeSlot = useMutation({ mutationFn: mentorshipApi.removeSlot, onSuccess: invalidate });
  const complete = useMutation({
    mutationFn: (id: string) => mentorshipApi.complete(id),
    onSuccess: invalidate,
  });

  if (profile.isLoading || slots.isLoading) return <Spinner />;
  const rows = slots.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
        <h2 className="font-bold">My availability</h2>
        {rows.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">No slots yet. Open one on the right →</p>
          </Card>
        ) : (
          rows.map((s) => {
            const booking = s.bookings[0];
            return (
              <Card key={s.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{when(s.startsAt, s.endsAt)}</span>
                  <Badge tone={s.status === 'OPEN' ? 'success' : 'brand'}>{label(s.status)}</Badge>
                </div>
                {booking ? (
                  <div className="rounded-panel bg-soft px-3 py-2">
                    <div className="text-sm font-semibold">{booking.topic}</div>
                    <div className="text-xs text-faint">
                      {booking.student.profile
                        ? `${booking.student.profile.firstName} ${booking.student.profile.lastName}`
                        : booking.student.email}{' '}
                      · {label(booking.status)}
                    </div>
                    {booking.status === 'CONFIRMED' && (
                      <Button className="mt-2" onClick={() => complete.mutate(booking.id)} loading={complete.isPending}>
                        Mark completed
                      </Button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => removeSlot.mutate(s.id)}
                    className="self-start text-xs font-semibold text-danger hover:underline"
                  >
                    Remove slot
                  </button>
                )}
              </Card>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">Open a slot</h2>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Starts</span>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Ends</span>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <Button onClick={() => addSlot.mutate()} loading={addSlot.isPending} disabled={!startsAt || !endsAt}>
            Add availability
          </Button>
          {addSlot.isError && <span className="text-sm text-danger">Could not add — check for overlaps.</span>}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">My mentor profile</h2>
          <Input
            value={headline ?? profile.data?.headline ?? ''}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Headline (e.g. Data career mentor)"
          />
          <Textarea
            rows={2}
            value={expertise ?? (profile.data?.expertise ?? []).join(', ')}
            onChange={(e) => setExpertise(e.target.value)}
            placeholder="Expertise, comma-separated"
          />
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save profile</Button>
        </Card>
      </div>
    </div>
  );
}
