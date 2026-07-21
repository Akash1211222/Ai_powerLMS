'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { reputationApi } from '@/lib/reputation-api';

const badgeEmoji: Record<string, string> = {
  FIRST_ANSWER: '💬',
  KNOWLEDGE_SHARER: '📚',
  PROBLEM_SOLVER: '✅',
  WELL_REGARDED: '⭐',
  CONNECTOR: '🔗',
  MENTOR: '🧑‍🏫',
  TOP_CONTRIBUTOR: '🏆',
};

/**
 * "What you've given back" (§32) — a live contribution score with its
 * explainable breakdown, earned badges, and where the member stands in the
 * organization's leaderboard.
 */
export function ReputationPanel() {
  const { user } = useAuth();
  const rep = useQuery({ queryKey: ['me', 'reputation'], queryFn: reputationApi.mine });
  const board = useQuery({ queryKey: ['community', 'leaderboard'], queryFn: reputationApi.leaderboard });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 flex-col items-center justify-center rounded-card bg-gradient-to-br from-brand-500 to-brand-800 text-white">
            <span className="text-xl font-extrabold leading-none">{rep.data?.score ?? 0}</span>
            <span className="text-[9px] font-semibold uppercase opacity-80">points</span>
          </span>
          <div>
            <h2 className="font-bold">Your contribution</h2>
            <p className="text-xs text-faint">Earned by helping others in the network.</p>
          </div>
        </div>

        {rep.data && rep.data.score > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {rep.data.breakdown
              .filter((b) => b.count > 0)
              .map((b) => (
                <li key={b.key} className="flex items-center justify-between text-sm">
                  <span className="text-faint">
                    {b.label} · {b.count}
                  </span>
                  <span className="font-semibold">+{b.points}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">
            Answer a question, refer someone or mentor a student to start earning.
          </p>
        )}

        {(rep.data?.badges ?? []).length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-faint">Achievements</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(rep.data?.badges ?? []).map((b) => (
                <Badge key={b.code} tone="brand" title={b.description}>
                  {badgeEmoji[b.code] ?? '🏅'} {b.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-hair px-4 py-3">
          <h2 className="font-bold">Top contributors</h2>
        </div>
        {(board.data ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-faint">No contributions yet — be the first.</p>
        ) : (
          <ol className="divide-y divide-hair">
            {(board.data ?? []).map((r, i) => (
              <li
                key={r.userId}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                  r.userId === user?.id ? 'bg-soft' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="w-5 shrink-0 text-xs font-bold text-faint">{i + 1}</span>
                  <span className="truncate text-sm font-semibold">
                    {r.name}
                    {r.userId === user?.id && <span className="ml-1 text-xs text-brand-500">(you)</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.badgeCount > 0 && <span className="text-xs text-faint">🏅 {r.badgeCount}</span>}
                  <span className="text-sm font-bold">{r.score}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
