'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Radio, Flame, BarChart3, ExternalLink, FileSpreadsheet, Sparkles } from 'lucide-react';
import { Card, Badge, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { liveApi } from '@/lib/live-api';
import { formatDate, formatTime } from '@/lib/format';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { SECTION_ART } from '@/lib/section-artwork';

export default function LiveHubPage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const canReport = user?.permissions.includes('student:view');
  const art = SECTION_ART.live;

  const upcoming = useQuery({ queryKey: ['live', 'upcoming'], queryFn: liveApi.upcoming });
  const streak = useQuery({ queryKey: ['streak'], queryFn: liveApi.streak });
  const reports = useQuery({
    queryKey: ['live', 'reports', org?.id],
    queryFn: () => liveApi.reports(org!.id),
    enabled: Boolean(canReport && org?.id),
  });

  const next = upcoming.data?.[0];
  const needsImport =
    (reports.data ?? []).filter((r) => r.status === 'LIVE' || r.status === 'ENDED').length > 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow={art.eyebrow}
        title="Live signal"
        highlight="deck"
        subtitle={`${todayLabel()} · Join Meet with your registered Google ID · attendance from Meet duration`}
        actions={[
          { label: 'Open calendar', href: '/calendar', icon: Radio },
          { label: 'Attendance', href: '/attendance', icon: Flame },
        ]}
      >
        <HeroPanel title="Next uplink">
          {next ? (
            <>
              <div className="truncate font-display text-lg font-extrabold">{next.title}</div>
              <div className="mt-1 text-xs text-white/65">
                {formatTime(next.startsAt)} · {next.batch?.name}
              </div>
              <Link
                href={`/live/${next.id}`}
                className="mt-3 inline-flex text-xs font-extrabold text-accent-300 hover:underline"
              >
                Enter classroom →
              </Link>
            </>
          ) : (
            <div className="text-sm text-white/70">No live sessions queued — check back soon.</div>
          )}
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={art.src}
          alt={art.alt}
          className="h-44 w-full object-contain object-right bg-gradient-to-br from-[#0b1b3a] via-[#123056] to-[#1a4a7a] sm:h-56"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/95 via-[#0b1b3a]/55 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-xl text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">
            Orbital classroom
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {art.title}
          </h2>
          <p className="mt-1.5 text-sm text-white/75">{art.blurb}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-sunset text-white">
            <Flame className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Current streak</div>
            <div className="font-display text-2xl font-extrabold">
              {streak.data?.currentStreak ?? 0}
              <span className="text-sm font-semibold text-faint"> days</span>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-aqua text-white">
            <Flame className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Longest streak</div>
            <div className="font-display text-2xl font-extrabold">
              {streak.data?.longestStreak ?? 0}
              <span className="text-sm font-semibold text-faint"> days</span>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-holo text-white">
            <Radio className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Upcoming</div>
            <div className="font-display text-2xl font-extrabold">{upcoming.data?.length ?? 0}</div>
          </div>
        </Card>
      </div>

      {canReport && (
        <Card className="border-accent-400/30 bg-gradient-to-br from-panel to-accent-500/5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-panel bg-grad-sunset text-white">
              <FileSpreadsheet className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold">Meet attendance import</h2>
              <p className="mt-1 text-sm text-faint">
                After class, export Google Meet’s attendance report and import it on the class page.
                Duration is matched to each student’s registered Google email (e.g. 1h of 2h = 50%).
                {needsImport ? ' Paste Meet AI notes as session summary for students.' : ''}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-display font-bold">Your upcoming live classes</h2>
        {upcoming.isLoading ? (
          <Spinner />
        ) : upcoming.isError ? (
          <Alert tone="error">Could not load live classes.</Alert>
        ) : (upcoming.data ?? []).length === 0 ? (
          <p className="text-sm text-faint">No upcoming live classes. Check back when your trainer schedules one.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.data!.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/live/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hair bg-chip px-3 py-3 transition hover:bg-brand-50 dark:hover:bg-white/5"
                >
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-xs text-faint">
                      {c.batch?.course?.title} · {c.batch?.name} · {formatDate(c.startsAt)}{' '}
                      {formatTime(c.startsAt)}
                    </div>
                  </div>
                  <Badge tone={c.status === 'LIVE' ? 'success' : 'brand'}>{c.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canReport && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-500" aria-hidden />
            <h2 className="font-display font-bold">Live attendance reports</h2>
          </div>
          <p className="mb-3 text-sm text-faint">
            Final marks come from Meet duration import. App join is a soft presence signal only.
          </p>
          {reports.isLoading ? (
            <Spinner />
          ) : (reports.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">No live-class reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reports.data!.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hair px-3 py-2.5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {r.title}
                      {r.hasSummary && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-accent-600">
                          <Sparkles className="h-3 w-3" /> Notes
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-faint">
                      {r.batch.name} · {formatDate(r.startsAt)} · {r.joinedCount} joined · avg{' '}
                      {r.avgWatchPercent}%
                    </div>
                  </div>
                  <Link href={`/live/${r.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
                    Details <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
