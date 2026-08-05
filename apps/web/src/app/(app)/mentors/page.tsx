'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus,
  Clock,
  ExternalLink,
  Handshake,
  MessageCircleQuestion,
  Phone,
  Plus,
  Sparkles,
  Target,
  Users,
  Video,
} from 'lucide-react';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import {
  mentorshipApi,
  type BookingStatus,
  type MentorDirectoryEntry,
  type MentorRequest,
  type MentorRequestStatus,
} from '@/lib/mentorship-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

const bookingTone: Record<BookingStatus, 'brand' | 'success' | 'neutral' | 'danger'> = {
  CONFIRMED: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};

const requestTone: Record<MentorRequestStatus, 'brand' | 'success' | 'neutral' | 'warning'> = {
  OPEN: 'warning',
  SCHEDULED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

function when(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return `${s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function personName(p?: { email: string; profile: { firstName: string; lastName: string } | null } | null) {
  if (!p) return 'Mentor';
  return p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email;
}

type StudentTab = 'mentors' | 'sessions' | 'requests';
type MentorTab = 'inbox' | 'availability' | 'profile';

export default function MentorsPage() {
  const { user } = useAuth();
  const isMentor = user?.permissions.includes('mentor:manage');
  return isMentor ? <MentorView /> : <StudentView />;
}

// --- Student ------------------------------------------------------------

function StudentView() {
  const directory = useQuery({ queryKey: ['mentors'], queryFn: mentorshipApi.directory });
  const bookings = useQuery({ queryKey: ['me', 'bookings'], queryFn: mentorshipApi.myBookings });
  const requests = useQuery({ queryKey: ['me', 'mentor-help-requests'], queryFn: mentorshipApi.myHelpRequests });
  const qc = useQueryClient();
  const [tab, setTab] = useState<StudentTab>('mentors');

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
  const openSlots = mentors.reduce((n, m) => n + m.openSlots, 0);
  const openRequests = (requests.data ?? []).filter((r) => r.status === 'OPEN').length;
  const noAvailability = mentors.length === 0 || openSlots === 0;

  const tabs: Array<{ id: StudentTab; label: string; icon: typeof Users; count?: number }> = [
    { id: 'mentors', label: 'Find mentors', icon: Users, count: mentors.length },
    { id: 'sessions', label: 'Sessions', icon: Video, count: active.length },
    { id: 'requests', label: 'Help requests', icon: MessageCircleQuestion, count: openRequests },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Mentorship lounge"
        title="Get unstuck"
        highlight="with a real human"
        subtitle={`${todayLabel()} · ${openSlots} open slots · ${openRequests} open requests`}
        actions={[
          { label: 'Request help', href: '#help-request', icon: MessageCircleQuestion, primary: true },
          { label: 'Skills practice', href: '/skills', icon: Target },
        ]}
      >
        <HeroPanel title="Guidance pulse">
          <div className="font-display text-3xl font-extrabold">{active.filter((b) => b.status === 'CONFIRMED').length}</div>
          <div className="text-xs text-white/60">upcoming 1:1 sessions</div>
        </HeroPanel>
      </DashboardHero>

      <HeroBanner
        title="Book a mentor — or request one"
        sub="No slot? Drop a topic request and a mentor can arrange a Meet call for you."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="Mentors" value={mentors.length} accent="bg-grad-holo" />
        <StatChip label="Open slots" value={openSlots} accent="bg-grad-mint" />
        <StatChip label="Your requests" value={openRequests} accent="bg-grad-sunset" />
      </div>

      {noAvailability && (
        <Card className="relative overflow-hidden border-accent-300/40 bg-accent-500/5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-sunset opacity-30 blur-2xl" />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <MessageCircleQuestion className="h-5 w-5 text-accent-500" aria-hidden />
                No mentor slots right now
              </div>
              <p className="mt-1 text-sm text-faint">
                Request a topic or doubt — when a mentor is free, they can arrange a call directly.
              </p>
            </div>
            <Button
              className="bg-grad-holo text-white shadow-glow"
              onClick={() => {
                setTab('requests');
                document.getElementById('help-request')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Request help
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          const activeTab = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                activeTab ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
              {typeof t.count === 'number' && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-extrabold', activeTab ? 'bg-white/20' : 'bg-chip')}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'mentors' && (
        <div className="flex flex-col gap-3">
          {mentors.length === 0 ? (
            <Card className="py-10 text-center">
              <Handshake className="mx-auto h-10 w-10 text-faint" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">No mentors accepting bookings</p>
              <p className="mt-1 text-sm text-faint">Request help below — mentors get notified instantly.</p>
              <Button className="mt-4 bg-grad-holo text-white" onClick={() => setTab('requests')}>
                Open help request
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {mentors.map((m) => (
                <MentorCard key={m.mentorId} m={m} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="flex flex-col gap-3">
          {active.length === 0 ? (
            <Card className="py-10 text-center">
              <Video className="mx-auto h-10 w-10 text-faint" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">No sessions yet</p>
              <p className="mt-1 text-sm text-faint">Book a slot or request a call when mentors are free.</p>
            </Card>
          ) : (
            active.map((b) => (
              <Card key={b.id} className="relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-grad-holo" aria-hidden />
                <div className="flex flex-wrap items-start justify-between gap-3 pl-1">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold">{b.topic}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-faint">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {when(b.slot.startsAt, b.slot.endsAt)}
                      </span>
                      {b.mentor && <span>· {personName(b.mentor)}</span>}
                    </div>
                    {b.mentorNotes && <p className="mt-2 text-sm text-faint">Note: {b.mentorNotes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={bookingTone[b.status]}>{label(b.status)}</Badge>
                    {b.meetUrl && (
                      <a
                        href={b.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
                      >
                        <Video className="h-4 w-4" aria-hidden /> Join Meet <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <button
                        type="button"
                        onClick={() => cancel.mutate(b.id)}
                        className="cursor-pointer text-xs font-semibold text-danger hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div id="help-request" className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <HelpRequestForm
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ['me', 'mentor-help-requests'] });
            }}
          />
          <Card>
            <h2 className="mb-3 font-display text-lg font-bold">Your requests</h2>
            {requests.isLoading ? (
              <Spinner />
            ) : (requests.data ?? []).length === 0 ? (
              <p className="text-sm text-faint">No requests yet. Ask about a topic, lab doubt, or career blocker.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(requests.data ?? []).map((r) => (
                  <StudentRequestCard key={r.id} r={r} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function HelpRequestForm({ onCreated }: { onCreated: () => void }) {
  const [topic, setTopic] = useState('');
  const [detail, setDetail] = useState('');
  const [expertise, setExpertise] = useState('');

  const create = useMutation({
    mutationFn: () =>
      mentorshipApi.createHelpRequest({
        topic: topic.trim(),
        detail: detail.trim(),
        preferredExpertise: expertise.trim() || undefined,
      }),
    onSuccess: () => {
      setTopic('');
      setDetail('');
      setExpertise('');
      onCreated();
    },
  });

  const valid = topic.trim().length >= 3 && detail.trim().length >= 10;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
      <h2 className="relative mb-1 flex items-center gap-2 font-display text-lg font-bold">
        <Phone className="h-5 w-5 text-brand-500" aria-hidden />
        Request a mentor call
      </h2>
      <p className="relative mb-4 text-sm text-faint">
        Describe the doubt or topic. Mentors get notified and can arrange a Meet call when free.
      </p>
      <div className="relative flex flex-col gap-3">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (e.g. Async JS debugging)" />
        <Textarea
          rows={4}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="What are you stuck on? What have you already tried? (min 10 chars)"
        />
        <Input
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          placeholder="Preferred expertise (optional)"
        />
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!valid}
          className="bg-grad-holo text-white shadow-glow"
        >
          Submit request
        </Button>
        {create.isSuccess && <span className="text-sm text-success">Request sent — mentors have been notified.</span>}
        {create.isError && <span className="text-sm text-danger">Could not send request. Try again.</span>}
      </div>
    </Card>
  );
}

function StudentRequestCard({ r }: { r: MentorRequest }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => mentorshipApi.cancelHelpRequest(r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'mentor-help-requests'] }),
  });

  return (
    <li className="rounded-panel border border-hair bg-chip/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">{r.topic}</div>
          <p className="mt-1 line-clamp-3 text-sm text-faint">{r.detail}</p>
        </div>
        <Badge tone={requestTone[r.status]}>{label(r.status)}</Badge>
      </div>
      {r.status === 'SCHEDULED' && (
        <div className="mt-2 rounded-panel border border-success/30 bg-success/5 p-2 text-sm">
          {r.scheduledAt && r.booking?.slot && (
            <div className="font-semibold">{when(r.booking.slot.startsAt, r.booking.slot.endsAt)}</div>
          )}
          {r.mentor && <div className="text-xs text-faint">with {personName(r.mentor)}</div>}
          {(r.meetUrl || r.booking?.meetUrl) && (
            <a
              href={(r.meetUrl || r.booking?.meetUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-bold text-brand-500 hover:underline"
            >
              <Video className="h-4 w-4" /> Join Meet
            </a>
          )}
        </div>
      )}
      {r.status === 'OPEN' && (
        <button
          type="button"
          onClick={() => cancel.mutate()}
          className="mt-2 cursor-pointer text-xs font-semibold text-danger hover:underline"
        >
          Cancel request
        </button>
      )}
    </li>
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

  const initial = m.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-grad-aqua" aria-hidden />
      <div className="flex items-start gap-3 pl-1">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel bg-grad-holo font-display text-lg font-extrabold text-white">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold">{m.name}</div>
          {m.headline && <div className="text-sm text-faint">{m.headline}</div>}
        </div>
        <Badge tone={m.openSlots > 0 ? 'success' : 'neutral'}>
          {m.openSlots} slot{m.openSlots === 1 ? '' : 's'}
        </Badge>
      </div>

      {m.bio && <p className="line-clamp-2 pl-1 text-sm text-faint">{m.bio}</p>}

      {m.expertise.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {m.expertise.map((e) => (
            <Badge key={e} tone="brand">
              {e}
            </Badge>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer self-start pl-1 text-sm font-bold text-brand-500 hover:underline"
      >
        {open ? 'Hide availability' : 'View availability'}
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-hair pt-3 pl-1">
          {slots.isLoading ? (
            <Spinner />
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">No open slots — request help from the Help requests tab.</p>
          ) : (
            (slots.data ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{when(s.startsAt, s.endsAt)}</span>
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
                    <Button
                      onClick={() => book.mutate()}
                      loading={book.isPending}
                      disabled={topic.trim().length < 3}
                      className="bg-grad-holo text-white"
                    >
                      Confirm booking
                    </Button>
                    {book.isError && (
                      <span className="text-sm text-danger">Could not book — the slot may be taken.</span>
                    )}
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
  const inbox = useQuery({
    queryKey: ['me', 'incoming-help-requests'],
    queryFn: mentorshipApi.incomingHelpRequests,
  });

  const [tab, setTab] = useState<MentorTab>('inbox');
  const [headline, setHeadline] = useState<string | null>(null);
  const [expertise, setExpertise] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me', 'mentor-slots'] });
    qc.invalidateQueries({ queryKey: ['me', 'mentor-profile'] });
    qc.invalidateQueries({ queryKey: ['me', 'incoming-help-requests'] });
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
  const openInbox = (inbox.data ?? []).filter((r) => r.status === 'OPEN');
  const booked = rows.filter((s) => s.status === 'BOOKED').length;

  const tabs: Array<{ id: MentorTab; label: string; icon: typeof MessageCircleQuestion; count?: number }> = [
    { id: 'inbox', label: 'Help inbox', icon: MessageCircleQuestion, count: openInbox.length },
    { id: 'availability', label: 'Availability', icon: CalendarPlus, count: rows.length },
    { id: 'profile', label: 'Profile', icon: Sparkles },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Mentor cockpit"
        title="Answer doubts,"
        highlight="arrange the call"
        subtitle={`${todayLabel()} · ${openInbox.length} open requests · ${booked} booked slots`}
      >
        <HeroPanel title="Inbox">
          <div className="font-display text-3xl font-extrabold">{openInbox.length}</div>
          <div className="text-xs text-white/60">students waiting for help</div>
        </HeroPanel>
      </DashboardHero>

      <HeroBanner
        title="Your students’ questions land here"
        sub="Claim a request, pick a time, and send a Meet link in one move."
      />

      <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
              {typeof t.count === 'number' && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-extrabold', active ? 'bg-white/20' : 'bg-chip')}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'inbox' && (
        <div className="flex flex-col gap-3">
          {inbox.isLoading ? (
            <Spinner />
          ) : (inbox.data ?? []).length === 0 ? (
            <Card className="py-10 text-center">
              <MessageCircleQuestion className="mx-auto h-10 w-10 text-faint" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">Inbox is clear</p>
              <p className="mt-1 text-sm text-faint">When students request help, their topics appear here.</p>
            </Card>
          ) : (
            (inbox.data ?? []).map((r) => <MentorRequestCard key={r.id} r={r} onChanged={invalidate} />)
          )}
        </div>
      )}

      {tab === 'availability' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-3">
            {rows.length === 0 ? (
              <Card>
                <p className="text-sm text-faint">No slots yet. Open one on the right.</p>
              </Card>
            ) : (
              rows.map((s) => {
                const booking = s.bookings[0];
                return (
                  <Card key={s.id} className="relative flex flex-col gap-2 overflow-hidden">
                    <div
                      className={cn('absolute inset-y-0 left-0 w-1.5', s.status === 'OPEN' ? 'bg-success' : 'bg-grad-holo')}
                      aria-hidden
                    />
                    <div className="flex items-center justify-between gap-3 pl-1">
                      <span className="font-semibold">{when(s.startsAt, s.endsAt)}</span>
                      <Badge tone={s.status === 'OPEN' ? 'success' : 'brand'}>{label(s.status)}</Badge>
                    </div>
                    {booking ? (
                      <div className="ml-1 rounded-panel bg-soft px-3 py-2">
                        <div className="text-sm font-semibold">{booking.topic}</div>
                        <div className="text-xs text-faint">
                          {personName(booking.student)} · {label(booking.status)}
                        </div>
                        {booking.meetUrl && (
                          <a
                            href={booking.meetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
                          >
                            <Video className="h-4 w-4" /> Open Meet
                          </a>
                        )}
                        {booking.status === 'CONFIRMED' && (
                          <Button
                            className="mt-2"
                            onClick={() => complete.mutate(booking.id)}
                            loading={complete.isPending}
                          >
                            Mark completed
                          </Button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeSlot.mutate(s.id)}
                        className="ml-1 cursor-pointer self-start text-xs font-semibold text-danger hover:underline"
                      >
                        Remove slot
                      </button>
                    )}
                  </Card>
                );
              })
            )}
          </div>

          <Card className="flex h-fit flex-col gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Plus className="h-5 w-5" aria-hidden />
              Open a slot
            </h2>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-faint">Starts</span>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-faint">Ends</span>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
            <Button
              onClick={() => addSlot.mutate()}
              loading={addSlot.isPending}
              disabled={!startsAt || !endsAt}
              className="bg-grad-holo text-white shadow-glow"
            >
              Add availability
            </Button>
            {addSlot.isError && <span className="text-sm text-danger">Could not add — check for overlaps.</span>}
          </Card>
        </div>
      )}

      {tab === 'profile' && (
        <Card className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <h2 className="font-display text-lg font-bold">Mentor profile</h2>
          <Input
            value={headline ?? profile.data?.headline ?? ''}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Headline (e.g. Data career mentor)"
          />
          <Textarea
            rows={3}
            value={expertise ?? (profile.data?.expertise ?? []).join(', ')}
            onChange={(e) => setExpertise(e.target.value)}
            placeholder="Expertise, comma-separated"
          />
          <Button onClick={() => save.mutate()} loading={save.isPending} className="bg-grad-holo text-white">
            Save profile
          </Button>
        </Card>
      )}
    </div>
  );
}

function MentorRequestCard({ r, onChanged }: { r: MentorRequest; onChanged: () => void }) {
  const [showArrange, setShowArrange] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');

  const arrange = useMutation({
    mutationFn: () =>
      mentorshipApi.arrangeHelpRequest(r.id, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        mentorNote: note.trim() || undefined,
      }),
    onSuccess: () => {
      setShowArrange(false);
      onChanged();
    },
  });
  const close = useMutation({
    mutationFn: () => mentorshipApi.closeHelpRequest(r.id),
    onSuccess: onChanged,
  });

  const student = personName(r.student);

  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn('absolute inset-y-0 left-0 w-1.5', r.status === 'OPEN' ? 'bg-warning' : 'bg-success')}
        aria-hidden
      />
      <div className="flex flex-wrap items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold">{r.topic}</div>
          <div className="text-sm text-faint">
            {student}
            {r.preferredExpertise ? ` · prefers ${r.preferredExpertise}` : ''}
          </div>
          <p className="mt-2 text-sm">{r.detail}</p>
        </div>
        <Badge tone={requestTone[r.status]}>{label(r.status)}</Badge>
      </div>

      {r.status === 'SCHEDULED' && (r.meetUrl || r.booking?.meetUrl) && (
        <div className="mt-3 ml-1 rounded-panel border border-success/30 bg-success/5 p-3">
          {r.booking?.slot && (
            <div className="text-sm font-semibold">{when(r.booking.slot.startsAt, r.booking.slot.endsAt)}</div>
          )}
          <a
            href={(r.meetUrl || r.booking?.meetUrl)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
          >
            <Video className="h-4 w-4" /> Open Meet link
          </a>
        </div>
      )}

      {r.status === 'OPEN' && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-hair pt-3 pl-1">
          <Button className="bg-grad-holo text-white shadow-glow" onClick={() => setShowArrange((v) => !v)}>
            <Video className="mr-1.5 h-4 w-4" aria-hidden />
            {showArrange ? 'Cancel' : 'Arrange call'}
          </Button>
          <Button variant="secondary" onClick={() => close.mutate()} loading={close.isPending}>
            Close request
          </Button>
        </div>
      )}

      {showArrange && r.status === 'OPEN' && (
        <div className="mt-3 ml-1 flex flex-col gap-2 rounded-panel bg-soft p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Call starts</span>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Call ends</span>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the student…"
          />
          <Button
            onClick={() => arrange.mutate()}
            loading={arrange.isPending}
            disabled={!startsAt || !endsAt}
            className="bg-grad-mint text-white"
          >
            Schedule Meet call
          </Button>
          {arrange.isError && (
            <span className="text-sm text-danger">Could not arrange — check times or if someone else claimed it.</span>
          )}
        </div>
      )}
    </Card>
  );
}

// --- Shared -------------------------------------------------------------

function StatChip({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <div className={cn('mb-2 h-1 w-10 rounded-full', accent)} />
      <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-2xl font-extrabold leading-none">{value}</div>
    </div>
  );
}

function HeroBanner({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/artwork/mentorship-hub-hero.png"
        alt="Fox mentor and student with holographic calendar and video call"
        className="h-40 w-full object-cover object-center sm:h-52"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/45 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Mentorship</p>
        <p className="font-display text-xl font-extrabold sm:text-2xl">{title}</p>
        <p className="mt-1 text-sm text-white/75">{sub}</p>
      </div>
    </div>
  );
}
