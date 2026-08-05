'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Flame,
  Plus,
  Radio,
  Users,
  CheckCircle2,
  XCircle,
  Clock3,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { attendanceApi } from '@/lib/lms-learning-api';
import { liveApi } from '@/lib/live-api';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { DonutChart } from '@/components/charts';

export default function AttendancePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AttendanceInner />
    </Suspense>
  );
}

function AttendanceInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const batchId = params.get('batchId');
  const canMark = user?.permissions.includes('attendance:mark');

  if (canMark && batchId) return <StaffAttendance batchId={batchId} />;
  return <StudentAttendance />;
}

function statusVisual(status: string) {
  switch (status) {
    case 'PRESENT':
      return {
        icon: CheckCircle2,
        chip: 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300',
        bar: 'bg-emerald-500',
        label: 'Present',
      };
    case 'LATE':
      return {
        icon: Clock3,
        chip: 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300',
        bar: 'bg-amber-500',
        label: 'Late',
      };
    case 'EXCUSED':
      return {
        icon: ShieldCheck,
        chip: 'bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/25 dark:text-sky-300',
        bar: 'bg-sky-500',
        label: 'Excused',
      };
    default:
      return {
        icon: XCircle,
        chip: 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300',
        bar: 'bg-rose-500',
        label: 'Absent',
      };
  }
}

