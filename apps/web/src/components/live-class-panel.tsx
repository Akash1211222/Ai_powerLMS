'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Plus, Video } from 'lucide-react';
import { Card, Button, Input, Textarea, Badge, Spinner, Alert } from '@fca/ui';
import { liveApi, type LiveClass } from '@/lib/live-api';
import { formatDate, formatTime } from '@/lib/format';

function toLocalInputValue(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LiveClassPanel({
  batchId,
  canSchedule,
}: {
  batchId: string;
  canSchedule: boolean;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 2 * 60 * 60_000)),
  );
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['live-classes', batchId],
    queryFn: () => liveApi.listForBatch(batchId),
  });

  const schedule = useMutation({
    mutationFn: () =>
      liveApi.schedule({
        batchId,
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['live-classes', batchId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not schedule'),
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-brand-500" aria-hidden />
        <h2 className="font-display font-bold">Live classes</h2>
      </div>
      <p className="text-sm text-faint">
        Schedule a session — a Google Meet link is created automatically and shared with every student
        in this batch.
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      {canSchedule && (
        <div className="grid gap-3 rounded-panel border border-hair bg-soft/60 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-faint">Title</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. React hooks deep-dive"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Starts</span>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Ends</span>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-faint">Notes (optional)</span>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bring your laptop; we'll pair-program."
            />
          </label>
          <div className="sm:col-span-2">
            <Button
              onClick={() => schedule.mutate()}
              loading={schedule.isPending}
              disabled={title.trim().length < 2 || !startsAt || !endsAt}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Schedule + create Meet link
            </Button>
          </div>
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-sm text-faint">No live classes scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(list.data as LiveClass[]).map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hair bg-chip px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                  <span className="truncate font-semibold">{c.title}</span>
                  <Badge tone={c.status === 'LIVE' ? 'success' : c.status === 'ENDED' ? 'neutral' : 'brand'}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-faint">
                  {formatDate(c.startsAt)} · {formatTime(c.startsAt)}–{formatTime(c.endsAt)}
                  {c.meetingUrl ? ' · Meet ready' : ''}
                </div>
              </div>
              <Link
                href={`/live/${c.id}`}
                className="text-sm font-bold text-brand-600 hover:underline"
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
