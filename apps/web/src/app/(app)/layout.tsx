'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo, Spinner, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  IconDashboard,
  IconBook,
  IconUsers,
  IconSpark,
  IconCalendar,
  IconReport,
  IconBriefcase,
  IconMentor,
  IconTarget,
  IconSearch,
} from '@/components/icons';

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
  const initials = user.profile
    ? `${user.profile.firstName[0] ?? ''}${user.profile.lastName[0] ?? ''}`
    : user.email[0]?.toUpperCase();

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: IconDashboard, show: true },
    { href: '/courses', label: 'Courses', icon: IconBook, show: can('course:view') },
    { href: '/batches', label: 'Batches', icon: IconUsers, show: can('batch:view') },
    { href: '/skills', label: 'Skills', icon: IconSpark, show: true },
    { href: '/reports', label: 'Reports', icon: IconReport, show: true },
    { href: '/career', label: 'Career', icon: IconBriefcase, show: true },
    { href: '/opportunities', label: 'Opportunities', icon: IconTarget, show: can('placement:view') },
    { href: '/mentors', label: 'Mentorship', icon: IconMentor, show: true },
    { href: '/calendar', label: 'Calendar', icon: IconCalendar, show: true },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-hair bg-panel px-4 py-6">
        <div className="px-2 pb-6">
          <Logo />
        </div>
        <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-faint">
          Overview
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex items-center gap-3 rounded-panel px-3 py-2.5 text-sm font-semibold transition',
                  active
                    ? 'bg-brand-500 text-white shadow-glow'
                    : 'text-faint hover:bg-soft hover:text-ink',
                )}
              >
                <Icon width={19} height={19} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-card bg-gradient-to-br from-brand-500 to-brand-800 p-4 text-white">
          <div className="text-xs font-semibold opacity-85">Signed in as</div>
          <div className="mt-0.5 truncate text-sm font-bold">{name}</div>
          <button
            onClick={() => logout()}
            className="mt-3 w-full rounded-panel bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-hair bg-panel/80 px-8 py-3.5 backdrop-blur">
          <div className="relative flex-1 max-w-xl">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
              <IconSearch width={18} height={18} />
            </span>
            <input
              className="h-10 w-full rounded-full border border-hair bg-bg pl-10 pr-4 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              placeholder="Search courses, batches, students…"
              aria-label="Search"
            />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
