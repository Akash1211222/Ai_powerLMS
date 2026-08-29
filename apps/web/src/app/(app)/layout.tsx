'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, X, MoreHorizontal } from 'lucide-react';
import { Logo, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { buildNav, type NavItem, type TenantKind } from '@/lib/nav-items';
import { useActiveOrg } from '@/lib/use-active-org';
import { NotificationBell } from '@/components/notification-bell';
import { OrgSwitcher } from '@/components/org-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { SectionArtworkBanner } from '@/components/section-artwork';
import { BrandLoader } from '@/components/brand-loader';

/**
 * Client-side guard + shell for authenticated pages. Desktop keeps the full
 * sidebar; phones get a compact header, drawer, and focused bottom tabs.
 * Every API call remains independently authorized server-side.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Threaded into the menu so the org switcher and per-college branding have it.
  const { org } = useActiveOrg();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Accounts issued with the shared role-default password are pinned to the
  // change-password screen. The API refuses every other route anyway (see
  // JwtAuthGuard); this just avoids showing a shell full of failing requests.
  useEffect(() => {
    if (status === 'authenticated' && user?.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [status, user?.mustChangePassword, router]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (status === 'authenticated' && user?.mustChangePassword) {
    return <BrandLoader message="Set your own password to continue…" />;
  }

  if (status !== 'authenticated' || !user) {
    return (
      <BrandLoader message={status === 'unauthenticated' ? 'Redirecting to sign in…' : undefined} />
    );
  }

  const can = (perm: string) => user.permissions.includes(perm);
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  const initials = user.profile
    ? `${user.profile.firstName[0] ?? ''}${user.profile.lastName[0] ?? ''}`
    : user.email.slice(0, 2).toUpperCase();

  const nav: NavItem[] = buildNav({
    permissions: user.permissions,
    orgType: org?.type as TenantKind | undefined,
  });

  const mobilePrimary = nav.filter((n) => n.mobilePrimary).slice(0, 4);
  const current = nav.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className={cn(
              'group flex min-h-11 items-center gap-3 rounded-panel px-3 py-2.5 text-sm font-semibold transition-all duration-200',
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
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <div className="aurora-bg max-md:opacity-40" aria-hidden>
        <div className="blob-3 max-md:hidden" />
      </div>

      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 z-20 hidden h-screen w-64 flex-col gap-1 overflow-y-auto border-r p-4 md:flex">
        <div className="px-2 pb-5 pt-1">
          <Logo />
        </div>
        <NavLinks />
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

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/50"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="glass absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col gap-1 overflow-y-auto border-r p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between px-1">
              <Logo />
              <button
                type="button"
                className="rounded-panel border border-hair p-2"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <button
              onClick={() => logout()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-panel border border-hair px-3 py-2.5 text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-panel border border-hair p-2 md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate font-display text-sm font-bold uppercase tracking-widest text-ink/70 dark:text-faint">
              {current?.label ?? 'FutureCorp Academy'}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <OrgSwitcher />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-8">
          <div className="mx-auto max-w-6xl animate-fadeUp">
            <div className="hidden md:block">
              <SectionArtworkBanner />
            </div>
            {children}
          </div>
        </main>

        {/* Mobile bottom tabs — core journeys only */}
        <nav
          className="glass fixed inset-x-0 bottom-0 z-30 border-t px-1 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden"
          aria-label="Primary"
        >
          <ul className="grid grid-cols-5 gap-0.5">
            {mobilePrimary.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              const Icon = n.icon;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={cn(
                      'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-panel px-1 text-[10px] font-bold',
                      active ? 'text-brand-600' : 'text-faint',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    <span className="truncate">{n.label}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-panel px-1 text-[10px] font-bold text-faint"
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden />
                More
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
