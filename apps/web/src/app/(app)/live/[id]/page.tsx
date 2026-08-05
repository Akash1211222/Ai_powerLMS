'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Video, Radio, LogOut, Square, ExternalLink, Timer } from 'lucide-react';
import { Card, Button, Badge, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { liveApi } from '@/lib/live-api';
import { formatDate, formatTime } from '@/lib/format';

export default function LiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [watchedSec, setWatchedSec] = useState(0);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const canEnd =
    user?.permissions.includes('attendance:mark') ||
    user?.permissions.includes('batch:manage') ||
    user?.permissions.includes('course:update');

  const q = useQuery({ queryKey: ['live', id], queryFn: () => liveApi.get(id), refetchInterval: 15_000 });

  const join = useMutation({
    mutationFn: () => liveApi.join(id),
    onSuccess: (res) => {
      setJoined(true);
      setWatchedSec(res.presence.watchedSec);
      setError(null);
      if (res.meetingUrl) window.open(res.meetingUrl, '_blank', 'noopener,noreferrer');
      qc.invalidateQueries({ queryKey: ['live', id] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not join'),
  });

  const leave = useMutation({
    mutationFn: () => liveApi.leave(id),
    onSuccess: () => {
      setJoined(false);
      if (timer.current) clearInterval(timer.current);
      qc.invalidateQueries({ queryKey: ['live', id] });
    },
  });

  const end = useMutation({
    mutationFn: () => liveApi.end(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['live', id] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not end class'),
  });

  useEffect(() => {
    if (!joined) return;
    timer.current = setInterval(() => {
      liveApi
        .heartbeat(id, 30)
        .then((r) => setWatchedSec(r.watchedSec))
        .catch(() => undefined);
    }, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [joined, id]);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Live class not found.</Alert>;
  const c = q.data;
  const mins = Math.floor(watchedSec / 60);
  const secs = watchedSec % 60;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/live" className="text-sm font-semibold text-brand-500">
        ← Live classes
      </Link>

      <div className="relative overflow-hidden rounded-card border border-hair bg-grad-holo p-6 text-white shadow-card">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-white/70">Live class</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{c.title}</h1>
            <p className="mt-2 text-sm text-white/80">
              {c.batch?.course?.title ?? 'Course'} · {c.batch?.name ?? 'Batch'}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {formatDate(c.startsAt)} · {formatTime(c.startsAt)} – {formatTime(c.endsAt)}
            </p>
          </div>
          <Badge tone={c.status === 'LIVE' ? 'success' : c.status === 'ENDED' ? 'neutral' : 'brand'}>
            {c.status}
          </Badge>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-brand-500" aria-hidden />
            <h2 className="font-display font-bold">Google Meet</h2>
          </div>
          {c.meetingUrl ? (
            <a
              href={c.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm font-semibold text-brand-600 hover:underline"
            >
              {c.meetingUrl}
            </a>
          ) : (
            <p className="text-sm text-faint">No meeting link yet.</p>
          )}
          {c.description && <p className="text-sm text-faint">{c.description}</p>}

          <div className="flex flex-wrap gap-2">
            {!joined && c.status !== 'ENDED' && c.status !== 'CANCELLED' && (
              <Button onClick={() => join.mutate()} loading={join.isPending}>
                <Radio className="mr-1.5 h-4 w-4" aria-hidden />
                Join live class
              </Button>
            )}
            {joined && (
              <Button variant="secondary" onClick={() => leave.mutate()} loading={leave.isPending}>
                <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
                Leave
              </Button>
            )}
            {c.meetingUrl && (
              <Button
                variant="secondary"
                onClick={() => window.open(c.meetingUrl!, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                Open Meet
              </Button>
            )}
            {canEnd && c.status !== 'ENDED' && (
              <Button variant="secondary" onClick={() => end.mutate()} loading={end.isPending}>
                <Square className="mr-1.5 h-4 w-4" aria-hidden />
                End & mark attendance
              </Button>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-accent-500" aria-hidden />
            <h2 className="font-display font-bold">Your watch time</h2>
          </div>
          <div className="font-display text-4xl font-extrabold tracking-tight text-brand-600">
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
          <p className="text-xs text-faint">
            Attendance is scored from watch time: ≥75% present · ≥40% late · otherwise absent.
          </p>
          {joined && (
            <p className="rounded-panel bg-success/10 px-3 py-2 text-xs font-semibold text-emerald-700">
              Presence active — keep this tab open while you attend.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
