'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@fca/ui';
import { placementApi, type PlacementTier } from '@/lib/placement-api';
import { IconCheck, IconTarget } from './icons';

const tierMeta: Record<PlacementTier, { tone: 'success' | 'warning' | 'danger' | 'brand'; label: string }> = {
  READY: { tone: 'success', label: 'Placement ready' },
  NEARLY_READY: { tone: 'brand', label: 'Nearly ready' },
  DEVELOPING: { tone: 'warning', label: 'Developing' },
  NOT_READY: { tone: 'danger', label: 'Not ready yet' },
};

/**
 * The student's placement readiness (§24). The score, tier and checklist are
 * computed by the platform; this shows what's met and what to close next.
 */
export function PlacementReadinessCard() {
  const q = useQuery({ queryKey: ['me', 'placement'], queryFn: placementApi.mine });

  if (q.isLoading || q.error || !q.data) return null;
  const p = q.data;
  const tier = tierMeta[p.tier];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 flex-col items-center justify-center rounded-card bg-gradient-to-br from-brand-500 to-brand-800 text-white">
            <span className="text-xl font-extrabold leading-none">{p.readinessScore}</span>
            <span className="text-[9px] font-semibold uppercase opacity-80">ready</span>
          </span>
          <div>
            <h2 className="font-bold">Placement readiness</h2>
            <p className="text-xs text-faint">How job-ready your profile is right now.</p>
          </div>
        </div>
        <Badge tone={tier.tone}>{tier.label}</Badge>
      </div>

      <ul className="flex flex-col gap-1.5">
        {p.checklist.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                c.met ? 'border-success bg-success text-white' : 'border-hair bg-panel text-faint'
              }`}
            >
              {c.met ? <IconCheck width={12} height={12} /> : <IconTarget width={12} height={12} />}
            </span>
            <span>
              <span className={`font-semibold ${c.met ? '' : 'text-ink'}`}>{c.label}</span>
              <span className="block text-xs text-faint">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {p.gaps.length > 0 && (
        <p className="rounded-panel bg-soft px-3 py-2 text-xs text-faint">
          Focus next on {p.gaps.length} area{p.gaps.length === 1 ? '' : 's'} above to raise your readiness.
        </p>
      )}
    </Card>
  );
}
