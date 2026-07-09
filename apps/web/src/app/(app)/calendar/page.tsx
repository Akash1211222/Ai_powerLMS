'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Field, Badge, Spinner, Alert } from '@fca/ui';
import { calendarApi, type CalendarItem } from '@/lib/calendar-api';
import { formatDate, formatTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

const typeLabel: Record<string, string> = {
  LIVE_CLASS: 'Live class',
  ASSIGNMENT_DUE: 'Assignment',
  ASSESSMENT_DUE: 'Test',
  MENTOR_SESSION: 'Mentor',
  WORKSHOP: 'Workshop',
  PERSONAL_TASK: 'Personal',
};

function tone(type: string): 'brand' | 'warning' | 'success' | 'neutral' {
  if (type === 'LIVE_CLASS') return 'brand';
  if (type === 'ASSIGNMENT_DUE' || type === 'ASSESSMENT_DUE') return 'warning';
  if (type === 'PERSONAL_TASK') return 'success';
  return 'neutral';
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 86400000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const eventsQuery = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => calendarApi.events(from, to),
  });

  const createEvent = useMutation({
    mutationFn: () => calendarApi.create({ title: title.trim(), startsAt: new Date(when).toISOString() }),
    onSuccess: () => {
      setTitle('');
      setWhen('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add event'),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const e of eventsQuery.data ?? []) {
      const key = e.startsAt.slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [eventsQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-faint">Your next 30 days across classes, deadlines and tasks.</p>
      </div>

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

      {eventsQuery.isLoading ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">Nothing scheduled in the next 30 days.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-bold text-faint">{formatDate(items[0]!.startsAt)}</h2>
              <Card className="p-0">
                <ul className="divide-y divide-hair">
                  {items.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="font-semibold">{e.title}</div>
                        <div className="text-xs text-faint">
                          {e.allDay ? 'All day' : formatTime(e.startsAt)}
                          {e.context ? ` · ${e.context}` : ''}
                          {e.location ? ` · ${e.location}` : ''}
                        </div>
                      </div>
                      <Badge tone={tone(e.type)}>{typeLabel[e.type] ?? e.type}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
