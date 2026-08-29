'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  TrendingUp,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  CalendarCheck,
} from 'lucide-react';
import { Card, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { useAuth } from '@/lib/auth-context';
import { formatTime, formatDate } from '@/lib/format';
import { StatTile, ProgressBar } from './stat-tile';
import { BarsChart, DonutChart, CHART_COLORS } from './charts';
import { DashboardHero, HeroPanel, todayLabel } from './dashboard-hero';

export function TrainerDashboard({ firstName }: { firstName: string }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['dashboard', 'trainer'], queryFn: dashboardApi.trainer });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load your dashboard.</Alert>;
  const d = q.data;

  const progressByBatch = d.batches.map((b) => ({
    batch: b.name.length > 14 ? `${b.name.slice(0, 13)}…` : b.name,
    Progress: b.avgProgress,
  }));
  const studentsByBatch = d.batches.map((b, i) => ({
    name: b.name,
    value: b.studentCount,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const nextSession = d.upcomingSessions[0];

  /**
   * A batch manager lands on this same dashboard — the batches, students and
   * attendance on it are exactly their job. The shortcuts were not: they were
   * offered "Create assignment" and "New test", neither of which their role can
   * do, so the buttons led to a refusal.
   */
  const can = (perm: string) => user?.permissions.includes(perm) ?? false;
  const isTeaching = can('assignment:create') || can('assessment:create');
  const actions = [
    ...(can('assignment:create')
      ? [{ label: 'Create assignment', href: '/assignments', icon: ClipboardList, primary: true }]
      : []),
    ...(can('assessment:create')
      ? [{ label: 'New test', href: '/assessments', icon: FileCheck2 }]
      : []),
    ...(can('batch:create')
      ? [{ label: 'New batch', href: '/batches', icon: Users, primary: !isTeaching }]
      : []),
    ...(can('attendance:mark')
      ? [{ label: 'Mark attendance', href: '/attendance', icon: CalendarCheck }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow={isTeaching ? 'Trainer dashboard' : 'Batch dashboard'}
        title="Welcome back,"
        highlight={firstName}
        suffix="👋"
        subtitle={`${todayLabel()} · ${d.stats.totalBatches} batch${d.stats.totalBatches === 1 ? '' : 'es'} · ${d.stats.totalStudents} students in your care`}
        actions={actions}
      >
        <HeroPanel title="Next session">
          {nextSession ? (
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-white/15">
                <CalendarClock className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{nextSession.title}</div>
                <div className="text-xs text-white/70">
                  {formatDate(nextSession.startsAt)} · {formatTime(nextSession.startsAt)}
                </div>
                <div className="truncate text-xs text-white/60">{nextSession.batch.name}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-white/70">No upcoming sessions scheduled.</p>
          )}
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Batches" value={d.stats.totalBatches} icon={Users} accent="violet" />
        <StatTile
          label="Students"
          value={d.stats.totalStudents}
          icon={GraduationCap}
          accent="aqua"
        />
        <StatTile
          label="Avg progress"
          value={`${d.stats.avgProgress}%`}
          icon={TrendingUp}
          accent="pink"
        />
      </div>

      {d.batches.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h2 className="mb-2 font-display font-bold">Batch progress</h2>
            <BarsChart
              data={progressByBatch}
              xKey="batch"
              bars={[{ key: 'Progress', color: '#f97316' }]}
              yMax={100}
              height={220}
            />
          </Card>
          <Card>
            <h2 className="font-display font-bold">Students per batch</h2>
            <DonutChart data={studentsByBatch} height={200} centerSub="students" />
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-display font-bold">My batches</h2>
          {d.batches.length === 0 ? (
            <Card>
              <p className="text-sm text-faint">
                You aren&apos;t assigned to any batch yet. Assigned batches appear here.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {d.batches.map((b) => (
                <Link key={b.id} href={`/batches/${b.id}`}>
                  <Card className="transition hover:border-brand-300">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{b.name}</div>
                        <div className="text-xs text-faint">{b.courseTitle}</div>
                      </div>
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar percent={b.avgProgress} />
                      <span className="w-10 text-right text-sm font-semibold">
                        {b.avgProgress}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-faint">{b.studentCount} students</div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display font-bold">Upcoming sessions</h2>
          <Card>
            {d.upcomingSessions.length === 0 ? (
              <p className="text-sm text-faint">No sessions scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.upcomingSessions.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-panel border-l-4 border-aqua-400 bg-chip py-1.5 pl-3 pr-2"
                  >
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-xs text-faint">
                      {formatDate(s.startsAt)} · {formatTime(s.startsAt)}
                    </div>
                    <div className="text-xs text-faint">{s.batch.name}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
