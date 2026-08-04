'use client';

import { Card, Badge, Alert } from '@fca/ui';
import type { StudentInsight, StudentReport } from '@/lib/intelligence-api';

export function riskTone(level: StudentInsight['riskLevel']): 'success' | 'warning' | 'danger' {
  return level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warning' : 'success';
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
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function IntelligenceReport({ report }: { report: StudentReport }) {
  const { signals, insight } = report;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">AI insight</h2>
            <p className="mt-1 text-sm">{insight.summary}</p>
          </div>
          <Badge tone={riskTone(insight.riskLevel)}>
            {insight.riskLevel} · {insight.riskScore}/100
          </Badge>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-success">Strengths</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {insight.strengths.length ? (
                insight.strengths.map((s) => <li key={s}>• {s}</li>)
              ) : (
                <li className="text-faint">None identified yet</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-danger">Concerns</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {insight.concerns.length ? (
                insight.concerns.map((c) => <li key={c}>• {c}</li>)
              ) : (
                <li className="text-faint">No concerns</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Recommendations
            </h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {insight.recommendations.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">Signals</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SignalBar
            label={`Attendance (${signals.attendanceCount} sessions)`}
            percent={signals.attendanceRate}
          />
          <SignalBar
            label={`Assignments (${signals.assignmentCount} evaluated)`}
            percent={signals.assignmentAvg}
          />
          <SignalBar
            label={`Assessments (${signals.assessmentCount} graded)`}
            percent={signals.assessmentAvg}
          />
          <SignalBar label="Course progress" percent={signals.courseProgress} />
        </div>
        {signals.missingAssignments > 0 && (
          <Alert tone="info" className="mt-4">
            {signals.missingAssignments} published assignment
            {signals.missingAssignments > 1 ? 's' : ''} without a submission.
          </Alert>
        )}
      </Card>

      {signals.topics.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold">Topic performance</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {signals.topics.map((t) => (
              <SignalBar key={t.topic} label={t.topic} percent={t.percent} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Recent assignments</h2>
          {report.recentAssignments.length === 0 ? (
            <p className="text-sm text-faint">No evaluated assignments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {report.recentAssignments.map((a) => (
                <li key={a.assignmentId} className="flex items-center justify-between gap-2">
                  <span>{a.title}</span>
                  <Badge
                    tone={a.score != null && a.score / a.maxScore >= 0.6 ? 'success' : 'warning'}
                  >
                    {a.score != null ? `${a.score}/${a.maxScore}` : 'pending'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Recent assessments</h2>
          {report.recentAttempts.length === 0 ? (
            <p className="text-sm text-faint">No graded attempts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {report.recentAttempts.map((a, i) => (
                <li
                  key={`${a.assessmentId}-${i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{a.title}</span>
                  <Badge tone={(a.percent ?? 0) >= 60 ? 'success' : 'warning'}>
                    {a.percent ?? 0}%
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
