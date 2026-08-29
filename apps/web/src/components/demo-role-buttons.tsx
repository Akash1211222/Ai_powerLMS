'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

/**
 * A way into the demo as each kind of person.
 *
 * The LMS looks different to a batch manager than to a student, and the only
 * honest way to review that is to stand in each place. These sign in with no
 * password — the accounts exist only in the demo organisations and are wiped
 * hourly.
 *
 * There is no button for a super admin and there will not be: it is the only
 * role that crosses organisations and it opens the raw database. The server
 * refuses it too, so this list is a menu rather than the control.
 */
const ROLES: Array<{ role: string; label: string; blurb: string }> = [
  { role: 'STUDENT', label: 'Student', blurb: 'Courses, assignments, own progress' },
  { role: 'TRAINER', label: 'Trainer', blurb: 'Teaches, sets work, grades it' },
  { role: 'BATCH_MANAGER', label: 'Batch manager', blurb: 'Batches, sessions, student records' },
  { role: 'COLLEGE_ADMIN', label: 'College admin', blurb: 'Runs one college end to end' },
  { role: 'OPERATIONAL_LEAD', label: 'Operations lead', blurb: 'Several colleges at once' },
  { role: 'PLACEMENT_OFFICER', label: 'Placement officer', blurb: 'Jobs and applications' },
  { role: 'MENTOR', label: 'Mentor', blurb: 'One-to-one sessions' },
  { role: 'ALUMNI', label: 'Alumni', blurb: 'Refers juniors into roles' },
  { role: 'RECRUITER', label: 'Recruiter', blurb: 'Outside company — sees only postings' },
];

export function DemoRoleButtons() {
  const { startDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (role: string) => {
    setBusy(role);
    setError(null);
    try {
      await startDemo(role);
      router.push('/dashboard');
    } catch (e) {
      // Reviewing all nine roles in a row is exactly what this is for, and
      // that trips the per-IP limit on auth routes. Saying "not available"
      // there reads as a broken demo rather than "you are going quickly".
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Too many demo sign-ins from here. Wait a few seconds and try again.'
          : 'That demo account is not available right now.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 border-t border-hair pt-5">
      <p className="text-sm font-semibold">Or look around as…</p>
      <p className="mt-0.5 text-xs text-faint">
        No password needed. Shared demo data, reset every hour.
      </p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.role}
            type="button"
            disabled={busy !== null}
            onClick={() => open(r.role)}
            className="rounded-panel border border-hair bg-card px-3 py-2 text-left transition hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            <span className="block text-sm font-semibold">
              {busy === r.role ? 'Opening…' : r.label}
            </span>
            <span className="block text-xs text-faint">{r.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
