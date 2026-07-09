'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';

/**
 * Client-side guard for authenticated pages. NOTE: this is UX only — every API
 * the pages call is independently authorized server-side (§39). It never grants
 * access, it only redirects the browser.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"
          aria-label="Loading"
        />
      </div>
    );
  }

  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-hair bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="text-sm text-faint">{name}</span>
            <button
              onClick={() => logout()}
              className="rounded-panel border border-hair px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-soft"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
