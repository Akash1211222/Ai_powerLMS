'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo, Spinner, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/notification-bell';

/**
 * Client-side guard + shell for authenticated pages. NOTE: this is UX only —
 * every API the pages call is independently authorized server-side (§39).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const can = (perm: string) => user.permissions.includes(perm);
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;

  const nav = [
    { href: '/dashboard', label: 'Dashboard', show: true },
    { href: '/courses', label: 'Courses', show: can('course:view') },
    { href: '/batches', label: 'Batches', show: can('batch:view') },
    { href: '/calendar', label: 'Calendar', show: true },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 flex h-screen w-60 flex-col gap-1 border-r border-hair bg-panel p-4">
        <div className="px-2 pb-4">
          <Logo />
        </div>
        {nav.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'rounded-panel px-3 py-2 text-sm font-semibold transition',
                active ? 'bg-brand-100 text-brand-600' : 'text-faint hover:bg-soft hover:text-ink',
              )}
            >
              {n.label}
            </Link>
          );
        })}
        <div className="mt-auto border-t border-hair pt-3">
          <div className="px-2 text-sm font-semibold text-ink">{name}</div>
          <button
            onClick={() => logout()}
            className="mt-2 w-full rounded-panel border border-hair px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-soft"
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-hair bg-panel/70 px-8 py-3 backdrop-blur">
          <NotificationBell />
        </header>
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
