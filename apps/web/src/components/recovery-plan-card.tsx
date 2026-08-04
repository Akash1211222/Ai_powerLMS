'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge } from '@fca/ui';
import { interventionsApi } from '@/lib/interventions-api';
import { ProgressBar } from './stat-tile';
import { IconCheck, IconTarget } from './icons';

/**
 * The student's active recovery plan (§19). Rendered only when an intervention
 * exists. Completing the final task triggers the platform's recalculation of
 * skills, scores and risk — resolution happens when the picture improves.
 */
export function RecoveryPlanCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'interventions'], queryFn: interventionsApi.mine });
  const complete = useMutation({
    mutationFn: interventionsApi.completeTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'interventions'] });
      qc.invalidateQueries({ queryKey: ['me', 'score'] });
      qc.invalidateQueries({ queryKey: ['me', 'skills'] });
    },
  });

  const active = q.data?.active;
  if (q.isLoading || !active?.plan) return null;

  const tasks = active.plan.tasks;
  const done = tasks.filter((t) => t.completedAt).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <Card className="border-brand-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-brand-100 text-brand-600">
            <IconTarget width={18} height={18} />
          </span>
          <div>
            <h2 className="font-bold">Your recovery plan</h2>
            <p className="text-xs text-faint">
              {done}/{tasks.length} steps done · follow-up{' '}
              {active.followUpAt ? new Date(active.followUpAt).toLocaleDateString() : 'soon'}
            </p>
          </div>
        </div>
        <Badge tone={active.riskLevel === 'CRITICAL' ? 'danger' : 'warning'}>{active.riskLevel}</Badge>
      </div>

      <p className="mt-3 text-sm text-faint">{active.plan.summary}</p>

      {active.plan.weakSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {active.plan.weakSkills.map((s) => (
            <Badge key={s} tone="warning">
              {s}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-4">
        <ProgressBar percent={percent} />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {tasks.map((t) => {
          const isDone = Boolean(t.completedAt);
          return (
            <li key={t.id}>
              <button
                disabled={isDone || complete.isPending}
                onClick={() => complete.mutate(t.id)}
                className={`flex w-full items-start gap-3 rounded-panel border px-3 py-2.5 text-left transition ${
                  isDone
                    ? 'border-success/30 bg-success/5'
                    : 'border-hair hover:border-brand-300 hover:bg-soft'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isDone ? 'border-success bg-success text-white' : 'border-hair bg-panel'
                  }`}
                >
                  {isDone && <IconCheck width={12} height={12} />}
                </span>
                <span>
                  <span className={`text-sm font-semibold ${isDone ? 'text-faint line-through' : ''}`}>
                    {t.title}
                  </span>
                  {t.detail && <span className="block text-xs text-faint">{t.detail}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
