'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { formatTime, formatDate } from '@/lib/format';
import { StatTile, ProgressBar } from './stat-tile';
import { AtRiskCard } from './at-risk-card';

export function TrainerDashboard({ firstName }: { firstName: string }) {
  const q = useQuery({ queryKey: ['dashboard', 'trainer'], queryFn: dashboardApi.trainer });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load your dashboard.</Alert>;
  const d = q.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome, {firstName} 👋</h1>
        <p className="mt-1 text-faint">Your batches and sessions.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Batches" value={d.stats.totalBatches} />
        <StatTile label="Students" value={d.stats.totalStudents} />
        <StatTile label="Avg progress" value={`${d.stats.avgProgress}%`} />
      </div>

      <AtRiskCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-bold">My batches</h2>
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
                      <span className="w-10 text-right text-sm font-semibold">{b.avgProgress}%</span>
                    </div>
                    <div className="mt-1 text-xs text-faint">{b.studentCount} students</div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-bold">Upcoming sessions</h2>
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
        </div>
      </div>
    </div>
  );
}
