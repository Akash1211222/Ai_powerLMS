'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Radio, Flame, BarChart3 } from 'lucide-react';
import { Card, Badge, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { liveApi } from '@/lib/live-api';
import { formatDate, formatTime } from '@/lib/format';

export default function LiveHubPage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const canReport = user?.permissions.includes('student:view');

  const upcoming = useQuery({ queryKey: ['live', 'upcoming'], queryFn: liveApi.upcoming });
  const streak = useQuery({ queryKey: ['streak'], queryFn: liveApi.streak });
  const reports = useQuery({
    queryKey: ['live', 'reports', org?.id],
    queryFn: () => liveApi.reports(org!.id),
    enabled: Boolean(canReport && org?.id),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-card border border-hair bg-grad-holo p-6 text-white shadow-card">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="eyebrow text-white/70">Live learning</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Classes & streaks</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            Join Google Meet sessions, earn attendance from watch time, and keep your streak alive.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-sunset text-white">
            <Flame className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Current streak</div>
            <div className="font-display text-2xl font-extrabold">
              {streak.data?.currentStreak ?? 0}
              <span className="text-sm font-semibold text-faint"> days</span>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-aqua text-white">
            <Flame className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Longest streak</div>
            <div className="font-display text-2xl font-extrabold">
              {streak.data?.longestStreak ?? 0}
              <span className="text-sm font-semibold text-faint"> days</span>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-holo text-white">
            <Radio className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Upcoming</div>
            <div className="font-display text-2xl font-extrabold">{upcoming.data?.length ?? 0}</div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-display font-bold">Your upcoming live classes</h2>
        {upcoming.isLoading ? (
          <Spinner />
        ) : upcoming.isError ? (
          <Alert tone="error">Could not load live classes.</Alert>
        ) : (upcoming.data ?? []).length === 0 ? (
          <p className="text-sm text-faint">No upcoming live classes. Check back when your trainer schedules one.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.data!.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/live/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hair bg-chip px-3 py-3 transition hover:bg-brand-50"
                >
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-xs text-faint">
                      {c.batch?.course?.title} · {c.batch?.name} · {formatDate(c.startsAt)}{' '}
                      {formatTime(c.startsAt)}
                    </div>
                  </div>
                  <Badge tone={c.status === 'LIVE' ? 'success' : 'brand'}>{c.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canReport && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-500" aria-hidden />
            <h2 className="font-display font-bold">Live attendance reports</h2>
          </div>
          <p className="mb-3 text-sm text-faint">
            Shared with teachers, college admins, and placement — auto-generated when a class ends.
          </p>
          {reports.isLoading ? (
            <Spinner />
          ) : (reports.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">No live-class reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reports.data!.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hair px-3 py-2.5"
                >
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-xs text-faint">
                      {r.batch.name} · {formatDate(r.startsAt)} · {r.joinedCount} joined · avg watch{' '}
                      {r.avgWatchPercent}%
                    </div>
                  </div>
                  <Link href={`/live/${r.id}`} className="text-sm font-bold text-brand-600 hover:underline">
                    Details →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
