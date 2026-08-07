'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';

const DISMISS_KEY = 'fca.googleEmailPrompt.dismissed';

/**
 * Nudges a student to declare which Google account they join Meet with.
 *
 * Live-class attendance is imported from Meet, which reports the Google
 * account signed in — not the LMS email. A student who joins from a personal
 * Gmail is marked absent despite attending, and nothing tells them; the only
 * signal is on the trainer's import screen, after the fact.
 *
 * Dismissible: plenty of students do join with their LMS address, for whom
 * this is genuinely nothing to do. Dismissing is a decision, so it sticks —
 * /profile remains the permanent home for the setting.
 */
export function GoogleEmailPrompt() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!user || user.googleEmail || dismissed) return null;

  return (
    <Alert tone="warning">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">Which Google account do you join live classes with?</div>
          <p className="mt-1 text-sm">
            Attendance comes from Google Meet, which reports the account you signed in with. If you
            join with <code className="font-mono">{user.email}</code> you&apos;re already covered —
            but if you use a personal Gmail, tell us so your attendance counts.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm font-semibold">
          <Link href="/profile" className="text-brand-500 hover:underline">
            Set it now
          </Link>
          <button
            type="button"
            className="text-faint hover:underline"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* private mode — dismissing for this session is enough */
              }
              setDismissed(true);
            }}
          >
            I use my LMS email
          </button>
        </div>
      </div>
    </Alert>
  );
}
