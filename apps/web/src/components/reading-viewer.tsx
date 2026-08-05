'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { Button, cn } from '@fca/ui';

export interface ReadingViewerProps {
  title: string;
  body: string | null | undefined;
  spentSec?: number;
  completed?: boolean;
  onProgress: (payload: { positionSec: number; watchedSec: number; completed?: boolean }) => void;
  onMarkComplete: () => void;
}

/**
 * In-app reading surface — scrollable article with dwell-time + scroll-depth tracking.
 */
export function ReadingViewer({
  title,
  body,
  spentSec = 0,
  completed = false,
  onProgress,
  onMarkComplete,
}: ReadingViewerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spent = useRef(spentSec);
  const maxScroll = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [active, setActive] = useState(true);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!active || completed) return;
    const id = window.setInterval(() => {
      spent.current += 5;
      onProgressRef.current({
        positionSec: Math.round(maxScroll.current),
        watchedSec: spent.current,
        completed: maxScroll.current >= 90,
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [active, completed]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
    maxScroll.current = Math.max(maxScroll.current, pct);
    setScrollPct(pct);
    if (pct >= 90 && !completed) {
      onProgressRef.current({
        positionSec: pct,
        watchedSec: spent.current,
        completed: true,
      });
    }
  };

  if (!body?.trim()) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hair bg-panel p-8 text-center">
        <BookOpen className="h-8 w-8 text-faint" aria-hidden />
        <p className="font-display text-lg font-bold">Reading content coming soon</p>
        <p className="max-w-sm text-sm text-faint">
          The instructor hasn’t published the article body for this lesson yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-faint">
          Scroll depth · {Math.max(scrollPct, Math.round(maxScroll.current))}%
        </div>
        {!completed ? (
          <Button size="sm" className="bg-grad-holo text-white shadow-glow" onClick={onMarkComplete}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Mark as read
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Completed
          </span>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full bg-grad-holo transition-[width] duration-300"
          style={{ width: `${Math.max(scrollPct, Math.round(maxScroll.current))}%` }}
        />
      </div>

      <article
        ref={scrollerRef}
        onScroll={onScroll}
        className={cn(
          'reading-stage max-h-[min(70vh,720px)] overflow-y-auto rounded-card border border-hair bg-panel p-5 shadow-card sm:p-8',
        )}
      >
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        <div className="reading-prose mt-5 whitespace-pre-wrap text-[15px] leading-7 text-ink/90">
          {body}
        </div>
      </article>
    </div>
  );
}
