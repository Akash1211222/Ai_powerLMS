'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, Badge, Alert, cn } from '@fca/ui';
import type {
  FocusArea,
  InsightPillar,
  Momentum,
  PillarStatus,
  StudentInsight,
  StudentReport,
} from '@/lib/intelligence-api';
import { RadialGauge } from '@/components/charts';

export function riskTone(level: StudentInsight['riskLevel']): 'success' | 'warning' | 'danger' {
  return level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warning' : 'success';
}

export function riskColor(level: StudentInsight['riskLevel']) {
  return level === 'HIGH' ? '#f43f5e' : level === 'MEDIUM' ? '#f59e0b' : '#10b981';
}

function momentumMeta(m: Momentum) {
  if (m === 'RISING') return { label: 'Rising', tone: 'success' as const, Icon: TrendingUp };
  if (m === 'SLIPPING') return { label: 'Slipping', tone: 'danger' as const, Icon: TrendingDown };
  return { label: 'Stable', tone: 'brand' as const, Icon: Activity };
}

function pillarColor(status: PillarStatus) {
  if (status === 'strong') return '#10b981';
  if (status === 'ok') return '#0ea5e9';
  if (status === 'weak') return '#f59e0b';
  if (status === 'critical') return '#f43f5e';
  return '#94a3b8';
}

type ReportTab = 'overview' | 'pillars' | 'plan' | 'signals' | 'topics' | 'activity' | 'coach';

export function RiskRing({
  score,
  level,
  size = 56,
}: {
  score: number;
  level: StudentInsight['riskLevel'];
  size?: number;
}) {
  const color = riskColor(level);
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-hair" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${clamped} ${100 - clamped}`}
          pathLength={100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xs font-extrabold leading-none" style={{ color }}>
          {clamped}
        </span>
      </div>
    </div>
  );
}

