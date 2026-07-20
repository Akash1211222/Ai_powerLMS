'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { formatTime, formatDate } from '@/lib/format';
import { StatTile, ProgressBar, ProgressRing } from './stat-tile';
import { IconBook, IconCheck, IconTrophy, IconCalendar } from './icons';
import { PerformanceCard } from './performance-card';
import { RecoveryPlanCard } from './recovery-plan-card';
import { RecommendationsCard } from './recommendations-card';
import { PlacementReadinessCard } from './placement-readiness-card';

export function StudentDashboard({ firstName }: { firstName: string }) {
  const q = useQuery({ queryKey: ['dashboard', 'student'], queryFn: dashboardApi.student });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load your dashboard.</Alert>;
  const d = q.data;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-500 to-brand-800 p-7 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative max-w-md">
            <h1 className="text-2xl font-extrabold leading-tight">Welcome back, {firstName} 👋</h1>
            <p className="mt-2 text-sm text-white/85">
              You&apos;re {d.stats.avgProgress}% through your courses. Keep the streak going and
              sharpen your skills today.
            </p>
            <Link
              href="/courses"
              className="mt-4 inline-flex items-center gap-1 rounded-panel bg-white px-4 py-2 text-sm font-bold text-brand-600 transition hover:bg-white/90"
            >
              Continue learning →
            </Link>
          </div>
        </div>

        <RecoveryPlanCard />

        <RecommendationsCard />

        {/* Stat tiles */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Active courses" value={d.stats.activeCourses} icon={<IconBook width={18} height={18} />} />
          <StatTile
            label="Attendance"
            value={`${d.stats.attendanceRate}%`}
            icon={<IconCheck width={18} height={18} />}
            iconClass="bg-success/10 text-success"
          />
          <StatTile
            label="Lessons done"
            value={d.stats.completedLessons}
            icon={<IconTrophy width={18} height={18} />}
            iconClass="bg-warning/10 text-warning"
          />
        </div>

        {/* Courses */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">My courses</h2>
            <Link href="/courses" className="text-sm font-semibold text-brand-500">
              View all
            </Link>
          </div>
          {d.enrollments.length === 0 ? (
            <Card>
              <p className="text-sm text-faint">
                You&apos;re not enrolled in any course yet. Once a batch manager adds you, it shows up
                here.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {d.enrollments.map((e) => (
                <Card key={e.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">{e.course.title}</div>
                      {e.batch && <div className="text-xs text-faint">{e.batch.name}</div>}
                    </div>
                    <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar percent={e.progress?.percent ?? 0} />
                    <span className="w-10 text-right text-sm font-semibold">{e.progress?.percent ?? 0}%</span>
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    {e.progress?.completedLessons ?? 0} / {e.progress?.totalLessons ?? 0} lessons
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right rail */}
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col items-center">
          <h2 className="mb-3 self-start font-bold">Overall progress</h2>
          <ProgressRing percent={d.stats.avgProgress} label="across courses" />
          <div className="mt-4 w-full text-center text-xs text-faint">
            {d.stats.upcomingSessions} upcoming session{d.stats.upcomingSessions === 1 ? '' : 's'}
          </div>
        </Card>

        <PerformanceCard />

        <PlacementReadinessCard />

        <div>
          <div className="mb-3 flex items-center gap-2">
            <IconCalendar width={18} height={18} className="text-brand-500" />
            <h2 className="font-bold">Upcoming</h2>
          </div>
          <Card>
            {d.upcomingSessions.length === 0 ? (
              <p className="text-sm text-faint">No sessions scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.upcomingSessions.map((s) => (
                  <li key={s.id} className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-panel bg-chip text-brand-600">
                      <span className="text-[10px] font-bold uppercase">
                        {new Date(s.startsAt).toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                      <span className="text-base font-extrabold leading-none">
                        {new Date(s.startsAt).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{s.title}</div>
                      <div className="text-xs text-faint">
                        {formatDate(s.startsAt)} · {formatTime(s.startsAt)}
                      </div>
                      <div className="truncate text-xs text-faint">{s.batch.name}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Link href="/calendar" className="mt-3 inline-block text-sm font-semibold text-brand-500">
            Open calendar →
          </Link>
        </div>
      </div>
    </div>
  );
}
