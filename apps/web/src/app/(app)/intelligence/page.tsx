'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Brain,
  Search,
  Shield,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Card, Badge, Spinner, Alert, Input, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { batchesApi } from '@/lib/lms-api';
import {
  intelligenceApi,
  type CohortBriefing,
  type CohortRow,
  type Momentum,
} from '@/lib/intelligence-api';
import { IntelligenceReport, riskTone, riskColor, RiskRing } from '@/components/intelligence-report';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

export default function IntelligencePage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const isStaff = Boolean(user?.permissions.includes('student:view'));

  if (!user || (isStaff && !org)) return <Spinner />;

  return isStaff ? <StaffView orgId={org!.id} /> : <StudentSelfView />;
}

function StudentSelfView() {
  const meQ = useQuery({ queryKey: ['intelligence', 'me'], queryFn: intelligenceApi.me });
  if (meQ.isLoading) return <Spinner />;
  if (meQ.isError) return <Alert tone="error">Could not load your report.</Alert>;
  const report = meQ.data!;
  const insight = report.insight;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Your signal constellation"
        title={insight.studentHeadline || 'See how you’re'}
        highlight={insight.studentHeadline ? undefined : 'really tracking'}
        subtitle={`${todayLabel()} · ${insight.riskLevel} risk · engagement ${insight.engagementScore} · ${insight.momentum.toLowerCase()}`}
        actions={[
          { label: 'Practice skills', href: '/skills', icon: Target, primary: true },
          { label: 'Career cockpit', href: '/career', icon: Sparkles },
        ]}
      >
        <HeroPanel title="Risk pulse">
          <div className="flex items-center gap-3">
            <RiskRing score={insight.riskScore} level={insight.riskLevel} size={64} />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Status</div>
              <div className="truncate text-sm font-semibold">{momentumLabel(insight.momentum)}</div>
              <div className="text-[11px] text-white/55">Priority {insight.interventionPriority}/5</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <HeroBanner
        title="AI coaching built on your real numbers"
        sub="Gemini narrates — risk scores stay explainable and locked to LMS signals."
      />

      <IntelligenceReport report={report} audience="student" />
    </div>
  );
}

