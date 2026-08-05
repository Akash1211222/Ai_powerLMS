'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  ListTodo,
  Plus,
  Radio,
  Sparkles,
  Target,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Card, Button, Input, Field, Textarea, Select, Spinner, Alert, cn } from '@fca/ui';
import { calendarApi, type CalendarItem } from '@/lib/calendar-api';
import { formatTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

type TabId = 'month' | 'agenda' | 'focus';
type TypeFilter = 'ALL' | CalendarItem['type'];

const TYPE_META: Record<
  string,
  { label: string; chip: string; dot: string; glow: string }
> = {
  LIVE_CLASS: {
    label: 'Live class',
    chip: 'bg-brand-500 text-white',
    dot: 'bg-brand-500',
    glow: 'shadow-[0_0_0_1px_rgba(37,99,235,0.35)]',
  },
  ASSIGNMENT_DUE: {
    label: 'Assignment',
    chip: 'bg-warning text-white',
    dot: 'bg-warning',
    glow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.35)]',
  },
  ASSESSMENT_DUE: {
    label: 'Assessment',
    chip: 'bg-accent-500 text-white',
    dot: 'bg-accent-500',
    glow: 'shadow-[0_0_0_1px_rgba(249,115,22,0.35)]',
  },
  MENTOR_SESSION: {
    label: 'Mentor',
    chip: 'bg-aqua-500 text-white',
    dot: 'bg-aqua-500',
    glow: 'shadow-[0_0_0_1px_rgba(14,165,233,0.35)]',
  },
  WORKSHOP: {
    label: 'Workshop',
    chip: 'bg-brand-700 text-white',
    dot: 'bg-brand-700',
    glow: 'shadow-[0_0_0_1px_rgba(29,78,216,0.35)]',
  },
  PERSONAL_TASK: {
    label: 'Personal',
    chip: 'bg-success text-white',
    dot: 'bg-success',
    glow: 'shadow-[0_0_0_1px_rgba(34,197,94,0.35)]',
  },
  INTERVIEW: {
    label: 'Interview',
    chip: 'bg-accent-600 text-white',
    dot: 'bg-accent-600',
    glow: 'shadow-[0_0_0_1px_rgba(234,88,12,0.35)]',
  },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'ALL', label: 'All signals' },
  { id: 'LIVE_CLASS', label: 'Live' },
  { id: 'ASSIGNMENT_DUE', label: 'Assignments' },
  { id: 'ASSESSMENT_DUE', label: 'Tests' },
  { id: 'MENTOR_SESSION', label: 'Mentors' },
  { id: 'PERSONAL_TASK', label: 'Personal' },
  { id: 'WORKSHOP', label: 'Workshops' },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function meta(type: string) {
  return TYPE_META[type] ?? TYPE_META.PERSONAL_TASK!;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isPersonal(e: CalendarItem) {
  return e.sourceType === 'CalendarEvent';
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(ymd(today));
  const [tab, setTab] = useState<TabId>('month');
  const [filter, setFilter] = useState<TypeFilter>('ALL');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [ends, setEnds] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<'PERSONAL_TASK' | 'WORKSHOP'>('PERSONAL_TASK');
  const [allDay, setAllDay] = useState(false);

  const { cells, from, to } = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const cellCount = 42;
    const cells = Array.from({ length: cellCount }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const end = new Date(start);
    end.setDate(start.getDate() + cellCount);
    return { cells, from: start.toISOString(), to: end.toISOString() };
  }, [cursor]);

  const eventsQuery = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => calendarApi.events(from, to),
  });

  const filtered = useMemo(() => {
    const all = eventsQuery.data ?? [];
    if (filter === 'ALL') return all;
    return all.filter((e) => e.type === filter);
  }, [eventsQuery.data, filter]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const e of filtered) {
      const key = ymd(new Date(e.startsAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const all = eventsQuery.data ?? [];
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    const upcoming = all.filter((e) => new Date(e.startsAt).getTime() >= now);
    const thisWeek = upcoming.filter((e) => new Date(e.startsAt).getTime() <= weekEnd);
    return {
      total: all.length,
      live: all.filter((e) => e.type === 'LIVE_CLASS').length,
      dues: all.filter((e) => e.type === 'ASSIGNMENT_DUE' || e.type === 'ASSESSMENT_DUE').length,
      mentors: all.filter((e) => e.type === 'MENTOR_SESSION').length,
      week: thisWeek.length,
      next: upcoming[0] ?? null,
    };
  }, [eventsQuery.data]);

  const resetForm = () => {
    setTitle('');
    setWhen('');
    setEnds('');
    setLocation('');
    setDescription('');
    setEventType('PERSONAL_TASK');
    setAllDay(false);
    setError(null);
  };

  const createEvent = useMutation({
    mutationFn: () =>
      calendarApi.create({
        title: title.trim(),
        startsAt: new Date(when).toISOString(),
        endsAt: ends ? new Date(ends).toISOString() : undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        type: eventType,
        allDay,
      }),
    onSuccess: () => {
      resetForm();
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add event'),
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => calendarApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to delete event'),
  });

  const monthName = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedDate = new Date(`${selected}T00:00:00`);
  const selectedEvents = byDay.get(selected) ?? [];

  const agendaDays = useMemo(() => {
    const keys = [...byDay.keys()].sort();
    const todayKey = ymd(today);
    return keys
      .filter((k) => k >= todayKey)
      .slice(0, 14)
      .map((k) => ({ key: k, events: byDay.get(k) ?? [] }));
  }, [byDay, today]);

  const focusEvents = useMemo(() => {
    const now = startOfDay(today).getTime();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    return filtered
      .filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= now && t <= horizon;
      })
      .slice(0, 24);
  }, [filtered, today]);

  const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays; count?: number }> = [
    { id: 'month', label: 'Orbit', icon: CalendarDays, count: filtered.length },
    { id: 'agenda', label: 'Timeline', icon: ListTodo, count: agendaDays.reduce((n, d) => n + d.events.length, 0) },
    { id: 'focus', label: 'Next 7 days', icon: Target, count: focusEvents.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Time deck"
        title="Your chronology"
        highlight="command center"
        subtitle={`${todayLabel()} · ${stats.week} signals in the next 7 days`}
        actions={[
          { label: 'Live classes', href: '/live', icon: Radio },
          { label: 'Assignments', href: '/assignments', icon: ListTodo },
          { label: 'Mentorship', href: '/mentorship', icon: Sparkles },
        ]}
      >
        <HeroPanel title="Next up">
          {stats.next ? (
            <>
              <div className="truncate font-display text-lg font-extrabold">{stats.next.title}</div>
              <div className="mt-1 text-xs text-white/65">
                {formatTime(stats.next.startsAt)}
                {stats.next.context ? ` · ${stats.next.context}` : ''}
              </div>
            </>
          ) : (
            <div className="text-sm text-white/70">Clear skies — nothing queued ahead.</div>
          )}
        </HeroPanel>
      </DashboardHero>

      <div className="chrono-hero relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/calendar-hub-hero.png"
          alt="Fox at a holographic time-deck console"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/92 via-[#0b1b3a]/50 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Chronosphere</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Classes, dues, mentors — one orbit.
          </p>
          <p className="mt-1 text-sm text-white/75">
            Filter the signal. Jump into live rooms. Keep personal tasks on the deck.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="This month" value={stats.total} sub="total signals" accent="bg-grad-holo" icon={CalendarDays} />
        <StatChip label="Live classes" value={stats.live} sub="on the grid" accent="bg-grad-aqua" icon={Video} />
        <StatChip label="Deadlines" value={stats.dues} sub="assignments + tests" accent="bg-grad-sunset" icon={Clock3} />
        <StatChip label="Mentor syncs" value={stats.mentors} sub="booked / arranged" accent="bg-grad-mint" icon={Sparkles} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(ymd(today));
            }}
          >
            Today
          </Button>
          <Button
            size="sm"
            className="bg-grad-holo text-white shadow-glow"
            onClick={() => {
              setAdding((v) => !v);
              if (!when) {
                const d = new Date(`${selected}T10:00:00`);
                setWhen(toLocalInput(d.toISOString()));
              }
            }}
          >
            <Plus className="h-4 w-4" /> Add task
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-faint">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Signal filter
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-bold transition',
              filter === f.id
                ? 'bg-grad-holo text-white shadow-glow'
                : 'bg-chip text-faint hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {adding && (
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-sunset opacity-20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Drop a personal signal</h2>
              <p className="text-sm text-faint">Tasks and workshops stay on your deck only.</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                setAdding(false);
                resetForm();
              }}
              className="rounded-panel p-1.5 text-faint hover:bg-chip hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && (
            <Alert tone="error" className="mt-3">
              {error}
            </Alert>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              {({ id }) => (
                <Input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Revise system design"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Type">
              {({ id }) => (
                <Select
                  id={id}
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as 'PERSONAL_TASK' | 'WORKSHOP')}
                >
                  <option value="PERSONAL_TASK">Personal task</option>
                  <option value="WORKSHOP">Workshop</option>
                </Select>
              )}
            </Field>
            <Field label="Starts">
              {({ id }) => (
                <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              )}
            </Field>
            <Field label="Ends (optional)">
              {({ id }) => (
                <Input id={id} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
              )}
            </Field>
            <Field label="Location / link">
              {({ id }) => (
                <Input
                  id={id}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Room / Meet URL"
                />
              )}
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-hair"
              />
              All day
            </label>
            <div className="sm:col-span-2">
              <Field label="Notes">
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional context for future-you"
                    rows={2}
                  />
                )}
              </Field>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAdding(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="bg-grad-holo text-white shadow-glow"
              onClick={() => createEvent.mutate()}
              loading={createEvent.isPending}
              disabled={title.trim().length < 1 || !when}
            >
              Lock onto deck
            </Button>
          </div>
        </Card>
      )}

      {eventsQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : eventsQuery.isError ? (
        <Alert tone="error">Could not load your chronology.</Alert>
      ) : tab === 'month' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card className="chrono-grid overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-hair px-4 py-3">
              <button
                aria-label="Previous month"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="glass flex h-9 w-9 items-center justify-center rounded-panel text-ink transition hover:bg-chip"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-display text-lg font-bold">{monthName}</span>
              <button
                aria-label="Next month"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="glass flex h-9 w-9 items-center justify-center rounded-panel text-ink transition hover:bg-chip"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 border-b border-hair bg-soft/40">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/70 dark:text-faint">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = key === ymd(today);
                const isSelected = key === selected;
                const events = byDay.get(key) ?? [];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={cn(
                      'chrono-cell flex min-h-[96px] flex-col items-stretch gap-1 border-b border-r border-hair p-1.5 text-left transition',
                      !inMonth && 'opacity-55 dark:opacity-45',
                      isSelected && 'chrono-cell-selected',
                      isToday && 'chrono-cell-today',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold',
                        isToday ? 'bg-grad-holo text-white shadow-glow' : inMonth ? 'text-ink' : 'text-faint',
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {events.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        title={e.title}
                        className={cn(
                          'truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight',
                          meta(e.type).chip,
                        )}
                      >
                        {!e.allDay && (
                          <span className="opacity-80">
                            {new Date(e.startsAt).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}{' '}
                          </span>
                        )}
                        {e.title}
                      </span>
                    ))}
                    {events.length > 3 && (
                      <span className="px-1 text-[10px] font-semibold text-faint">+{events.length - 3} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-holo opacity-15 blur-2xl" />
              <h2 className="font-display font-bold">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-faint">
                {selectedEvents.length} signal{selectedEvents.length === 1 ? '' : 's'} on this day
              </p>
              {selectedEvents.length === 0 ? (
                <p className="mt-3 text-sm text-faint">Nothing locked in — clear runway.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {selectedEvents.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      onDelete={isPersonal(e) ? () => deleteEvent.mutate(e.id) : undefined}
                      deleting={deleteEvent.isPending}
                    />
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-2 font-display text-sm font-bold">Signal legend</h2>
              <ul className="flex flex-col gap-1.5">
                {Object.entries(TYPE_META).map(([type, m]) => (
                  <li key={type} className="flex items-center gap-2 text-xs font-semibold text-faint">
                    <span className={cn('h-2.5 w-2.5 rounded-full', m.dot)} />
                    {m.label}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : tab === 'agenda' ? (
        <div className="flex flex-col gap-3">
          {agendaDays.length === 0 ? (
            <EmptyDeck />
          ) : (
            agendaDays.map(({ key, events }) => {
              const d = new Date(`${key}T00:00:00`);
              return (
                <Card key={key} className="relative overflow-hidden">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold">
                        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs font-semibold text-faint">{events.length} items</div>
                    </div>
                    {key === ymd(today) && (
                      <span className="rounded-full bg-grad-holo px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                        Today
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {events.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        onDelete={isPersonal(e) ? () => deleteEvent.mutate(e.id) : undefined}
                        deleting={deleteEvent.isPending}
                      />
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-grad-aqua opacity-15 blur-3xl" />
            <h2 className="font-display text-xl font-bold">Focus corridor · next 7 days</h2>
            <p className="mt-1 text-sm text-faint">Everything that needs your attention this week.</p>
            {focusEvents.length === 0 ? (
              <div className="mt-6">
                <EmptyDeck />
              </div>
            ) : (
              <ol className="chrono-rail relative mt-6 flex flex-col gap-0 pl-6">
                {focusEvents.map((e, idx) => (
                  <li key={e.id} className="relative pb-5 last:pb-0">
                    <span
                      className={cn(
                        'absolute -left-6 top-1.5 flex h-3 w-3 items-center justify-center rounded-full',
                        meta(e.type).dot,
                      )}
                    />
                    {idx < focusEvents.length - 1 && (
                      <span className="absolute -left-[1.15rem] top-4 h-[calc(100%-0.25rem)] w-px bg-hair" aria-hidden />
                    )}
                    <EventRow
                      event={e}
                      showDate
                      onDelete={isPersonal(e) ? () => deleteEvent.mutate(e.id) : undefined}
                      deleting={deleteEvent.isPending}
                    />
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <h2 className="font-display text-sm font-bold">Quick jumps</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                { href: '/live', label: 'Live classroom', icon: Video },
                { href: '/assignments', label: 'Assignment board', icon: ListTodo },
                { href: '/assessments', label: 'Assessments', icon: Target },
                { href: '/mentorship', label: 'Mentorship lounge', icon: Sparkles },
              ].map((l) => {
                const Icon = l.icon;
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex items-center gap-2 rounded-panel bg-chip px-3 py-2.5 text-sm font-bold transition hover:bg-soft"
                    >
                      <Icon className="h-4 w-4 text-brand-500" aria-hidden />
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function EventRow({
  event: e,
  showDate,
  onDelete,
  deleting,
}: {
  event: CalendarItem;
  showDate?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const m = meta(e.type);
  return (
    <div className={cn('flex items-start gap-2.5 rounded-panel bg-chip p-2.5', m.glow)}>
      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', m.dot)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{e.title}</div>
        <div className="text-xs text-faint">
          {showDate && (
            <>
              {new Date(e.startsAt).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {' · '}
            </>
          )}
          {e.allDay ? 'All day' : formatTime(e.startsAt)}
          {e.endsAt && !e.allDay ? `–${formatTime(e.endsAt)}` : ''}
          {e.context ? ` · ${e.context}` : ''}
          {e.location ? ` · ${e.location}` : ''}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-faint">{m.label}</span>
          {e.href && (
            <Link href={e.href} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline">
              Open <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {e.meetingUrl && (
            <a
              href={e.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-accent-600 hover:underline"
            >
              <Video className="h-3 w-3" /> Join
            </a>
          )}
        </div>
      </div>
      {onDelete && (
        <button
          type="button"
          aria-label="Delete personal event"
          disabled={deleting}
          onClick={onDelete}
          className="rounded-panel p-1.5 text-faint transition hover:bg-soft hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyDeck() {
  return (
    <Card className="relative overflow-hidden py-10 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.12),transparent_55%)]" />
      <CalendarDays className="mx-auto h-8 w-8 text-brand-400" aria-hidden />
      <p className="mt-3 font-display text-lg font-bold">Deck is clear</p>
      <p className="mt-1 text-sm text-faint">No upcoming signals in this view. Add a personal task or check Live.</p>
    </Card>
  );
}

function StatChip({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  icon: typeof CalendarDays;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">{label}</div>
          <div className="mt-1 font-display text-2xl font-extrabold">{value}</div>
          {sub && <div className="text-xs font-semibold text-faint">{sub}</div>}
        </div>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-panel text-white', accent)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
