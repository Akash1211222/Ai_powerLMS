'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner, Alert } from '@fca/ui';
import { skillsApi, type StudentSkill } from '@/lib/skills-api';
import { ProgressBar } from '@/components/stat-tile';

const trendIcon: Record<string, string> = { UP: '▲', DOWN: '▼', FLAT: '▬', NEW: '✦' };
const trendTone: Record<string, 'success' | 'danger' | 'neutral' | 'brand'> = {
  UP: 'success',
  DOWN: 'danger',
  FLAT: 'neutral',
  NEW: 'brand',
};

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export default function SkillsPage() {
  const q = useQuery({ queryKey: ['me', 'skills'], queryFn: skillsApi.mine });

  const byCategory = useMemo(() => {
    const map = new Map<string, StudentSkill[]>();
    for (const s of q.data ?? []) {
      const b = map.get(s.category);
      if (b) b.push(s);
      else map.set(s.category, [s]);
    }
    return [...map.entries()];
  }, [q.data]);

  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="error">Could not load your skills.</Alert>;

  const skills = q.data ?? [];
  const weakest = [...skills].sort((a, b) => a.score - b.score).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">My Skills</h1>
        <p className="mt-1 text-sm text-faint">
          Computed from your assessment performance. Take more quizzes to sharpen the picture.
        </p>
      </div>

      {skills.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">
            No skill data yet — complete a quiz and your skill profile will appear here.
          </p>
        </Card>
      ) : (
        <>
          {weakest.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-faint">Focus areas (weakest skills)</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {weakest.map((s) => (
                  <Badge key={s.skillId} tone="warning">
                    {s.name} · {s.score}%
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {byCategory.map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-2 text-sm font-bold text-faint">{category}</h2>
              <Card className="p-0">
                <ul className="divide-y divide-hair">
                  {items.map((s) => (
                    <li key={s.skillId} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{s.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge tone={trendTone[s.trend]}>{trendIcon[s.trend]} {s.trend}</Badge>
                          <Badge tone={scoreTone(s.score)}>{s.score}%</Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar percent={s.score} />
                        <span className="w-24 shrink-0 text-right text-xs text-faint">
                          {Math.round(s.confidence * 100)}% confidence
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
