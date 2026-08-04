'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  BookOpen,
  Layers,
  Briefcase,
  Award,
  UserPlus,
} from 'lucide-react';
import { Card, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { useActiveOrg } from '@/lib/use-active-org';
import { StatTile } from './stat-tile';
import { DonutChart, RadialGauge, CHART_COLORS } from './charts';
import { DashboardHero, HeroPanel, todayLabel } from './dashboard-hero';

export function AdminDashboard({ firstName }: { firstName: string }) {
  const { org } = useActiveOrg();
  const q = useQuery({
    queryKey: ['dashboard', 'admin', org?.id],
    queryFn: () => dashboardApi.admin(org!.id),
    enabled: Boolean(org?.id),
  });

  if (!org || q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load admin dashboard.</Alert>;
  const d = q.data;

  const batchComposition = d.activeBatches.map((b, i) => ({
    name: b.name,
    value: b.studentCount,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="College overview"
        title="Welcome back,"
        highlight={firstName}
        suffix="👋"
        subtitle={`${todayLabel()} · ${org.name} — org-wide academics and placement at a glance`}
        actions={[
          { label: 'Manage members', href: '/admin', icon: UserPlus, primary: true },
          { label: 'Batches', href: '/batches', icon: Layers },
          { label: 'Courses', href: '/courses', icon: BookOpen },
        ]}
      >
        <HeroPanel title="Placement snapshot">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="flex items-center justify-center gap-1.5 font-display text-lg font-extrabold">
                <Briefcase className="h-4 w-4 text-accent-300" aria-hidden />
                {d.stats.openJobs}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">
                Open jobs
              </div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="flex items-center justify-center gap-1.5 font-display text-lg font-extrabold">
                <Award className="h-4 w-4 text-accent-300" aria-hidden />
                {d.stats.placed}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">
                Students placed
              </div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Members" value={d.stats.members} icon={Users} accent="violet" />
        <StatTile label="Active students" value={d.stats.activeStudents} icon={GraduationCap} accent="pink" />
        <StatTile label="Courses" value={d.stats.courses} icon={BookOpen} accent="aqua" />
        <StatTile label="Batches" value={d.stats.batches} icon={Layers} accent="mint" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-3 py-6">
          <h2 className="font-display font-bold">Avg progress</h2>
          <RadialGauge percent={d.stats.avgProgress} label="course progress" color="#2563eb" />
        </Card>
        <Card className="flex flex-col items-center justify-center gap-3 py-6">
          <h2 className="font-display font-bold">Attendance</h2>
          <RadialGauge percent={d.stats.attendanceRate} label="org-wide" color="#f97316" />
        </Card>
        <Card>
          <h2 className="font-display font-bold">Students per batch</h2>
          {batchComposition.length === 0 ? (
            <p className="mt-2 text-sm text-faint">No active batches.</p>
          ) : (
            <DonutChart data={batchComposition} height={200} centerSub="students" />
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-display font-bold">Active batches</h2>
        {d.activeBatches.length === 0 ? (
          <p className="text-sm text-faint">No active batches.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {d.activeBatches.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-panel bg-chip px-3 py-2">
                <div>
                  <Link href={`/batches/${b.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                    {b.name}
                  </Link>
                  <div className="text-xs text-faint">{b.courseTitle}</div>
                </div>
                <span className="text-sm font-semibold">{b.studentCount} students</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
