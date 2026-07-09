'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { formatTime, formatDate } from '@/lib/format';
import { StatTile, ProgressBar } from './stat-tile';

export function StudentDashboard({ firstName }: { firstName: string }) {
  const q = useQuery({ queryKey: ['dashboard', 'student'], queryFn: dashboardApi.student });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load your dashboard.</Alert>;
  const d = q.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome, {firstName} 👋</h1>
        <p className="mt-1 text-faint">Here&apos;s your learning at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active courses" value={d.stats.activeCourses} />
        <StatTile label="Avg progress" value={`${d.stats.avgProgress}%`} />
        <StatTile label="Lessons completed" value={d.stats.completedLessons} />
        <StatTile label="Upcoming sessions" value={d.stats.upcomingSessions} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-bold">My courses</h2>
          {d.enrollments.length === 0 ? (
            <Card>
              <p className="text-sm text-faint">
                You&apos;re not enrolled in any course yet. Once a batch manager adds you, it shows
                up here.
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
                    <span className="w-10 text-right text-sm font-semibold">
                      {e.progress?.percent ?? 0}%
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    {e.progress?.completedLessons ?? 0} / {e.progress?.totalLessons ?? 0} lessons
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-bold">Upcoming</h2>
          <Card>
            {d.upcomingSessions.length === 0 ? (
              <p className="text-sm text-faint">No sessions scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.upcomingSessions.map((s) => (
                  <li key={s.id} className="border-l-2 border-brand-400 pl-3">
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
          <div className="mt-3">
            <Link href="/courses" className="text-sm font-semibold text-brand-500">
              Browse courses →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
