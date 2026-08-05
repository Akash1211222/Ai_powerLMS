'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ClipboardList,
  FileCheck2,
  CalendarCheck,
  Briefcase,
  BrainCircuit,
  HeartHandshake,
  ShieldCheck,
  CalendarDays,
  LogOut,
  Sparkles,
  Target,
  GraduationCap,
  MessagesSquare,
  LineChart,
  FileBarChart,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { Logo, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { SectionArtworkBanner } from '@/components/section-artwork';
import { BrandLoader } from '@/components/brand-loader';

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
      <BrandLoader
        message={status === 'unauthenticated' ? 'Redirecting to sign in…' : undefined}
      />
    );
  }

  const can = (perm: string) => user.permissions.includes(perm);
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  const initials = user.profile
    ? `${user.profile.firstName[0] ?? ''}${user.profile.lastName[0] ?? ''}`
    : user.email.slice(0, 2).toUpperCase();

  const nav: Array<{ href: string; label: string; icon: LucideIcon; show: boolean }> = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/courses', label: 'Courses', icon: BookOpen, show: can('course:view') },
    { href: '/batches', label: 'Batches', icon: Users, show: can('batch:view') },
    {
      href: '/assignments',
      label: 'Assignments',
      icon: ClipboardList,
      show: can('assignment:submit') || can('assignment:create'),
    },
    {
      href: '/assessments',
      label: 'Assessments',
      icon: FileCheck2,
      show: can('assignment:submit') || can('assessment:create'),
    },
    {
      href: '/attendance',
      label: 'Attendance',
      icon: CalendarCheck,
      show: can('attendance:view') || can('attendance:mark'),
    },
    { href: '/live', label: 'Live classes', icon: Radio, show: true },
    { href: '/skills', label: 'Skills', icon: Sparkles, show: true },
    { href: '/career', label: 'Career', icon: Briefcase, show: true },
    { href: '/opportunities', label: 'Opportunities', icon: Target, show: can('placement:view') },
    {
      href: '/intelligence',
      label: 'Intelligence',
      icon: BrainCircuit,
      show: can('student:view') || can('assignment:submit'),
    },
    { href: '/mentorship', label: 'Mentorship', icon: HeartHandshake, show: true },
    { href: '/alumni', label: 'Alumni', icon: GraduationCap, show: true },
    { href: '/community', label: 'Community', icon: MessagesSquare, show: true },
    { href: '/reports', label: 'Reports', icon: FileBarChart, show: true },
    { href: '/insights', label: 'Insights', icon: LineChart, show: can('analytics:view') },
    {
      href: '/admin',
      label: 'Admin',
      icon: ShieldCheck,
      show: can('user:view') || can('feature-flag:manage'),
    },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays, show: true },
  ].filter((n) => n.show);

  const current = nav.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));

  return (
    <div className="flex min-h-screen bg-bg">
      <div className="aurora-bg" aria-hidden>
        <div className="blob-3" />
      </div>

      <aside className="glass sticky top-0 z-20 flex h-screen w-64 flex-col gap-1 overflow-y-auto border-r p-4">
        <div className="px-2 pb-5 pt-1">
          <Logo />
        </div>
        {nav.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'group flex items-center gap-3 rounded-panel px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                active
                  ? 'bg-grad-brand text-white shadow-glow'
                  : 'text-ink/75 hover:translate-x-0.5 hover:bg-chip hover:text-ink dark:text-faint dark:hover:text-ink',
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px] transition-transform duration-200',
                  active ? 'text-white' : 'text-brand-500 group-hover:scale-110 dark:text-brand-300',
                )}
                aria-hidden
              />
              {n.label}
            </Link>
          );
        })}
        <div className="mt-auto border-t border-hair pt-3">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grad-aqua text-xs font-extrabold text-white shadow-glow-aqua">
              {initials}
            </span>
            <span className="truncate text-sm font-semibold text-ink">{name}</span>
          </div>
          <button
            onClick={() => logout()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-panel border border-hair px-3 py-2 text-sm font-semibold text-ink transition hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-8 py-3">
          <span className="font-display text-sm font-bold uppercase tracking-widest text-ink/70 dark:text-faint">
            {current?.label ?? 'FutureCorp Academy'}
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl animate-fadeUp">
            <SectionArtworkBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
