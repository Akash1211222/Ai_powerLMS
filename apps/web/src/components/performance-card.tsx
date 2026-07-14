'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@fca/ui';
import { scoresApi } from '@/lib/scores-api';
import { ProgressBar } from './stat-tile';

function tone(score: number) {
  if (score >= 75) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-danger';
}

/** Explainable performance snapshot (§17) — overall + component sub-scores. */
export function PerformanceCard() {
  const q = useQuery({ queryKey: ['me', 'score'], queryFn: scoresApi.mine });

  if (q.isLoading) return null;
  const s = q.data;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Performance</h2>
        {s && <span className={`text-2xl font-extrabold ${tone(s.overallScore)}`}>{s.overallScore}</span>}
      </div>
      {!s ? (
        <p className="mt-2 text-sm text-faint">
          Complete a quiz or assignment to unlock your performance snapshot.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {[
            { label: 'Performance', value: s.performanceScore },
            { label: 'Consistency', value: s.consistencyScore },
            { label: 'Engagement', value: s.engagementScore },
            { label: 'Skill mastery', value: s.skillMasteryScore },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-faint">{row.label}</span>
                <span className="font-semibold">{row.value}%</span>
              </div>
              <ProgressBar percent={row.value} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
