'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@fca/ui';
import { riskApi, type AtRiskStudent } from '@/lib/risk-api';

const levelTone: Record<string, 'danger' | 'warning' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

/**
 * Trainer's at-risk queue (§9, §18). Every flag is explainable — the exact
 * factors and evidence that produced it are shown, never a bare label.
 */
export function AtRiskCard() {
  const q = useQuery({ queryKey: ['me', 'at-risk'], queryFn: riskApi.mine });
  const [open, setOpen] = useState<string | null>(null);

  if (q.isLoading || q.error) return null;
  const students = q.data ?? [];

  return (
    <div>
      <h2 className="mb-3 font-bold">Students needing attention</h2>
      <Card className={students.length ? 'p-0' : undefined}>
        {students.length === 0 ? (
          <p className="text-sm text-faint">
            No students are flagged right now — attendance and performance look healthy.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {students.map((s) => (
              <li key={s.userId}>
                <button
                  onClick={() => setOpen(open === s.userId ? null : s.userId)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-soft"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="truncate text-xs text-faint">
                      {s.batchName} · {s.factors.length} factor{s.factors.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={levelTone[s.level]}>{s.level}</Badge>
                    <span className="w-8 text-right text-sm font-bold">{s.score}</span>
                  </div>
                </button>
                {open === s.userId && <RiskDetail student={s} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RiskDetail({ student }: { student: AtRiskStudent }) {
  return (
    <div className="border-t border-hair bg-soft/50 px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wide text-faint">Why flagged</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {student.factors.map((f) => (
          <li key={f.code} className="flex items-start justify-between gap-3 text-sm">
            <span>
              <span className="font-semibold">{f.label}</span>
              <span className="text-faint"> — {f.detail}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-danger">+{f.contribution}</span>
          </li>
        ))}
      </ul>
      {student.recommendedActions.length > 0 && (
        <>
          <div className="mt-3 text-xs font-bold uppercase tracking-wide text-faint">
            Recommended actions
          </div>
          <ul className="mt-1.5 list-inside list-disc text-sm text-ink">
            {student.recommendedActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
