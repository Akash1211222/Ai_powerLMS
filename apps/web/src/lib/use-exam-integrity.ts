'use client';

import { useEffect, useRef } from 'react';
import { assessmentsApi } from './lms-learning-api';

/**
 * Watches an in-progress attempt for the things that usually accompany
 * cheating, and reports them to the server for the trainer to judge.
 *
 * What this is honest about:
 *
 *  - It is a detector, not a lock. Everything here runs in the student's own
 *    browser, so anyone willing to open devtools can silence it. It reliably
 *    catches casual tab-switching and pasted answers, which is most of what
 *    happens; a determined cheat needs invigilation, not JavaScript.
 *  - Screenshots cannot be detected or blocked at all. No web API exposes
 *    them, and a phone pointed at the screen defeats anything that could.
 *
 * The genuine control is elsewhere: the server enforces the time limit from
 * `startedAt`, and question order is shuffled per attempt.
 *
 * Reports are batched and flushed periodically so a wandering student does not
 * generate a request per glance.
 */
export function useExamIntegrity(attemptId: string | null, active: boolean) {
  const pending = useRef({ blur: 0, paste: 0, awayMs: 0 });
  const awaySince = useRef<number | null>(null);

  useEffect(() => {
    if (!attemptId || !active) return;

    const flush = () => {
      const { blur, paste, awayMs } = pending.current;
      if (!blur && !paste && !awayMs) return;
      pending.current = { blur: 0, paste: 0, awayMs: 0 };
      // Best-effort: a failed report must never interrupt the exam.
      assessmentsApi.reportIntegrity(attemptId, { blur, paste, awayMs }).catch(() => undefined);
    };

    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        pending.current.blur += 1;
        awaySince.current = Date.now();
      } else if (awaySince.current != null) {
        pending.current.awayMs += Date.now() - awaySince.current;
        awaySince.current = null;
        // Flush on return so a long absence is recorded even if the student
        // closes the tab straight after.
        flush();
      }
    };

    const onPaste = () => {
      pending.current.paste += 1;
    };

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onHidden);
    document.addEventListener('paste', onPaste);
    const timer = window.setInterval(flush, 20_000);

    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onHidden);
      document.removeEventListener('paste', onPaste);
      window.clearInterval(timer);
      flush();
    };
  }, [attemptId, active]);
}

/**
 * Discourages copying the paper.
 *
 * A deterrent, not a control — "view source" defeats it in seconds. It is here
 * so that copying is a deliberate act rather than an accident of habit, and
 * because a student who works around it has done something the paste counter
 * will record.
 */
export function useCopyDeterrent(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [active]);
}