function StaffView({ orgId }: { orgId: string }) {
  const [batchId, setBatchId] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [query, setQuery] = useState('');

  const batchesQ = useQuery({
    queryKey: ['batches', orgId],
    queryFn: () => batchesApi.list(orgId),
  });
  const cohortQ = useQuery({
    queryKey: ['intelligence', 'cohort', orgId, batchId],
    queryFn: () => intelligenceApi.cohort(orgId, batchId || undefined),
  });

  const data = cohortQ.data;
  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data.students];
    if (riskFilter !== 'ALL') list = list.filter((s) => s.insight.riskLevel === riskFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.batches.some((b) => b.name.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => b.insight.riskScore - a.insight.riskScore);
    return list;
  }, [data, riskFilter, query]);

  if (cohortQ.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Spinner />
        <p className="text-sm font-semibold text-faint">Scanning cohort signals & generating AI briefing…</p>
      </div>
    );
  }
  if (cohortQ.isError) return <Alert tone="error">Could not load cohort intelligence.</Alert>;

  const stats = data!.stats;
  const briefing = data!.briefing;
  const health =
    stats.total === 0 ? 100 : Math.round(((stats.low + stats.medium * 0.5) / stats.total) * 100);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Cohort intelligence"
        title="Spot risk"
        highlight="before it snowballs"
        subtitle={`${todayLabel()} · avg risk ${stats.avgRisk} · engagement ${stats.avgEngagement} · ${stats.high} high`}
        actions={[
          { label: 'Attendance', href: '/attendance', icon: Activity },
          { label: 'Assignments', href: '/assignments', icon: Target, primary: true },
        ]}
      >
        <HeroPanel title="Cohort health">
          <div className="flex items-center gap-3">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${health} ${100 - health}`}
                  pathLength={100}
                />
              </svg>
              <span className="absolute font-display text-sm font-extrabold">{health}</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Health index</div>
              <div className="text-sm font-semibold">{stats.total} students scanned</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <HeroBanner
        title="Neural view of the cohort"
        sub="Explainable risk from real signals — Gemini writes the coaching briefing."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Students" value={stats.total} icon={Users} accent="bg-grad-holo" />
        <StatChip label="High risk" value={stats.high} icon={AlertTriangle} accent="bg-grad-sunset" />
        <StatChip label="Needs attention" value={stats.medium} icon={Activity} accent="bg-grad-aqua" />
        <StatChip label="On track" value={stats.low} icon={Shield} accent="bg-grad-mint" />
      </div>

      <CohortBriefingCard briefing={briefing} />

      <RiskSpectrum high={stats.high} medium={stats.medium} low={stats.low} total={stats.total} />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-grad-aqua opacity-20 blur-2xl" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-brand-500" aria-hidden />
              <h2 className="font-display text-lg font-bold">Students by signal</h2>
            </div>
            <select
              className="cursor-pointer rounded-panel border border-hair bg-panel px-3 py-2 text-sm font-semibold"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">All batches</option>
              {(batchesQ.data?.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, batch…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskFilter(r)}
                  className={cn(
                    'cursor-pointer rounded-panel px-3 py-2 text-xs font-bold transition',
                    riskFilter === r ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
                  )}
                >
                  {r === 'ALL' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">No students match this filter.</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {filtered.map((s) => (
                <StudentSignalCard key={s.userId} s={s} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function CohortBriefingCard({ briefing }: { briefing: CohortBriefing }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-grad-holo opacity-20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">
              AI cohort briefing
            </span>
            <Badge tone={briefing.provider === 'gemini' ? 'success' : 'neutral'}>
              {briefing.provider}
            </Badge>
          </div>
          <h2 className="font-display text-2xl font-extrabold">{briefing.headline}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-faint">{briefing.overview}</p>
        </div>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-faint">Themes</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {briefing.themes.map((t) => (
              <li key={t} className="rounded-panel border border-hair bg-chip/40 px-3 py-2">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-faint">Priority actions</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {briefing.priorityActions.map((t) => (
              <li key={t} className="rounded-panel border border-hair bg-chip/40 px-3 py-2 font-semibold">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-faint">Bright spots</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {briefing.brightSpots.map((t) => (
              <li key={t} className="rounded-panel border border-success/30 bg-success/5 px-3 py-2">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-faint">Watchlist</h3>
          <ul className="flex flex-col gap-2">
            {briefing.watchlist.map((w) => (
              <li key={`${w.name}-${w.reason}`} className="rounded-panel border border-danger/30 bg-danger/5 p-3">
                <div className="font-bold">{w.name}</div>
                <div className="text-xs text-faint">{w.reason}</div>
                <div className="mt-1 text-sm font-semibold">{w.action}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-panel border border-hair bg-chip/30 p-4">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-faint">Coaching cadence</h3>
          <p className="text-sm leading-relaxed">{briefing.coachingCadence}</p>
        </div>
      </div>
    </Card>
  );
}

function StudentSignalCard({ s }: { s: CohortRow }) {
  const color = riskColor(s.insight.riskLevel);
  return (
    <li className="relative overflow-hidden rounded-panel border border-hair bg-chip/30 p-4 transition hover:border-brand-300 hover:bg-chip/50">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
      <div className="flex items-start gap-3 pl-1">
        <RiskRing score={s.insight.riskScore} level={s.insight.riskLevel} size={52} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/intelligence/${s.userId}`}
            className="font-display text-base font-bold text-ink hover:text-brand-600 hover:underline"
          >
            {s.firstName} {s.lastName}
          </Link>
          <div className="truncate text-xs text-faint">
            {s.email}
            {s.batches.length > 0 && ` · ${s.batches.map((b) => b.name).join(', ')}`}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-faint">{s.insight.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SignalPill label="Att" value={s.signals.attendanceRate} />
            <SignalPill label="Asg" value={s.signals.assignmentAvg} />
            <SignalPill label="Test" value={s.signals.assessmentAvg} />
            <SignalPill label="Eng" value={s.insight.engagementScore} />
            <Badge tone="neutral">{momentumLabel(s.insight.momentum)}</Badge>
            <Badge tone="brand">P{s.insight.interventionPriority}</Badge>
          </div>
        </div>
        <Badge tone={riskTone(s.insight.riskLevel)}>{s.insight.riskLevel}</Badge>
      </div>
    </li>
  );
}

function SignalPill({ label, value }: { label: string; value: number }) {
  const tone = value >= 75 ? 'text-success' : value >= 50 ? 'text-warning' : 'text-danger';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hair bg-panel px-2 py-0.5 text-[10px] font-bold">
      <span className="text-faint">{label}</span>
      <span className={tone}>{value}%</span>
    </span>
  );
}

function RiskSpectrum({
  high,
  medium,
  low,
  total,
}: {
  high: number;
  medium: number;
  low: number;
  total: number;
}) {
  if (total === 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <Card className="overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Risk spectrum</h2>
        <span className="text-xs font-semibold text-faint">{total} scanned</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {high > 0 && <div className="bg-danger transition-all" style={{ width: `${pct(high)}%` }} title={`High ${high}`} />}
        {medium > 0 && (
          <div className="bg-warning transition-all" style={{ width: `${pct(medium)}%` }} title={`Medium ${medium}`} />
        )}
        {low > 0 && <div className="bg-success transition-all" style={{ width: `${pct(low)}%` }} title={`Low ${low}`} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" /> High {pct(high)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning" /> Medium {pct(medium)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" /> Low {pct(low)}%
        </span>
      </div>
    </Card>
  );
}

function StatChip({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  accent: string;
}) {
  return (
    <div className="rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <div className={cn('h-1 w-10 rounded-full', accent)} />
        <Icon className="h-4 w-4 text-faint" aria-hidden />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-2xl font-extrabold leading-none">{value}</div>
    </div>
  );
}

function HeroBanner({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/artwork/intelligence-hub-hero.png"
        alt="Owl beside a holographic neural constellation"
        className="h-40 w-full object-cover object-center sm:h-52"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/45 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Intelligence</p>
        <p className="font-display text-xl font-extrabold sm:text-2xl">{title}</p>
        <p className="mt-1 text-sm text-white/75">{sub}</p>
      </div>
    </div>
  );
}

function momentumLabel(m: Momentum) {
  if (m === 'RISING') return 'Rising';
  if (m === 'SLIPPING') return 'Slipping';
  return 'Stable';
}
