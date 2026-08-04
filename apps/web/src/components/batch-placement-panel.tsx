'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@fca/ui';
import { placementApi, type PlacementTier } from '@/lib/placement-api';

const tierMeta: Record<PlacementTier, { tone: 'success' | 'warning' | 'danger' | 'brand'; label: string }> = {
  READY: { tone: 'success', label: 'Ready' },
  NEARLY_READY: { tone: 'brand', label: 'Nearly' },
  DEVELOPING: { tone: 'warning', label: 'Developing' },
  NOT_READY: { tone: 'danger', label: 'Not ready' },
};
const ORDER: PlacementTier[] = ['READY', 'NEARLY_READY', 'DEVELOPING', 'NOT_READY'];

/** Cohort placement readiness for a batch (§24) — the placement officer's view. */
export function BatchPlacementPanel({ batchId }: { batchId: string }) {
  const q = useQuery({ queryKey: ['batch', batchId, 'placement'], queryFn: () => placementApi.forBatch(batchId) });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return null;
  const p = q.data;

  if (p.studentCount === 0) {
    return (
      <Card>
        <h2 className="font-bold">Placement readiness</h2>
        <p className="mt-1 text-sm text-faint">No active students yet.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Placement readiness</h2>
          <p className="text-xs text-faint">Cohort average {p.avgReadiness} · {p.studentCount} students</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ORDER.map((t) => (
          <Badge key={t} tone={tierMeta[t].tone}>
            {tierMeta[t].label}: {p.tierCounts[t]}
          </Badge>
        ))}
      </div>

      <ul className="divide-y divide-hair">
        {p.students.map((s) => (
          <li key={s.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate font-medium">{s.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge tone={tierMeta[s.tier].tone}>{tierMeta[s.tier].label}</Badge>
              <span className="w-8 text-right font-bold">{s.readinessScore}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