export function SignalBar({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 75 ? 'bg-success' : percent >= 50 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="text-faint">{percent}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-soft">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

export function IntelligenceReport({
  report,
  audience = 'student',
}: {
  report: StudentReport;
  audience?: 'student' | 'trainer';
}) {
  const { signals, insight } = report;
  const [tab, setTab] = useState<ReportTab>('overview');
  const mom = momentumMeta(insight.momentum);

  const tabs: Array<{ id: ReportTab; label: string; icon: typeof Sparkles; hide?: boolean }> = [
    { id: 'overview', label: 'Insight', icon: Sparkles },
    { id: 'pillars', label: 'Pillars', icon: Target },
    { id: 'plan', label: 'Focus plan', icon: CalendarRange },
    { id: 'signals', label: 'Signals', icon: Activity },
    { id: 'topics', label: 'Topics', icon: BookOpen },
    { id: 'activity', label: 'Activity', icon: ClipboardList },
    { id: 'coach', label: 'Coach playbook', icon: Users, hide: audience !== 'trainer' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={riskTone(insight.riskLevel)}>
          {insight.riskLevel} · {insight.riskScore}/100
        </Badge>
        <Badge tone={mom.tone}>
          <mom.Icon className="mr-1 inline h-3 w-3" aria-hidden />
          {mom.label}
        </Badge>
        <Badge tone="brand">Engagement {insight.engagementScore}</Badge>
        <Badge tone="neutral">Priority {insight.interventionPriority}/5</Badge>
        {insight.provider && (
          <Badge tone={insight.provider === 'gemini' ? 'success' : 'neutral'}>
            AI · {insight.provider}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
        {tabs
          .filter((t) => !t.hide)
          .map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                  active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t.label}
              </button>
            );
          })}
      </div>

      {tab === 'overview' && <OverviewTab insight={insight} signals={signals} audience={audience} />}
      {tab === 'pillars' && <PillarsTab pillars={insight.pillars} consistency={insight.consistencyScore} />}
      {tab === 'plan' && (
        <PlanTab
          focusAreas={insight.focusAreas}
          weekPlan={insight.weekPlan}
          studentActions={insight.studentActions}
          celebrationWins={insight.celebrationWins}
          trajectory={insight.predictedTrajectory}
        />
      )}
      {tab === 'signals' && <SignalsTab signals={signals} />}
      {tab === 'topics' && <TopicsTab topics={signals.topics} />}
      {tab === 'activity' && <ActivityTab report={report} />}
      {tab === 'coach' && audience === 'trainer' && <CoachTab insight={insight} />}
    </div>
  );
}

function OverviewTab({
  insight,
  signals,
  audience,
}: {
  insight: StudentInsight;
  signals: StudentReport['signals'];
  audience: 'student' | 'trainer';
}) {
  const color = riskColor(insight.riskLevel);
  const narrative = audience === 'trainer' ? insight.trainerBrief : insight.studentNarrative;
  const headline = audience === 'trainer' ? insight.trainerBrief.split('.')[0] : insight.studentHeadline;

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="relative flex flex-col gap-4 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ background: `radial-gradient(circle at 50% 20%, ${color}66, transparent 55%)` }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-3 pt-4">
          <RiskRing score={insight.riskScore} level={insight.riskLevel} size={104} />
          <h2 className="max-w-sm text-center font-display text-xl font-extrabold">
            {insight.studentHeadline || headline}
          </h2>
          <p className="max-w-md text-center text-sm text-faint whitespace-pre-line">{narrative}</p>
        </div>
        <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Engage" value={`${insight.engagementScore}`} />
          <MiniStat label="Consistency" value={`${insight.consistencyScore}`} />
          <MiniStat label="Submit %" value={`${signals.submissionRate}%`} />
          <MiniStat label="Progress" value={`${signals.courseProgress}%`} />
        </div>
        <div className="relative rounded-panel border border-hair bg-chip/40 p-3 text-sm">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">
            Predicted trajectory
          </div>
          {insight.predictedTrajectory}
        </div>
      </Card>

      <div className="grid gap-3">
        <InsightColumn
          title="Strengths"
          icon={CheckCircle2}
          accent="border-success/40 bg-success/5"
          titleClass="text-success"
          items={insight.strengths}
          empty="None identified yet"
        />
        <InsightColumn
          title="Concerns"
          icon={AlertTriangle}
          accent="border-danger/40 bg-danger/5"
          titleClass="text-danger"
          items={insight.concerns}
          empty="No concerns"
        />
        <InsightColumn
          title="Recommendations"
          icon={Lightbulb}
          accent="border-brand-300/50 bg-brand-500/5"
          titleClass="text-brand-600"
          items={insight.recommendations}
          empty="Keep doing what works"
        />
        {insight.celebrationWins.length > 0 && (
          <InsightColumn
            title="Wins to celebrate"
            icon={Sparkles}
            accent="border-accent-300/40 bg-accent-500/5"
            titleClass="text-accent-600"
            items={insight.celebrationWins}
            empty=""
          />
        )}
      </div>
    </div>
  );
}

