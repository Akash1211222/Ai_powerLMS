'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@fca/ui';
import { analyticsApi, type HealthBand, type RiskLevel } from '@/lib/analytics-api';
import { ProgressBar } from './stat-tile';

const bandMeta: Record<HealthBand, { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  HEALTHY: { tone: 'success', label: 'Healthy' },
  WATCH: { tone: 'warning', label: 'Watch' },
  AT_RISK: { tone: 'danger', label: 'At risk' },
};

const riskTone: Record<RiskLevel, 'danger' | 'warning' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-hair bg-soft px-3 py-2">
      <div className="text-lg font-extrabold tracking-tight">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

/**
 * Batch health rollup for staff (§23). The score, band, distribution and
 * per-student triage table are all computed by the platform — this only
 * renders them.
 */
export function BatchHealthPanel({ batchId }: { batchId: string }) {
  const q = useQuery({ queryKey: ['batch', batchId, 'health'], queryFn: () => analyticsApi.batchHealth(batchId) });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return null;
  const h = q.data;
  const band = bandMeta[h.band];

  if (h.studentCount === 0) {
    return (
      <Card>
        <h2 className="font-bold">Batch health</h2>
        <p className="mt-1 text-sm text-faint">No active students yet — health appears once students join.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 flex-col items-center justify-center rounded-card bg-gradient-to-br from-brand-500 to-brand-800 text-white">
              <span className="text-xl font-extrabold leading-none">{h.healthScore}</span>
              <span className="text-[9px] font-semibold uppercase opacity-80">health</span>
            </span>
            <div>
              <h2 className="font-bold">Batch health</h2>
              <p className="text-xs text-faint">
                {h.studentCount} student{h.studentCount === 1 ? '' : 's'} · {h.atRiskCount} at risk
              </p>
            </div>
          </div>
          <Badge tone={band.tone}>{band.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="Attendance" value={`${h.metrics.avgAttendance}%`} />
          <Metric label="Avg score" value={String(h.metrics.avgOverallScore)} />
          <Metric label="Skill mastery" value={`${h.metrics.avgSkillMastery}%`} />
          <Metric label="Progress" value={`${h.metrics.avgProgress}%`} />
          <Metric label="Completed" value={`${h.metrics.completionRate}%`} />
        </div>

        {h.topWeakSkills.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-faint">Weakest shared skills</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {h.topWeakSkills.map((s) => (
                <Badge key={s.skillId} tone="warning">
                  {s.name} · {s.avgScore}%
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-hair px-4 py-3">
          <h3 className="font-bold">Students (weakest first)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Attendance</th>
                <th className="px-4 py-2 w-40">Progress</th>
                <th className="px-4 py-2 text-right">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {h.students.map((s) => (
                <tr key={s.userId} className="hover:bg-soft">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{s.overallScore ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">{s.attendanceRate}%</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={s.progress} />
                      <span className="w-9 text-right text-xs text-faint">{s.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.riskLevel ? <Badge tone={riskTone[s.riskLevel]}>{s.riskLevel}</Badge> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
