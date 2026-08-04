'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Card, Button, Input, Field, Spinner, Alert, cn } from '@fca/ui';
import { calendarApi, type CalendarItem } from '@/lib/calendar-api';
import { formatTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

const typeLabel: Record<string, string> = {
  LIVE_CLASS: 'Live class',
  ASSIGNMENT_DUE: 'Assignment',
  ASSESSMENT_DUE: 'Test',
  MENTOR_SESSION: 'Mentor',
  WORKSHOP: 'Workshop',
  PERSONAL_TASK: 'Personal',
};

/** Google-Calendar-style colored chip classes per event type. */
const typeChip: Record<string, string> = {
  LIVE_CLASS: 'bg-brand-500 text-white',
  ASSIGNMENT_DUE: 'bg-warning text-white',
  ASSESSMENT_DUE: 'bg-accent-500 text-white',
  MENTOR_SESSION: 'bg-aqua-500 text-white',
  WORKSHOP: 'bg-brand-700 text-white',
  PERSONAL_TASK: 'bg-success text-white',
};

const typeDot: Record<string, string> = {
  LIVE_CLASS: 'bg-brand-500',
  ASSIGNMENT_DUE: 'bg-warning',
  ASSESSMENT_DUE: 'bg-accent-500',
  MENTOR_SESSION: 'bg-aqua-500',
  WORKSHOP: 'bg-brand-700',
  PERSONAL_TASK: 'bg-success',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(ymd(today));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Visible range: full weeks covering the cursor month (like Google Calendar).
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

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const e of eventsQuery.data ?? []) {
      const key = ymd(new Date(e.startsAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [eventsQuery.data]);

  const createEvent = useMutation({
    mutationFn: () =>
      calendarApi.create({ title: title.trim(), startsAt: new Date(when).toISOString() }),
    onSuccess: () => {
      setTitle('');
      setWhen('');
      setError(null);
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add event'),
  });

  const monthName = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedDate = new Date(`${selected}T00:00:00`);
  const selectedEvents = byDay.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Calendar</span>
          </h1>
          <p className="mt-1 text-sm text-faint">Classes, deadlines, mentor sessions and tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
          <button
            aria-label="Previous month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="glass flex h-9 w-9 items-center justify-center rounded-panel text-ink transition hover:bg-chip"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-40 text-center font-display text-lg font-bold">{monthName}</span>
          <button
            aria-label="Next month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="glass flex h-9 w-9 items-center justify-center rounded-panel text-ink transition hover:bg-chip"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Task
          </Button>
        </div>
      </div>

      {adding && (
        <Card>
          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="New personal task">
              {({ id }) => (
                <Input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Revise Pandas"
                  autoFocus
                />
              )}
            </Field>
            <Field label="When">
              {({ id }) => (
                <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              )}
            </Field>
            <Button
              onClick={() => createEvent.mutate()}
              loading={createEvent.isPending}
              disabled={title.trim().length < 1 || !when}
            >
              Add
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        {/* Month grid */}
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-hair">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-faint">
                {d}
              </div>
            ))}
          </div>
          {eventsQuery.isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Spinner />
            </div>
          ) : (
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
                      'flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-hair p-1.5 text-left align-top transition',
                      !inMonth && 'opacity-40',
                      isSelected ? 'bg-chip' : 'hover:bg-soft',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold',
                        isToday ? 'bg-grad-brand text-white shadow-glow' : 'text-ink',
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
                          typeChip[e.type] ?? 'bg-brand-500 text-white',
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
                      <span className="px-1 text-[10px] font-semibold text-faint">
                        +{events.length - 3} more
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Day details */}
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display font-bold">
              {selectedDate.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            {selectedEvents.length === 0 ? (
              <p className="mt-2 text-sm text-faint">Nothing scheduled this day.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {selectedEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5 rounded-panel bg-chip p-2.5">
                    <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', typeDot[e.type] ?? 'bg-brand-500')} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{e.title}</div>
                      <div className="text-xs text-faint">
                        {e.allDay ? 'All day' : formatTime(e.startsAt)}
                        {e.context ? ` · ${e.context}` : ''}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-faint">
                        {typeLabel[e.type] ?? e.type}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-sm font-bold">Legend</h2>
            <ul className="flex flex-col gap-1.5">
              {Object.entries(typeLabel).map(([type, label]) => (
                <li key={type} className="flex items-center gap-2 text-xs font-semibold text-faint">
                  <span className={cn('h-2.5 w-2.5 rounded-full', typeDot[type])} />
                  {label}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