function PillarsTab({ pillars, consistency }: { pillars: InsightPillar[]; consistency: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">Explainable pillars</h3>
          <p className="text-sm text-faint">
            Every risk point traces to a real LMS signal — not a black-box score.
          </p>
        </div>
        <Badge tone="brand">Consistency {consistency}/100</Badge>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => {
          const color = pillarColor(p.status);
          return (
            <Card key={p.id} className="relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
              <div className="flex items-start justify-between gap-3 pl-1">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{p.label}</div>
                  <div className="font-display text-2xl font-extrabold" style={{ color }}>
                    {p.score}
                  </div>
                  <Badge tone={p.status === 'strong' || p.status === 'ok' ? 'success' : p.status === 'unknown' ? 'neutral' : 'warning'}>
                    {p.status}
                  </Badge>
                </div>
                {p.weight > 0 && (
                  <div className="text-right text-[10px] font-bold text-faint">
                    Weight
                    <div className="text-sm text-ink">{Math.round(p.weight * 100)}%</div>
                  </div>
                )}
              </div>
              <p className="mt-3 pl-1 text-sm text-faint">{p.note}</p>
              <div className="mt-3 h-2 rounded-full bg-soft">
                <div className="h-2 rounded-full" style={{ width: `${p.score}%`, background: color }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PlanTab({
  focusAreas,
  weekPlan,
  studentActions,
  celebrationWins,
  trajectory,
}: {
  focusAreas: FocusArea[];
  weekPlan: StudentInsight['weekPlan'];
  studentActions: string[];
  celebrationWins: string[];
  trajectory: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-sunset opacity-25 blur-2xl" />
        <h3 className="relative mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Crosshair className="h-5 w-5 text-accent-500" aria-hidden />
          Focus areas
        </h3>
        {focusAreas.length === 0 ? (
          <p className="text-sm text-faint">No critical focus areas — protect your habits.</p>
        ) : (
          <ul className="relative flex flex-col gap-3">
            {focusAreas.map((f) => (
              <li key={`${f.area}-${f.evidence}`} className="rounded-panel border border-hair bg-chip/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{f.area}</span>
                  <Badge
                    tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}
                  >
                    {f.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-faint">{f.evidence}</p>
                <p className="mt-2 text-sm font-semibold">{f.action}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
        <h3 className="relative mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <CalendarRange className="h-5 w-5 text-brand-500" aria-hidden />
          This week
        </h3>
        <ol className="relative flex flex-col gap-2">
          {weekPlan.map((w, i) => (
            <li key={`${w.focus}-${i}`} className="flex gap-3 rounded-panel border border-hair bg-chip/40 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-grad-holo text-xs font-extrabold text-white">
                {i + 1}
              </span>
              <div>
                <div className="font-bold">{w.focus}</div>
                <div className="text-xs text-faint">{w.why}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="relative mt-4 rounded-panel border border-hair bg-panel p-3 text-sm">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">Trajectory</div>
          {trajectory}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-lg font-bold">Your next moves</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          {studentActions.map((a) => (
            <li key={a} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-lg font-bold">Celebrate</h3>
        {celebrationWins.length === 0 ? (
          <p className="text-sm text-faint">Wins will appear as signals improve.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {celebrationWins.map((a) => (
              <li key={a} className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SignalsTab({ signals }: { signals: StudentReport['signals'] }) {
  const gauges = [
    { label: 'Attendance', percent: signals.attendanceRate, color: '#0ea5e9', sub: `${signals.attendanceCount} sessions` },
    { label: 'Assignments', percent: signals.assignmentAvg, color: '#2563eb', sub: `${signals.assignmentCount} evaluated` },
    { label: 'Assessments', percent: signals.assessmentAvg, color: '#f97316', sub: `${signals.assessmentCount} graded` },
    { label: 'Progress', percent: signals.courseProgress, color: '#10b981', sub: 'course completion' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {gauges.map((g) => (
          <Card key={g.label} className="relative flex flex-col items-center gap-2 overflow-hidden py-5">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
              style={{ background: g.color }}
              aria-hidden
            />
            <RadialGauge percent={g.percent} label={g.label} color={g.color} size={120} />
            <div className="text-[11px] font-semibold text-faint">{g.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Present" value={signals.presentCount} />
        <StatTile label="Late" value={signals.lateCount} />
        <StatTile label="Absent" value={signals.absentCount} />
        <StatTile label="Submit rate" value={`${signals.submissionRate}%`} />
      </div>

      {signals.missingAssignments > 0 && (
        <Alert tone="info">
          {signals.missingAssignments} published assignment
          {signals.missingAssignments > 1 ? 's' : ''} without a submission.
        </Alert>
      )}

      <Card>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <TrendingUp className="h-5 w-5 text-brand-500" aria-hidden />
          Signal rails
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <SignalBar label={`Attendance (${signals.attendanceCount} sessions)`} percent={signals.attendanceRate} />
          <SignalBar label={`Assignments (${signals.assignmentCount} evaluated)`} percent={signals.assignmentAvg} />
          <SignalBar label={`Assessments (${signals.assessmentCount} graded)`} percent={signals.assessmentAvg} />
          <SignalBar label="Course progress" percent={signals.courseProgress} />
          <SignalBar label="Submission rate" percent={signals.submissionRate} />
        </div>
      </Card>
    </div>
  );
}

function TopicsTab({ topics }: { topics: StudentReport['signals']['topics'] }) {
  if (topics.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <BookOpen className="h-10 w-10 text-faint" aria-hidden />
        <p className="font-display text-lg font-bold">No topic data yet</p>
        <p className="max-w-sm text-sm text-faint">
          Complete assessments tagged with topics to light up this constellation.
        </p>
      </Card>
    );
  }

  const sorted = [...topics].sort((a, b) => b.percent - a.percent);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sorted.map((t, i) => {
        const color = t.percent >= 75 ? '#10b981' : t.percent >= 50 ? '#f59e0b' : '#f43f5e';
        return (
          <Card key={t.topic} className="relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
            <div className="flex items-center justify-between gap-3 pl-1">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Topic {i + 1}</div>
                <div className="truncate font-display font-bold">{t.topic}</div>
              </div>
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold text-white"
                style={{ background: color }}
              >
                {t.percent}%
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-soft">
              <div className="h-2 rounded-full" style={{ width: `${t.percent}%`, background: color }} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ActivityTab({ report }: { report: StudentReport }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
        <h3 className="relative mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <ClipboardList className="h-5 w-5 text-brand-500" aria-hidden />
          Recent assignments
        </h3>
        {report.recentAssignments.length === 0 ? (
          <p className="text-sm text-faint">No evaluated assignments yet.</p>
        ) : (
          <ul className="relative flex flex-col gap-2">
            {report.recentAssignments.map((a) => {
              const good = a.score != null && a.score / a.maxScore >= 0.6;
              return (
                <li
                  key={a.assignmentId}
                  className="flex items-center justify-between gap-2 rounded-panel border border-hair bg-chip/40 px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm font-semibold">{a.title}</span>
                  <Badge tone={a.score != null ? (good ? 'success' : 'warning') : 'neutral'}>
                    {a.score != null ? `${a.score}/${a.maxScore}` : 'pending'}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-sunset opacity-25 blur-2xl" />
        <h3 className="relative mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Activity className="h-5 w-5 text-accent-500" aria-hidden />
          Recent assessments
        </h3>
        {report.recentAttempts.length === 0 ? (
          <p className="text-sm text-faint">No graded attempts yet.</p>
        ) : (
          <ul className="relative flex flex-col gap-2">
            {report.recentAttempts.map((a, i) => (
              <li
                key={`${a.assessmentId}-${i}`}
                className="flex items-center justify-between gap-2 rounded-panel border border-hair bg-chip/40 px-3 py-2.5"
              >
                <span className="min-w-0 truncate text-sm font-semibold">{a.title}</span>
                <Badge tone={(a.percent ?? 0) >= 60 ? 'success' : 'warning'}>{a.percent ?? 0}%</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CoachTab({ insight }: { insight: StudentInsight }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="relative overflow-hidden lg:col-span-2">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-grad-holo opacity-20 blur-2xl" />
        <h3 className="relative mb-2 font-display text-lg font-bold">Trainer brief</h3>
        <p className="relative text-sm leading-relaxed">{insight.trainerBrief}</p>
        <p className="relative mt-3 text-sm text-faint">{insight.predictedTrajectory}</p>
      </Card>
      <Card>
        <h3 className="mb-3 font-display text-lg font-bold">Coach moves</h3>
        <ul className="flex flex-col gap-2">
          {insight.trainerActions.map((a) => (
            <li key={a} className="rounded-panel border border-hair bg-chip/40 px-3 py-2.5 text-sm font-semibold">
              {a}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 font-display text-lg font-bold">Ask the student to</h3>
        <ul className="flex flex-col gap-2">
          {insight.studentActions.map((a) => (
            <li key={a} className="rounded-panel border border-hair bg-chip/40 px-3 py-2.5 text-sm font-semibold">
              {a}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function InsightColumn({
  title,
  icon: Icon,
  accent,
  titleClass,
  items,
  empty,
}: {
  title: string;
  icon: typeof CheckCircle2;
  accent: string;
  titleClass: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className={cn('rounded-card border p-4 shadow-card', accent)}>
      <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide', titleClass)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.length ? (
          items.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" aria-hidden />
              <span>{s}</span>
            </li>
          ))
        ) : (
          empty ? <li className="text-faint">{empty}</li> : null
        )}
      </ul>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-hair bg-panel/80 px-2 py-1.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-sm font-extrabold">{value}</div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-2xl font-extrabold">{value}</div>
    </div>
  );
}
