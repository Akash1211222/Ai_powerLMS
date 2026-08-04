'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner, Alert, Field, Input, Textarea } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { mentorshipApi, type Booking, type MentorCard } from '@/lib/mentorship-api';

function statusToneFor(status: Booking['status']): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'CONFIRMED':
      return 'brand';
    case 'COMPLETED':
      return 'success';
    case 'DECLINED':
    case 'CANCELLED':
      return 'danger';
    default:
      return 'warning';
  }
}

function partyName(p: Booking['mentor']) {
  return p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email;
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// --- Student side ---------------------------------------------------------

function BookingForm({ mentor, onClose }: { mentor: MentorCard; onClose: () => void }) {
  const qc = useQueryClient();
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const book = useMutation({
    mutationFn: () =>
      mentorshipApi.book({
        mentorId: mentor.userId,
        topic,
        note: note || undefined,
        scheduledAt: new Date(at).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentorship', 'bookings'] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not request the session'),
  });

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-panel border border-hair p-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Topic">
        {({ id }) => (
          <Input id={id} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Career guidance, React doubts" />
        )}
      </Field>
      <Field label="When">
        {({ id }) => <Input id={id} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
      </Field>
      <Field label="Context (optional)">
        {({ id }) => (
          <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What would you like help with?" />
        )}
      </Field>
      <div className="flex gap-2">
        <Button size="sm" disabled={!topic || !at || book.isPending} onClick={() => book.mutate()}>
          {book.isPending ? 'Requesting…' : 'Request session'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MentorDirectory({ orgId }: { orgId: string }) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const mentorsQ = useQuery({
    queryKey: ['mentorship', 'mentors', orgId],
    queryFn: () => mentorshipApi.mentors(orgId),
  });

  if (mentorsQ.isLoading) return <Spinner />;
  if (mentorsQ.isError) return <Alert tone="error">Could not load mentors.</Alert>;
  const mentors = mentorsQ.data ?? [];

  return (
    <Card>
      <h2 className="mb-3 font-bold">Find a mentor</h2>
      {mentors.length === 0 ? (
        <p className="text-sm text-faint">No mentors are available yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {mentors.map((m) => (
            <li key={m.userId} className="rounded-panel border border-hair p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {m.firstName} {m.lastName}
                  </div>
                  {m.headline && <div className="text-sm text-faint">{m.headline}</div>}
                  {m.expertise.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.expertise.map((tag) => (
                        <Badge key={tag} tone="brand">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-faint">
                    {m.confirmedThisWeek}/{m.weeklyCapacity} sessions this week
                  </div>
                </div>
                {m.isAcceptingBookings ? (
                  <Button size="sm" onClick={() => setOpenFor(openFor === m.userId ? null : m.userId)}>
                    Book session
                  </Button>
                ) : (
                  <Badge tone="neutral">Not accepting</Badge>
                )}
              </div>
              {openFor === m.userId && <BookingForm mentor={m} onClose={() => setOpenFor(null)} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MySessions({ bookings }: { bookings: Booking[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: ({ id, action, rating }: { id: string; action: 'CANCEL' | 'RATE'; rating?: number }) =>
      mentorshipApi.update(id, { action, rating }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', 'bookings'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Update failed'),
  });

  return (
    <Card>
      <h2 className="mb-3 font-bold">My sessions</h2>
      {error && <Alert tone="error">{error}</Alert>}
      {bookings.length === 0 ? (
        <p className="text-sm text-faint">No sessions yet — request one from the mentor list.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-panel border border-hair p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{b.topic}</div>
                  <div className="text-xs text-faint">
                    with {partyName(b.mentor)} · {when(b.scheduledAt)} · {b.durationMin} min
                  </div>
                  {b.meetingUrl && b.status === 'CONFIRMED' && (
                    <a href={b.meetingUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">
                      Join meeting →
                    </a>
                  )}
                  {b.outcomeNote && (
                    <p className="mt-1 text-sm">Mentor notes: {b.outcomeNote}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={statusToneFor(b.status)}>{b.status}</Badge>
                  {(b.status === 'REQUESTED' || b.status === 'CONFIRMED') && (
                    <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: b.id, action: 'CANCEL' })}>
                      Cancel
                    </Button>
                  )}
                  {b.status === 'COMPLETED' && b.rating == null && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="text-lg opacity-50 transition hover:opacity-100"
                          title={`Rate ${r} stars`}
                          onClick={() => update.mutate({ id: b.id, action: 'RATE', rating: r })}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  )}
                  {b.rating != null && <div className="text-sm">{'★'.repeat(b.rating)}</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- Mentor side ----------------------------------------------------------

function MentorProfileCard() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['mentorship', 'profile'], queryFn: mentorshipApi.myProfile });
  const [headline, setHeadline] = useState<string | null>(null);
  const [expertise, setExpertise] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      mentorshipApi.updateProfile({
        headline: headline ?? profileQ.data?.headline ?? undefined,
        expertise:
          expertise != null
            ? expertise.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship'] }),
  });
  const toggle = useMutation({
    mutationFn: (accepting: boolean) => mentorshipApi.updateProfile({ isAcceptingBookings: accepting }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship'] }),
  });

  if (profileQ.isLoading) return <Spinner />;
  const p = profileQ.data;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-bold">My mentor profile</h2>
        <Button size="sm" variant={p?.isAcceptingBookings === false ? 'primary' : 'secondary'} onClick={() => toggle.mutate(!(p?.isAcceptingBookings ?? true))}>
          {p?.isAcceptingBookings === false ? 'Start accepting bookings' : 'Pause bookings'}
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <Field label="Headline">
          {({ id }) => (
            <Input
              id={id}
              value={headline ?? p?.headline ?? ''}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Senior engineer — career & interview prep"
            />
          )}
        </Field>
        <Field label="Expertise (comma-separated)">
          {({ id }) => (
            <Input
              id={id}
              value={expertise ?? (p?.expertise ?? []).join(', ')}
              onChange={(e) => setExpertise(e.target.value)}
              placeholder="React, System design, Interviews"
            />
          )}
        </Field>
        <div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MentorInbox({ bookings }: { bookings: Booking[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});

  const update = useMutation({
    mutationFn: ({
      id,
      action,
      outcomeNote,
    }: {
      id: string;
      action: 'CONFIRM' | 'DECLINE' | 'COMPLETE';
      outcomeNote?: string;
    }) => mentorshipApi.update(id, { action, outcomeNote }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorship', 'bookings'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Update failed'),
  });

  const pending = bookings.filter((b) => b.status === 'REQUESTED');
  const confirmed = bookings.filter((b) => b.status === 'CONFIRMED');
  const past = bookings.filter((b) => ['COMPLETED', 'DECLINED', 'CANCELLED'].includes(b.status));

  return (
    <Card>
      <h2 className="mb-3 font-bold">Mentor inbox</h2>
      {error && <Alert tone="error">{error}</Alert>}
      {bookings.length === 0 ? (
        <p className="text-sm text-faint">No session requests yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Requests</h3>
              <ul className="flex flex-col gap-2">
                {pending.map((b) => (
                  <li key={b.id} className="rounded-panel border border-hair p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{b.topic}</div>
                        <div className="text-xs text-faint">
                          {partyName(b.student)} · {when(b.scheduledAt)} · {b.durationMin} min
                        </div>
                        {b.note && <p className="mt-1 text-sm">{b.note}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => update.mutate({ id: b.id, action: 'CONFIRM' })}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: b.id, action: 'DECLINE' })}>
                          Decline
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {confirmed.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Upcoming</h3>
              <ul className="flex flex-col gap-2">
                {confirmed.map((b) => (
                  <li key={b.id} className="rounded-panel border border-hair p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{b.topic}</div>
                        <div className="text-xs text-faint">
                          {partyName(b.student)} · {when(b.scheduledAt)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Input
                          placeholder="Outcome note (optional)"
                          value={noteFor[b.id] ?? ''}
                          onChange={(e) => setNoteFor({ ...noteFor, [b.id]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            update.mutate({ id: b.id, action: 'COMPLETE', outcomeNote: noteFor[b.id] || undefined })
                          }
                        >
                          Mark complete
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">History</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {past.slice(0, 10).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span>
                      {b.topic} · {partyName(b.student)}
                    </span>
                    <span className="flex items-center gap-2">
                      {b.rating != null && <span>{'★'.repeat(b.rating)}</span>}
                      <Badge tone={statusToneFor(b.status)}>{b.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// --- Page -----------------------------------------------------------------

export default function MentorshipPage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();

  const bookingsQ = useQuery({
    queryKey: ['mentorship', 'bookings'],
    queryFn: mentorshipApi.myBookings,
    enabled: Boolean(user),
  });

  if (!user || !org) return <Spinner />;

  const roleNames = user.roles.map((r) => r.role);
  const isMentor = roleNames.includes('MENTOR') || roleNames.includes('SUPER_ADMIN');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Mentorship</span></h1>
        <p className="mt-1 text-faint">
          {isMentor
            ? 'Manage your mentor profile and session requests.'
            : 'Book 1:1 sessions with mentors for guidance and interventions.'}
        </p>
      </div>

      {isMentor && (
        <>
          <MentorProfileCard />
          <MentorInbox bookings={bookingsQ.data?.asMentor ?? []} />
        </>
      )}

      <MentorDirectory orgId={org.id} />
      <MySessions bookings={bookingsQ.data?.asStudent ?? []} />
    </div>
  );
}
