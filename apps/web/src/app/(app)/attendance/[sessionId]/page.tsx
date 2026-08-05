'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Save,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, Button, Badge, statusTone, Spinner, Alert, cn } from '@fca/ui';
import { attendanceApi } from '@/lib/lms-learning-api';
import { batchesApi } from '@/lib/lms-api';
import { formatDate } from '@/lib/format';
import { DashboardHero, HeroPanel } from '@/components/dashboard-hero';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

const STATUS_META: Record<
  Status,
  { label: string; short: string; active: string; idle: string; icon: typeof CheckCircle2 }
> = {
  PRESENT: {
    label: 'Present',
    short: 'P',
    active: 'bg-emerald-500 text-white shadow-md ring-2 ring-emerald-500/30',
    idle: 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20',
    icon: CheckCircle2,
  },
  LATE: {
    label: 'Late',
    short: 'L',
    active: 'bg-amber-500 text-white shadow-md ring-2 ring-amber-500/30',
    idle: 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20',
    icon: Clock3,
  },
  EXCUSED: {
    label: 'Excused',
    short: 'E',
    active: 'bg-sky-500 text-white shadow-md ring-2 ring-sky-500/30',
    idle: 'bg-sky-500/10 text-sky-700 hover:bg-sky-500/20',
    icon: ShieldCheck,
  },
  ABSENT: {
    label: 'Absent',
    short: 'A',
    active: 'bg-rose-500 text-white shadow-md ring-2 ring-rose-500/30',
    idle: 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/20',
    icon: XCircle,
  },
};

export default function AttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const search = useSearchParams();
  const batchId = search.get('batchId');
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');

  const sessionQ = useQuery({
    queryKey: ['attendance', 'session', sessionId],
    queryFn: () => attendanceApi.getSession(sessionId),
  });

  const studentsQ = useQuery({
    queryKey: ['batch', batchId, 'students'],
    queryFn: () =>
      batchesApi.students(batchId!) as Promise<
        Array<{
          user: {
            id: string;
            email: string;
            profile: { firstName: string; lastName: string } | null;
          };
        }>
      >,
    enabled: Boolean(batchId),
  });

  useEffect(() => {
    if (!sessionQ.data) return;
    const next: Record<string, Status> = {};
    for (const r of sessionQ.data.records) {
      next[r.studentId] = r.status;
    }
    for (const s of studentsQ.data ?? []) {
      if (!next[s.user.id]) next[s.user.id] = 'ABSENT';
    }
    setMarks(next);
  }, [sessionQ.data, studentsQ.data]);

  const mark = useMutation({
    mutationFn: () =>
      attendanceApi.mark(
        sessionId,
        Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', 'session', sessionId] }),
  });

  const session = sessionQ.data;
  const students = studentsQ.data ?? [];
  const rows = useMemo(() => {
    const base =
      students.length > 0
        ? students.map((s) => ({
            id: s.user.id,
            email: s.user.email,
            name: s.user.profile
              ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
              : s.user.email,
          }))
        : (session?.records ?? []).map((r) => ({
            id: r.studentId,
            email: r.student.email,
            name: r.student.profile
              ? `${r.student.profile.firstName} ${r.student.profile.lastName}`
              : r.student.email,
          }));
    if (filter === 'ALL') return base;
    return base.filter((r) => (marks[r.id] ?? 'ABSENT') === filter);
  }, [students, session, marks, filter]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 };
    for (const status of Object.values(marks)) {
      c[status] += 1;
      c.total += 1;
    }
    return c;
  }, [marks]);

  const presentRate = counts.total
    ? Math.round(((counts.PRESENT + counts.LATE) / counts.total) * 100)
    : 0;

  if (sessionQ.isLoading) return <Spinner />;
  if (!session) return <Alert tone="error">Session not found.</Alert>;

  const markAll = (status: Status) => {
    setMarks((prev) => {
      const merged = { ...prev };
      const ids =
        students.length > 0
          ? students.map((s) => s.user.id)
          : (session.records ?? []).map((r) => r.studentId);
      for (const id of ids) merged[id] = status;
      return merged;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={batchId ? `/attendance?batchId=${batchId}` : '/attendance'}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-500 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Attendance
      </Link>

      <DashboardHero
        eyebrow="Roll call"
        title={session.title}
        highlight={session.status === 'OPEN' ? 'live' : undefined}
        subtitle={`${formatDate(session.sessionDate)} · tap a status chip per student, then save.`}
      >
        <HeroPanel title="Room rate">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-3xl font-extrabold">{presentRate}%</div>
              <div className="text-xs text-white/70">
                {counts.PRESENT + counts.LATE}/{counts.total || '—'} in seat
              </div>
            </div>
            <Badge tone={statusTone(session.status)}>{session.status}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-grad-mint transition-all duration-500"
              style={{ width: `${presentRate}%` }}
            />
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-3 sm:grid-cols-4">
        {(Object.keys(STATUS_META) as Status[]).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(filter === s ? 'ALL' : s)}
              className={cn(
                'flex items-center gap-3 rounded-card border bg-panel p-3 text-left shadow-card transition',
                filter === s ? 'border-brand-400 ring-2 ring-brand-400/20' : 'border-hair hover:-translate-y-0.5',
              )}
            >
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-panel text-white', meta.active.split(' ')[0])}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{meta.label}</div>
                <div className="font-display text-xl font-extrabold leading-none">{counts[s]}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold">Mark the room</h2>
            <p className="text-sm text-faint">
              {filter === 'ALL' ? 'All students' : `Filtered: ${STATUS_META[filter].label}`} ·{' '}
              {rows.length} shown
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => markAll('PRESENT')}>
              <Zap className="mr-1 h-3.5 w-3.5" aria-hidden />
              All present
            </Button>
            <Button size="sm" variant="secondary" onClick={() => markAll('ABSENT')}>
              All absent
            </Button>
            <Button
              onClick={() => mark.mutate()}
              loading={mark.isPending}
              disabled={counts.total === 0}
              className="bg-grad-holo text-white shadow-glow"
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden />
              Save marks
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-panel border border-dashed border-hair px-4 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-brand-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold">No students to show</p>
            <p className="text-xs text-faint">
              {filter === 'ALL' ? 'This batch has no enrolled students.' : 'Clear the status filter to see everyone.'}
            </p>
            {filter !== 'ALL' && (
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setFilter('ALL')}>
                Show all
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const status = marks[r.id] ?? 'ABSENT';
              const initials = r.name
                .split(/\s+/)
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-panel border border-hair bg-chip/30 px-3 py-3 transition hover:bg-chip sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grad-aqua text-xs font-extrabold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{r.name}</div>
                      <div className="truncate text-xs text-faint">{r.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_META) as Status[]).map((s) => {
                      const meta = STATUS_META[s];
                      const active = status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          title={meta.label}
                          onClick={() => setMarks({ ...marks, [r.id]: s })}
                          className={cn(
                            'inline-flex min-w-[2.5rem] items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition',
                            active ? meta.active : meta.idle,
                          )}
                        >
                          {meta.short}
                          <span className="hidden sm:inline">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {mark.isSuccess && (
          <Alert tone="success" className="mt-4">
            Attendance saved for this session.
          </Alert>
        )}
      </Card>
    </div>
  );
}