function StaffAttendance({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(() => `Session · ${todayLabel()}`);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['attendance', 'sessions', batchId],
    queryFn: () => attendanceApi.listSessions(batchId),
  });

  const create = useMutation({
    mutationFn: () => attendanceApi.createSession(batchId, title.trim() || 'Session'),
    onSuccess: () => {
      setError(null);
      setTitle(`Session · ${todayLabel()}`);
      qc.invalidateQueries({ queryKey: ['attendance', 'sessions', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const sessions = listQ.data ?? [];
  const openCount = sessions.filter((s) => s.status === 'OPEN').length;
  const closedCount = sessions.filter((s) => s.status === 'CLOSED').length;

  if (listQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Trainer tools"
        title="Batch"
        highlight="attendance"
        subtitle={`${todayLabel()} · open a session, mark the roll, keep the cohort on track.`}
        actions={[
          { label: 'Back to batch', href: `/batches/${batchId}`, icon: Layers },
          { label: 'Live classes', href: '/live', icon: Radio },
        ]}
      >
        <HeroPanel title="Session pulse">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{sessions.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Total</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold text-accent-300">{openCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Open</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{closedCount}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Closed</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <Card className="relative overflow-hidden border-hair bg-panel">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-grad-aqua opacity-20 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-grad-holo text-white shadow-glow">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <h2 className="font-display text-lg font-bold">Open a new roll call</h2>
            </div>
            <p className="text-sm text-faint">
              Create today&apos;s session — then tap in to mark present, late, or excused in one pass.
            </p>
            {error && (
              <Alert tone="error" className="mt-3">
                {error}
              </Alert>
            )}
            <div className="mt-3">
              <Field label="Session title">
                {({ id }) => (
                  <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />
                )}
              </Field>
            </div>
          </div>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            className="shrink-0 bg-grad-holo text-white shadow-glow"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Create session
          </Button>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Sessions</h2>
          <span className="text-xs font-semibold text-faint">{sessions.length} total</span>
        </div>
        {sessions.length === 0 ? (
          <Card className="border-dashed py-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/artwork/mascot-attendance.png"
              alt=""
              className="att-mascot mx-auto h-28 w-auto object-contain"
              aria-hidden
            />
            <p className="mt-2 font-semibold">No sessions yet</p>
            <p className="text-sm text-faint">Create the first roll call for this batch.</p>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/attendance/${s.id}?batchId=${batchId}`}
                  className={cn(
                    'group relative flex h-full flex-col overflow-hidden rounded-card border border-hair bg-panel p-4 shadow-card transition',
                    'hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-glow',
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 h-1',
                      s.status === 'OPEN' ? 'bg-grad-mint' : 'bg-chip',
                    )}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display font-bold group-hover:text-brand-600">{s.title}</div>
                      <div className="mt-0.5 text-xs text-faint">{formatDate(s.sessionDate)}</div>
                    </div>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs font-semibold text-faint">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {s._count?.records ?? 0} marked
                    </span>
                    <span className="inline-flex items-center gap-1 text-brand-600 opacity-0 transition group-hover:opacity-100">
                      Mark roll <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StudentAttendance() {
  const [reason, setReason] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const qc = useQueryClient();

  const mineQ = useQuery({
    queryKey: ['attendance', 'me'],
    queryFn: () => attendanceApi.mine(),
  });
  const streakQ = useQuery({
    queryKey: ['streak'],
    queryFn: () => liveApi.streak(),
  });

  const correct = useMutation({
    mutationFn: () =>
      attendanceApi.requestCorrection(recordId!, 'PRESENT', reason.trim() || 'I was present'),
    onSuccess: () => {
      setRecordId(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['attendance', 'me'] });
    },
  });

  const d = mineQ.data;
  const rate = d?.summary.rate ?? 0;
  const present = d?.summary.present ?? 0;
  const late = d?.summary.late ?? 0;
  const absent = d?.summary.absent ?? 0;
  const excused = d?.summary.excused ?? 0;
  const total = d?.summary.total ?? 0;
  const streak = streakQ.data?.currentStreak ?? 0;
  const longest = streakQ.data?.longestStreak ?? 0;

  const donut = useMemo(
    () => [
      { name: 'Present', value: present, color: '#10b981' },
      { name: 'Late', value: late, color: '#f59e0b' },
      { name: 'Absent', value: absent, color: '#f43f5e' },
      { name: 'Excused', value: excused, color: '#0ea5e9' },
    ].filter((x) => x.value > 0),
    [present, late, absent, excused],
  );

  if (mineQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Your presence"
        title="Attendance"
        highlight="streak"
        subtitle={`${todayLabel()} · show up, stay consistent, keep the fire going.`}
        actions={[{ label: 'Live classes', href: '/live', icon: Radio, primary: true }]}
      >
        <HeroPanel title="At a glance">
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="url(#attGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(100, rate)} ${100 - Math.min(100, rate)}`}
                  pathLength={100}
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#fb923c" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute font-display text-lg font-extrabold">{rate}%</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Show-up rate</div>
              <div className="truncate text-sm font-semibold text-white/90">
                {present + late} of {total} sessions counted
              </div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-500/90 px-2 py-0.5 text-xs font-bold">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                {streak}-day streak
              </div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatPill label="Present" value={present} accent="bg-emerald-500" icon={CheckCircle2} />
        <StatPill label="Late" value={late} accent="bg-amber-500" icon={Clock3} />
        <StatPill label="Absent" value={absent} accent="bg-rose-500" icon={XCircle} />
        <StatPill
          label="Streak"
          value={`${streak}d`}
          sub={longest ? `best ${longest}d` : undefined}
          accent="bg-grad-sunset"
          icon={Flame}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="relative flex flex-col overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-accent-400/25 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/artwork/mascot-attendance.png"
            alt=""
            className="pointer-events-none absolute -bottom-2 -right-2 h-24 w-24 object-contain opacity-90 drop-shadow-md sm:h-28 sm:w-28"
            aria-hidden
          />
          <h2 className="relative font-display font-bold">Mix</h2>
          {total === 0 ? (
            <p className="relative py-8 text-center text-sm text-faint">
              No records yet — your first session will light this up.
            </p>
          ) : (
            <DonutChart
              height={200}
              centerLabel={`${rate}%`}
              centerSub="attendance"
              data={
                donut.length
                  ? donut
                  : [{ name: 'None', value: 1, color: '#e7eefb' }]
              }
            />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold">Session timeline</h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-faint">
              <Sparkles className="h-3.5 w-3.5 text-accent-500" aria-hidden />
              Newest first
            </span>
          </div>
          {(d?.records ?? []).length === 0 ? (
            <div className="rounded-panel border border-dashed border-hair px-4 py-8 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/artwork/mascot-attendance.png"
                alt=""
                className="att-mascot mx-auto h-24 w-auto object-contain"
                aria-hidden
              />
              <p className="mt-2 text-sm font-semibold">Waiting for your first check-in</p>
              <p className="text-xs text-faint">Join a live class or wait for your trainer to open a session.</p>
            </div>
          ) : (
            <ol className="relative flex flex-col gap-0 border-l border-hair pl-4">
              {(d?.records ?? []).map((r) => {
                const v = statusVisual(r.status);
                const Icon = v.icon;
                return (
                  <li key={r.id} className="relative pb-4 last:pb-0">
                    <span
                      className={cn(
                        'absolute -left-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow',
                        v.bar,
                      )}
                    >
                      <Icon className="h-3 w-3" aria-hidden />
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-hair bg-chip/40 px-3 py-2.5 transition hover:bg-chip">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{r.session.title}</div>
                        <div className="text-xs text-faint">{formatDate(r.session.sessionDate)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', v.chip)}>
                          {v.label}
                        </span>
                        {r.status === 'ABSENT' && (
                          <Button size="sm" variant="secondary" onClick={() => setRecordId(r.id)}>
                            Fix this
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {recordId && (
        <Card className="relative overflow-hidden border-accent-200">
          <div className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-accent-400/20 blur-2xl" />
          <h2 className="font-display font-bold">Request a correction</h2>
          <p className="mt-1 text-sm text-faint">
            Tell your trainer why this session should be marked present. They&apos;ll review it.
          </p>
          <textarea
            className="mt-3 min-h-24 w-full rounded-panel border border-hair bg-panel p-3 text-sm outline-none ring-brand-400 focus:ring-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="I joined the Meet but was marked absent…"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => correct.mutate()} loading={correct.isPending}>
              Submit request
            </Button>
            <Button variant="secondary" onClick={() => setRecordId(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatPill({
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
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-hair bg-panel p-3.5 shadow-card transition hover:-translate-y-0.5">
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-panel text-white', accent)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
        <div className="font-display text-xl font-extrabold leading-none">{value}</div>
        {sub && <div className="text-[11px] font-semibold text-faint">{sub}</div>}
      </div>
    </div>
  );
}
