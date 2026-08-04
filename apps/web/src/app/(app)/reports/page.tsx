'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Spinner, Alert } from '@fca/ui';
import { reportsApi, type WeeklyReport } from '@/lib/reports-api';

function periodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function scoreTone(score: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-hair bg-soft px-3 py-2">
      <div className="text-lg font-extrabold tracking-tight">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: 'success' | 'warning' | 'brand' }) {
  if (items.length === 0) return null;
  const dot = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-brand-500';
  return (
    <div>
      <h3 className="text-sm font-bold text-faint">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportDetail({ report }: { report: WeeklyReport }) {
  const m = report.metrics;
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{periodLabel(report.periodStart, report.periodEnd)}</h2>
          <p className="mt-0.5 text-xs text-faint">Generated {new Date(report.createdAt).toLocaleString()}</p>
        </div>
        <Badge tone={scoreTone(m.overallScore)}>
          {m.overallScore === null ? 'No score yet' : `${m.overallScore}/100`}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed">{report.summary}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Attendance" value={`${m.attendanceRate}%`} />
        <Metric label="Lessons" value={String(m.lessonsCompleted)} />
        <Metric label="Assignments" value={String(m.assignmentsSubmitted)} />
        <Metric label="Quiz avg" value={m.quizAvg === null ? '—' : `${m.quizAvg}%`} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <List title="Achievements" items={report.achievements} tone="success" />
        <List title="To improve" items={report.improvements} tone="warning" />
        <List title="Weak areas" items={report.weakAreas} tone="warning" />
        <List title="Goals for next week" items={report.nextWeekGoals} tone="brand" />
      </div>

      {(report.trainerNote || report.mentorNote) && (
        <div className="flex flex-col gap-2 border-t border-hair pt-4">
          {report.trainerNote && (
            <p className="text-sm">
              <span className="font-bold">Trainer note: </span>
              <span className="text-faint">{report.trainerNote}</span>
            </p>
          )}
          {report.mentorNote && (
            <p className="text-sm">
              <span className="font-bold">Mentor note: </span>
              <span className="text-faint">{report.mentorNote}</span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['me', 'reports'], queryFn: reportsApi.mine });
  const activeId = selected ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ['me', 'reports', activeId],
    queryFn: () => reportsApi.one(activeId as string),
    enabled: Boolean(activeId),
  });

  const generate = useMutation({
    mutationFn: reportsApi.generateMine,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      if (res.reportId) setSelected(res.reportId);
    },
  });

  if (list.isLoading) return <Spinner />;
  if (list.error) return <Alert tone="error">Could not load your reports.</Alert>;

  const reports = list.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Progress Reports</h1>
          <p className="mt-1 text-sm text-faint">
            Weekly summaries of your learning — the numbers are computed by the platform, then explained.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? 'Generating…' : 'Generate this week'}
        </Button>
      </div>

      {generate.data?.skipped && (
        <Alert tone="info">This week&apos;s report already exists — showing the latest.</Alert>
      )}

      {reports.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">
            No reports yet. Generate this week&apos;s report to see your first summary.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="flex flex-col gap-1.5">
            {reports.map((r) => {
              const active = r.id === activeId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`rounded-panel border px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? 'border-brand-300 bg-brand-500 text-white shadow-glow'
                      : 'border-hair hover:border-brand-300 hover:bg-soft'
                  }`}
                >
                  <div className="font-bold">{periodLabel(r.periodStart, r.periodEnd)}</div>
                  <div className={`text-xs ${active ? 'text-white/80' : 'text-faint'}`}>
                    {r.provider === 'heuristic' ? 'Auto-generated' : 'AI narrated'}
                  </div>
                </button>
              );
            })}
          </nav>

          {detail.isLoading || !detail.data ? <Spinner /> : <ReportDetail report={detail.data} />}
        </div>
      )}
    </div>
  );
}
