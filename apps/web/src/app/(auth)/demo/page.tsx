'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthShell, Button, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

/**
 * The landing page's "try it" destination.
 *
 * Signs the visitor into the shared demo student account and sends them
 * straight to the dashboard, so the first thing they see is a populated LMS
 * rather than a login form asking for an account they do not have.
 *
 * It runs on arrival rather than behind a button: someone who followed a link
 * marked "live demo" has already pressed the button. The failure path still
 * shows one, because a demo that is off or mid-reset should offer a retry
 * instead of a spinner that never ends.
 */
export default function DemoPage() {
  const router = useRouter();
  const { startDemo } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // React runs effects twice in development; without this the visitor gets two
  // sessions and burns two of the endpoint's per-minute budget on one visit.
  const started = useRef(false);

  async function enter() {
    setError(null);
    try {
      await startDemo();
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'The demo is busy right now. Give it a minute and try again.'
          : 'The demo is not available at the moment. Please try again shortly.',
      );
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enter();
    // Deliberately once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell
      title={error ? 'The demo is unavailable' : 'Opening your demo…'}
      subtitle={
        error
          ? 'Nothing is wrong with your device — the shared demo is resting.'
          : 'Signing you in to a fully loaded FutureCorp Academy, no account needed.'
      }
      footer={
        <>
          This is a shared demo, so anything you change here is periodically reset. Want a real
          account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
          .
        </>
      }
    >
      {error ? (
        <div className="flex flex-col gap-4">
          <Alert tone="error">{error}</Alert>
          <Button onClick={enter}>Try again</Button>
        </div>
      ) : (
        <p className="text-sm text-white/60" role="status" aria-live="polite">
          One moment…
        </p>
      )}
    </AuthShell>
  );
}
