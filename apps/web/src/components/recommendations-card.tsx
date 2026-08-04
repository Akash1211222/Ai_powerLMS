'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@fca/ui';
import { recommendationsApi, type RecommendationType } from '@/lib/recommendations-api';
import { IconSpark } from './icons';

const typeMeta: Record<RecommendationType, { emoji: string; tone: 'danger' | 'warning' | 'brand' | 'success'; label: string }> = {
  SUBMIT_ASSIGNMENT: { emoji: '📤', tone: 'danger', label: 'Assignment' },
  BOOK_MENTOR: { emoji: '🧑‍🏫', tone: 'danger', label: 'Mentor' },
  RETAKE_QUIZ: { emoji: '🔁', tone: 'warning', label: 'Quiz' },
  REVIEW_SKILL: { emoji: '📚', tone: 'warning', label: 'Skill' },
  COMPLETE_LESSON: { emoji: '▶️', tone: 'brand', label: 'Lesson' },
  KEEP_GOING: { emoji: '🎉', tone: 'success', label: 'On track' },
};

/**
 * "Recommended for you" — the student's ranked next-best-actions (§22). The
 * ordering is computed by the platform; each item links straight to where the
 * student can act on it.
 */
export function RecommendationsCard() {
  const q = useQuery({ queryKey: ['me', 'recommendations'], queryFn: recommendationsApi.mine });

  if (q.isLoading || q.error || !q.data || q.data.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IconSpark width={18} height={18} className="text-brand-500" />
        <h2 className="font-bold">Recommended for you</h2>
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-hair">
          {q.data.map((r, i) => {
            const meta = typeMeta[r.type];
            return (
              <li key={i}>
                <Link
                  href={r.deepLink}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-soft"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-panel bg-chip text-base">
                    {meta.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{r.title}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </span>
                    <span className="block text-xs text-faint">{r.reason}</span>
                  </span>
                  <span className="mt-1 shrink-0 text-faint">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
