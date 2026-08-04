'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, FileText, Award, Percent, UserSearch, PlusCircle } from 'lucide-react';
import { Card, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { dashboardApi } from '@/lib/dashboard-api';
import { useActiveOrg } from '@/lib/use-active-org';
import { StatTile } from './stat-tile';
import { DonutChart, BarsChart, RadialGauge, CHART_COLORS } from './charts';
import { DashboardHero, HeroPanel, todayLabel } from './dashboard-hero';

export function PlacementDashboard({ firstName }: { firstName: string }) {
  const { org } = useActiveOrg();
  const q = useQuery({
    queryKey: ['dashboard', 'placement', org?.id],
    queryFn: () => dashboardApi.placement(org!.id),
    enabled: Boolean(org?.id),
  });

  if (!org || q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load placement dashboard.</Alert>;
  const d = q.data;

  const funnelData = Object.entries(d.funnel)
    .filter(([, count]) => count > 0)
    .map(([status, count], i) => ({
      name: status,
      value: count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  const funnelBars = Object.entries(d.funnel).map(([status, count]) => ({
    stage: status.length > 9 ? `${status.slice(0, 8)}…` : status,
    Applications: count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Placement cell"
        title="Welcome back,"
        highlight={firstName}
        suffix="👋"
        subtitle={`${todayLabel()} · ${org.name} · ${d.stats.openJobs} open role${d.stats.openJobs === 1 ? '' : 's'} · ${d.stats.studentsLooking} students actively looking`}
        actions={[
          { label: 'Post a job', href: '/opportunities', icon: PlusCircle, primary: true },
          { label: 'Manage pipeline', href: '/opportunities', icon: Briefcase },
        ]}
      >
        <HeroPanel title="Snapshot">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{d.stats.placed}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Placed</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{d.stats.placementRate}%</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Rate</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{d.stats.studentsLooking}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Looking</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open jobs" value={d.stats.openJobs} icon={Briefcase} accent="violet" />
        <StatTile label="Applications" value={d.stats.totalApplications} icon={FileText} accent="pink" />
        <StatTile label="Placed" value={d.stats.placed} icon={Award} accent="mint" />
        <StatTile label="Students looking" value={d.stats.studentsLooking} icon={UserSearch} accent="aqua" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-1 font-display font-bold">Pipeline mix</h2>
          {funnelData.length === 0 ? (
            <p className="text-sm text-faint">No applications yet.</p>
          ) : (
            <DonutChart data={funnelData} height={230} centerSub="applications" />
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-display font-bold">Funnel by stage</h2>
          {d.stats.totalApplications === 0 ? (
            <p className="text-sm text-faint">No applications yet.</p>
          ) : (
            <BarsChart
              data={funnelBars}
              xKey="stage"
              bars={[{ key: 'Applications', color: '#f97316' }]}
              height={220}
            />
          )}
        </Card>
        <Card className="flex flex-col items-center justify-center gap-3 py-6">
          <h2 className="flex items-center gap-1.5 font-display font-bold">
            <Percent className="h-4 w-4 text-accent-500" aria-hidden /> Placement rate
          </h2>
          <RadialGauge percent={d.stats.placementRate} label="of applications" color="#f97316" />
          <p className="text-center text-xs text-faint">
            {d.stats.placed} placed out of {d.stats.totalApplications} applications
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-bold">Recent jobs</h2>
          <Link href="/opportunities" className="text-xs font-bold text-brand-500 hover:underline">
            Manage jobs
          </Link>
        </div>
        {d.recentJobs.length === 0 ? (
          <p className="text-sm text-faint">No job postings yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.recentJobs.slice(0, 8).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2 rounded-panel bg-chip px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{j.title}</div>
                  <div className="truncate text-xs text-faint">{j.companyName}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-faint">{j._count.applications} apps</span>
                  <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
