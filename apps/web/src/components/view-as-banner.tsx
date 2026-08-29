'use client';

import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * Says, at all times, that this is somebody else's account.
 *
 * Without it the borrowed session is indistinguishable from a real one, and
 * staff who forget which window they are in start reading a student's marks as
 * their own dashboard. It is deliberately loud and fixed to the top.
 *
 * Nothing can be changed while it is showing — the server refuses any request
 * that is not a read — so this is a signpost rather than the safeguard.
 */
export function ViewAsBanner() {
  const { viewingAs, stopViewingAs } = useAuth();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  if (!viewingAs) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    >
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" aria-hidden />
        Viewing as {viewingAs} — read only
      </span>
      <button
        type="button"
        disabled={leaving}
        onClick={async () => {
          setLeaving(true);
          try {
            await stopViewingAs();
            // Dashboard, not Admin: the batch desk reaches this from a batch
            // roster and cannot open Admin at all, so sending everyone there
            // ends the session on a "no access" page.
            router.push('/dashboard');
          } finally {
            setLeaving(false);
          }
        }}
        className="rounded-panel bg-amber-950/15 px-3 py-1 font-semibold underline underline-offset-2 transition hover:bg-amber-950/25 disabled:opacity-60"
      >
        {leaving ? 'Returning…' : 'Stop viewing'}
      </button>
    </div>
  );
}
