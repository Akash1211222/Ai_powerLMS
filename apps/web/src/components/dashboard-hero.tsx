'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@fca/ui';

export interface HeroAction {
  label: string;
  href: string;
  icon?: LucideIcon;
  primary?: boolean;
}

/** Formats "Wednesday, 5 August" for the hero subtitle. */
export function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Navy gradient hero banner shown at the top of every role dashboard —
 * greeting, quick actions, and an optional right-hand slot (e.g. today's
 * schedule).
 */
export function DashboardHero({
  eyebrow,
  title,
  highlight,
  suffix,
  subtitle,
  actions = [],
  children,
}: {
  eyebrow?: string;
  title: string;
  highlight?: string;
  suffix?: string;
  subtitle?: string;
  actions?: HeroAction[];
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-card bg-grad-holo p-6 text-white shadow-card sm:p-8">
      <div
        className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white/[0.07]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-28 h-64 w-64 rounded-full bg-accent-500/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-aqua-500/20 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          {eyebrow && (
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent-300">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            {title} {highlight && <span className="text-accent-400">{highlight}</span>}
            {suffix && ` ${suffix}`}
          </h1>
          {subtitle && <p className="mt-2 text-sm font-medium text-white/70">{subtitle}</p>}
          {actions.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {actions.map((a) => (
                <Link
                  key={`${a.href}-${a.label}`}
                  href={a.href}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition',
                    a.primary
                      ? 'bg-grad-brand text-white shadow-glow hover:brightness-110'
                      : 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20',
                  )}
                >
                  {a.icon && <a.icon className="h-4 w-4" aria-hidden />}
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {children && <div className="relative w-full lg:max-w-sm">{children}</div>}
      </div>
    </section>
  );
}

/** Frosted white panel used inside the hero's right-hand slot. */
export function HeroPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel bg-white/10 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-md">
      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/60">
        {title}
      </div>
      {children}
    </div>
  );
}
