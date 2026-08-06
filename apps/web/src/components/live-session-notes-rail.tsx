'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, HelpCircle, ListChecks, Sparkles } from 'lucide-react';
import { Spinner } from '@fca/ui';
import { liveApi, type LiveQaItem, type LiveSessionNote } from '@/lib/live-api';
import { formatDate } from '@/lib/format';

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asQaItems(v: unknown): LiveQaItem[] {
  if (!Array.isArray(v)) return [];
  const out: LiveQaItem[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const q = (x as LiveQaItem).question;
    if (typeof q !== 'string' || !q.trim()) continue;
    const answer = (x as LiveQaItem).answer;
    out.push({ question: q, answer: typeof answer === 'string' ? answer : undefined });
  }
  return out;
}

/** Side rail: live session summaries / homework / Q&A for a course (or batch). */
export function LiveSessionNotesRail({
  courseId,
  batchId,
  compact = false,
}: {
  courseId?: string;
  batchId?: string;
  compact?: boolean;
}) {
  const notes = useQuery({
    queryKey: ['live', 'notes', courseId, batchId],
    queryFn: () => liveApi.notes({ courseId, batchId }),
    enabled: Boolean(courseId || batchId),
  });

  if (!courseId && !batchId) return null;

  return (
    <div className="rounded-card border border-hair bg-panel p-3 shadow-card">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-accent-500" aria-hidden />
        <h2 className="font-display text-sm font-bold">Session notes</h2>
      </div>
      <p className="mt-1 px-1 text-[11px] text-faint">
        Key points, homework, and Q&A from live classes — for quick revision while you watch.
      </p>

      {notes.isLoading ? (
        <div className="py-6">
          <Spinner />
        </div>
      ) : (notes.data ?? []).length === 0 ? (
        <p className="mt-3 px-1 text-sm text-faint">No published live notes for this course yet.</p>
      ) : (
        <ul className={`mt-3 flex flex-col gap-3 ${compact ? 'max-h-[420px] overflow-y-auto' : ''}`}>
          {(notes.data as LiveSessionNote[]).map((n) => {
            const keyPoints = asStringArray(n.keyPoints);
            const qaItems = asQaItems(n.qaItems);
            return (
              <li key={n.id} className="rounded-panel border border-hair bg-chip/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{n.title}</div>
                    <div className="text-[10px] font-semibold text-faint">
                      {n.batch.name} · {formatDate(n.startsAt)}
                    </div>
                  </div>
                  <Link
                    href={`/live/${n.id}`}
                    className="shrink-0 text-[11px] font-extrabold text-brand-600 hover:underline"
                  >
                    Open
                  </Link>
                </div>
                {n.summary && (
                  <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-ink/90">{n.summary}</p>
                )}
                {keyPoints.length > 0 && (
                  <div className="mt-2">
                    <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">
                      <ListChecks className="h-3 w-3" /> Key points
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                      {keyPoints.slice(0, compact ? 4 : 8).map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {n.homework && (
                  <div className="mt-2 rounded-panel bg-accent-500/10 px-2.5 py-2 text-xs">
                    <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                      <BookOpen className="h-3 w-3" /> Homework
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{n.homework}</p>
                  </div>
                )}
                {qaItems.length > 0 && (
                  <div className="mt-2">
                    <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">
                      <HelpCircle className="h-3 w-3" /> Q&A
                    </div>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {qaItems.slice(0, compact ? 3 : 6).map((item) => (
                        <li key={item.question} className="rounded-panel border border-hair bg-panel px-2 py-1.5 text-xs">
                          <div className="font-semibold">{item.question}</div>
                          {item.answer && <div className="mt-0.5 text-faint">{item.answer}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
