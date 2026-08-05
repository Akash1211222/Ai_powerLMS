'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Building2,
  ExternalLink,
  Filter,
  GraduationCap,
  Handshake,
  MapPin,
  Quote,
  Search,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert, cn } from '@fca/ui';
import {
  alumniApi,
  type AlumniDirectoryEntry,
  type AlumniProfile,
  type UpdateAlumniInput,
} from '@/lib/alumni-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

type Form = Pick<
  AlumniProfile,
  | 'graduationYear'
  | 'currentCompany'
  | 'currentRole'
  | 'industry'
  | 'location'
  | 'story'
  | 'linkedinUrl'
  | 'isPublished'
  | 'openToMentoring'
  | 'openToReferrals'
>;

type Tab = 'map' | 'directory' | 'stories' | 'profile';

function toForm(p: AlumniProfile): Form {
  return {
    graduationYear: p.graduationYear,
    currentCompany: p.currentCompany ?? '',
    currentRole: p.currentRole ?? '',
    industry: p.industry ?? '',
    location: p.location ?? '',
    story: p.story ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    isPublished: p.isPublished,
    openToMentoring: p.openToMentoring,
    openToReferrals: p.openToReferrals,
  };
}

export default function AlumniPage() {
  const qc = useQueryClient();
  const directory = useQuery({ queryKey: ['alumni'], queryFn: alumniApi.directory });
  const outcomes = useQuery({ queryKey: ['alumni', 'outcomes'], queryFn: alumniApi.outcomes });
  const profile = useQuery({ queryKey: ['me', 'alumni-profile'], queryFn: alumniApi.mine });

  const [tab, setTab] = useState<Tab>('map');
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [mentorsOnly, setMentorsOnly] = useState(false);

  useEffect(() => {
    if (profile.data && !form) setForm(toForm(profile.data));
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      const clean = (v: string | null) => (v === '' ? null : v);
      const input: UpdateAlumniInput = {
        graduationYear: f.graduationYear ? Number(f.graduationYear) : null,
        currentCompany: clean(f.currentCompany),
        currentRole: clean(f.currentRole),
        industry: clean(f.industry),
        location: clean(f.location),
        story: clean(f.story),
        linkedinUrl: clean(f.linkedinUrl),
        isPublished: f.isPublished,
        openToMentoring: f.openToMentoring,
        openToReferrals: f.openToReferrals,
      };
      return alumniApi.update(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alumni'] });
      qc.invalidateQueries({ queryKey: ['alumni', 'outcomes'] });
      qc.invalidateQueries({ queryKey: ['me', 'alumni-profile'] });
    },
  });

  const people = directory.data ?? [];
  const o = outcomes.data;
  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) if (p.industry?.trim()) set.add(p.industry.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filtered = useMemo(() => {
    let list = [...people];
    if (industryFilter !== 'ALL') list = list.filter((p) => p.industry === industryFilter);
    if (mentorsOnly) list = list.filter((p) => p.openToMentoring);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.currentCompany ?? '').toLowerCase().includes(q) ||
          (p.currentRole ?? '').toLowerCase().includes(q) ||
          (p.location ?? '').toLowerCase().includes(q) ||
          (p.industry ?? '').toLowerCase().includes(q) ||
          (p.story ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [people, industryFilter, mentorsOnly, query]);

  const stories = useMemo(
    () => people.filter((p) => Boolean(p.story?.trim())).slice(0, 24),
    [people],
  );

  if (directory.isLoading) return <Spinner />;
  if (directory.error) return <Alert tone="error">Could not load the alumni network.</Alert>;

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));
  const mentorCount = people.filter((p) => p.openToMentoring).length;
  const storyCount = stories.length;

  const tabs: Array<{ id: Tab; label: string; icon: typeof GraduationCap; count?: number }> = [
    { id: 'map', label: 'Destiny', icon: Sparkles },
    { id: 'directory', label: 'Directory', icon: Users, count: people.length },
    { id: 'stories', label: 'Stories', icon: BookOpen, count: storyCount },
    { id: 'profile', label: 'My profile', icon: GraduationCap },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Alumni legacy lounge"
        title="See where grads"
        highlight="actually land"
        subtitle={`${todayLabel()} · ${o?.totalAlumni ?? people.length} alumni · ${mentorCount} open to mentoring`}
        actions={[
          { label: 'Book a mentor', href: '/mentorship', icon: Handshake, primary: true },
          { label: 'Career cockpit', href: '/career', icon: Target },
        ]}
      >
        <HeroPanel title="Network pulse">
          <div className="font-display text-3xl font-extrabold">{o?.totalAlumni ?? people.length}</div>
          <div className="text-xs text-white/60">published outcomes</div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/alumni-hub-hero.png"
          alt="Graduating fox with holographic map of career destinations"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/45 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Legacy</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">Proof of outcome, not just promises</p>
          <p className="mt-1 text-sm text-white/75">
            Companies, industries, and advice from people who walked this path.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Alumni" value={o?.totalAlumni ?? people.length} accent="bg-grad-holo" icon={GraduationCap} />
        <StatChip label="Mentoring" value={o?.openToMentoring ?? mentorCount} accent="bg-grad-mint" icon={Handshake} />
        <StatChip label="Companies" value={o?.topCompanies.length ?? 0} accent="bg-grad-aqua" icon={Building2} />
        <StatChip label="Stories" value={storyCount} accent="bg-grad-sunset" icon={Quote} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
              {typeof t.count === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-extrabold',
                    active ? 'bg-white/20' : 'bg-chip text-faint',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'map' && <OutcomesMap outcomes={o} people={people} onBrowse={() => setTab('directory')} />}

      {tab === 'directory' && (
        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-faint" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide text-faint">Tune the directory</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] lg:grid-cols-[1.4fr_220px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, company, role, city…"
                    className="pl-9"
                  />
                </div>
                <select
                  className="cursor-pointer rounded-panel border border-hair bg-panel px-3 py-2 text-sm font-semibold"
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                >
                  <option value="ALL">All industries</option>
                  {industries.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-panel border border-hair bg-chip/40 px-3 py-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={mentorsOnly}
                    onChange={(e) => setMentorsOnly(e.target.checked)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  Mentors only
                </label>
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="py-10 text-center">
              <Users className="mx-auto h-10 w-10 text-faint" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">No alumni match</p>
              <p className="mt-1 text-sm text-faint">Widen filters, or publish your own profile.</p>
              <Button className="mt-4 bg-grad-holo text-white" onClick={() => setTab('profile')}>
                Open my profile
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((a) => (
                <AlumniCard key={a.userId} a={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'stories' && (
        <div className="flex flex-col gap-4">
          {stories.length === 0 ? (
            <Card className="py-10 text-center">
              <Quote className="mx-auto h-10 w-10 text-faint" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">No stories yet</p>
              <p className="mt-1 text-sm text-faint">Be the first graduate to leave advice for the next cohort.</p>
              <Button className="mt-4 bg-grad-holo text-white" onClick={() => setTab('profile')}>
                Share your story
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {stories.map((a) => (
                <StoryCard key={a.userId} a={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          {!form ? (
            <Spinner />
          ) : (
            <Card className="relative flex flex-col gap-4 overflow-hidden">
              <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-grad-sunset opacity-20 blur-2xl" />
              <div className="relative">
                <h2 className="font-display text-lg font-bold">My alumni profile</h2>
                <p className="text-sm text-faint">Show where you landed — and what you’d tell today’s students.</p>
              </div>
              <div className="relative grid gap-3 sm:grid-cols-2">
                <Field label="Company">
                  <Input
                    value={form.currentCompany ?? ''}
                    onChange={(e) => set({ currentCompany: e.target.value })}
                    placeholder="Acme Analytics"
                  />
                </Field>
                <Field label="Role">
                  <Input
                    value={form.currentRole ?? ''}
                    onChange={(e) => set({ currentRole: e.target.value })}
                    placeholder="Data Analyst"
                  />
                </Field>
                <Field label="Industry">
                  <Input
                    value={form.industry ?? ''}
                    onChange={(e) => set({ industry: e.target.value })}
                    placeholder="Technology"
                  />
                </Field>
                <Field label="Location">
                  <Input
                    value={form.location ?? ''}
                    onChange={(e) => set({ location: e.target.value })}
                    placeholder="Bengaluru"
                  />
                </Field>
                <Field label="Graduation year">
                  <Input
                    type="number"
                    value={form.graduationYear ?? ''}
                    onChange={(e) => set({ graduationYear: e.target.value ? Number(e.target.value) : null })}
                    placeholder="2024"
                  />
                </Field>
                <Field label="LinkedIn URL">
                  <Input
                    value={form.linkedinUrl ?? ''}
                    onChange={(e) => set({ linkedinUrl: e.target.value })}
                    placeholder="https://linkedin.com/in/…"
                  />
                </Field>
              </div>
              <Field label="Your advice to current students">
                <Textarea
                  rows={4}
                  value={form.story ?? ''}
                  onChange={(e) => set({ story: e.target.value })}
                  placeholder="What actually worked for you…"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <Toggle
                  checked={form.isPublished}
                  onChange={(v) => set({ isPublished: v })}
                  label="Show me in the directory"
                />
                <Toggle
                  checked={form.openToMentoring}
                  onChange={(v) => set({ openToMentoring: v })}
                  label="Open to mentoring"
                />
                <Toggle
                  checked={form.openToReferrals}
                  onChange={(v) => set({ openToReferrals: v })}
                  label="Open to referrals"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => save.mutate()} loading={save.isPending} className="bg-grad-holo text-white shadow-glow">
                  Save profile
                </Button>
                {save.isSuccess && <span className="text-sm text-success">Saved.</span>}
                {save.isError && (
                  <span className="text-sm text-danger">Could not save — check your LinkedIn URL.</span>
                )}
              </div>
            </Card>
          )}

          <Card className="relative h-fit overflow-hidden">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-mint opacity-30 blur-2xl" />
            <h3 className="relative mb-2 font-display text-lg font-bold">Why this matters</h3>
            <ul className="relative flex flex-col gap-2 text-sm text-faint">
              <li className="rounded-panel border border-hair bg-chip/40 px-3 py-2">
                Students use your landing as proof the program works.
              </li>
              <li className="rounded-panel border border-hair bg-chip/40 px-3 py-2">
                Mentoring & referrals open doors without cold outreach.
              </li>
              <li className="rounded-panel border border-hair bg-chip/40 px-3 py-2">
                One honest story beats ten generic placement promises.
              </li>
            </ul>
            <Link href="/mentorship" className="relative mt-4 inline-flex text-sm font-bold text-brand-500 hover:underline">
              Go to mentorship lounge →
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}

function OutcomesMap({
  outcomes,
  people,
  onBrowse,
}: {
  outcomes: Awaited<ReturnType<typeof alumniApi.outcomes>> | undefined;
  people: AlumniDirectoryEntry[];
  onBrowse: () => void;
}) {
  const topCompanies = outcomes?.topCompanies ?? [];
  const topIndustries = outcomes?.topIndustries ?? [];
  const maxCompany = Math.max(1, ...topCompanies.map((c) => c.count));
  const featured = people.filter((p) => p.openToMentoring).slice(0, 5);
  const total = outcomes?.totalAlumni ?? people.length;

  // Orbital positions for up to 5 destination nodes (percent of canvas)
  const orbitSlots = [
    { x: 50, y: 18, delay: '0s' },
    { x: 82, y: 38, delay: '0.4s' },
    { x: 72, y: 78, delay: '0.8s' },
    { x: 28, y: 78, delay: '1.2s' },
    { x: 18, y: 38, delay: '1.6s' },
  ];

  if (total === 0 && people.length === 0) {
    return (
      <div className="destiny-stage relative overflow-hidden rounded-card border border-white/10 py-16 text-center shadow-card">
        <DestinyBackdrop />
        <div className="relative z-10 px-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Sparkles className="h-7 w-7 text-accent-300" aria-hidden />
          </div>
          <p className="font-display text-2xl font-extrabold text-white">Destiny awaits its first signal</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            Publish where you landed — the constellation lights up as graduates share their path.
          </p>
          <Button className="mt-5 bg-grad-sunset text-white shadow-glow" onClick={onBrowse}>
            Browse directory
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Futuristic destiny stage */}
      <section className="destiny-stage relative overflow-hidden rounded-card border border-white/10 shadow-card">
        <DestinyBackdrop />

        <div className="relative z-10 grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          {/* Constellation canvas */}
          <div className="relative mx-auto aspect-square w-full max-w-[420px]">
            {/* Orbital rings */}
            <div className="destiny-ring absolute inset-[8%] rounded-full border border-white/10" />
            <div className="destiny-ring destiny-ring-slow absolute inset-[22%] rounded-full border border-dashed border-accent-400/25" />
            <div className="destiny-ring absolute inset-[38%] rounded-full border border-aqua-400/20" />

            {/* SVG beam links from center to orbs */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
              <defs>
                <linearGradient id="destinyBeam" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              {topCompanies.slice(0, 5).map((c, i) => {
                const slot = orbitSlots[i]!;
                return (
                  <line
                    key={c.company}
                    x1="50"
                    y1="50"
                    x2={slot.x}
                    y2={slot.y}
                    stroke="url(#destinyBeam)"
                    strokeWidth="0.35"
                    className="destiny-beam"
                    style={{ animationDelay: slot.delay }}
                  />
                );
              })}
            </svg>

            {/* Core */}
            <div className="destiny-core absolute left-1/2 top-1/2 z-20 flex h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a8a] via-[#0b1b3a] to-[#082f49] text-center shadow-[0_0_40px_rgba(249,115,22,0.35)] ring-2 ring-accent-400/40">
              <span className="font-display text-3xl font-extrabold leading-none text-white sm:text-4xl">{total}</span>
              <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.2em] text-accent-300">
                Destiny
              </span>
            </div>

            {/* Destination orbs */}
            {topCompanies.slice(0, 5).map((c, i) => {
              const slot = orbitSlots[i]!;
              const size = 56 + Math.round((c.count / maxCompany) * 28);
              const hues = ['from-orange-400 to-amber-500', 'from-sky-400 to-blue-600', 'from-emerald-400 to-teal-600', 'from-violet-400 to-indigo-600', 'from-rose-400 to-pink-600'];
              return (
                <div
                  key={c.company}
                  className="destiny-orb absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${slot.x}%`,
                    top: `${slot.y}%`,
                    width: size,
                    height: size,
                    animationDelay: slot.delay,
                  }}
                  title={`${c.company} · ${c.count}`}
                >
                  <div
                    className={cn(
                      'flex h-full w-full flex-col items-center justify-center rounded-full bg-gradient-to-br text-white shadow-[0_0_24px_rgba(14,165,233,0.35)] ring-2 ring-white/25',
                      hues[i % hues.length],
                    )}
                  >
                    <span className="font-display text-sm font-extrabold leading-none sm:text-base">{c.count}</span>
                    <span className="mt-0.5 max-w-[90%] truncate px-1 text-center text-[8px] font-bold uppercase tracking-wide opacity-90 sm:text-[9px]">
                      {c.company}
                    </span>
                  </div>
                </div>
              );
            })}

            {topCompanies.length === 0 && (
              <p className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-white/60">
                Company signals will orbit here
              </p>
            )}
          </div>

          {/* Right copy + industry arcs */}
          <div className="relative flex flex-col gap-5 text-white">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-accent-300">Destiny constellation</p>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                Where futures <span className="text-accent-400">actually land</span>
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/70">
                Each glowing node is a real company alumni joined — sized by how many grads made it there.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/50">
                Industry spectrum
              </h3>
              {topIndustries.length === 0 ? (
                <p className="text-sm text-white/55">Industries appear as the network grows.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {topIndustries.map((ind, i) => {
                    const pct = Math.round((ind.count / Math.max(1, total)) * 100);
                    const bars = ['bg-accent-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400', 'bg-rose-400'];
                    return (
                      <div key={ind.industry} className="group">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-bold text-white/90">{ind.industry}</span>
                          <span className="font-extrabold text-white/60">
                            {ind.count} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={cn(
                              'destiny-rail h-full rounded-full transition-all duration-700 group-hover:brightness-125',
                              bars[i % bars.length],
                            )}
                            style={{ width: `${Math.max(8, pct)}%`, animationDelay: `${i * 0.15}s` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
            >
              Enter the directory
              <Users className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {/* Ranked destinations + mentors */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="relative overflow-hidden border-hair/80 bg-gradient-to-br from-panel via-panel to-chip/40">
          <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-grad-holo opacity-15 blur-3xl" />
          <h2 className="relative mb-4 flex items-center gap-2 font-display text-lg font-bold">
            <Building2 className="h-5 w-5 text-brand-500" aria-hidden />
            Ranked destinations
          </h2>
          {topCompanies.length === 0 ? (
            <p className="text-sm text-faint">No company data yet.</p>
          ) : (
            <ul className="relative flex flex-col gap-3">
              {topCompanies.map((c, i) => {
                const rank = i + 1;
                const width = Math.round((c.count / maxCompany) * 100);
                return (
                  <li
                    key={c.company}
                    className="group relative overflow-hidden rounded-panel border border-hair bg-panel/80 p-3 transition hover:border-brand-300 hover:shadow-glow"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-grad-holo opacity-80" aria-hidden />
                    <div className="flex items-center gap-3 pl-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grad-holo font-display text-sm font-extrabold text-white shadow-card">
                        #{rank}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-display font-bold">{c.company}</span>
                          <span className="shrink-0 font-extrabold text-brand-600">{c.count}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft">
                          <div
                            className="h-full rounded-full bg-grad-aqua transition-all duration-500 group-hover:bg-grad-holo"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-36 w-36 rounded-full bg-grad-mint opacity-25 blur-3xl" />
          <h2 className="relative mb-1 flex items-center gap-2 font-display text-lg font-bold">
            <Handshake className="h-5 w-5 text-success" aria-hidden />
            Signal mentors
          </h2>
          <p className="relative mb-4 text-sm text-faint">Alumni open to guiding the next cohort.</p>
          {featured.length === 0 ? (
            <p className="text-sm text-faint">No mentors flagged yet — check Mentorship for help requests.</p>
          ) : (
            <ul className="relative flex flex-col gap-2.5">
              {featured.map((a, i) => (
                <li
                  key={a.userId}
                  className="flex items-center gap-3 rounded-panel border border-success/20 bg-gradient-to-r from-success/5 to-transparent px-3 py-2.5 transition hover:border-success/40"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grad-mint font-display text-sm font-extrabold text-white">
                    {a.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{a.name}</div>
                    <div className="truncate text-xs text-faint">
                      {[a.currentRole, a.currentCompany].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Badge tone="success">Live</Badge>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={onBrowse}
            className="relative mt-4 cursor-pointer text-sm font-bold text-brand-500 hover:underline"
          >
            Browse full directory →
          </button>
        </Card>
      </div>
    </div>
  );
}

function DestinyBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,#1e3a8a_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,#ea580c55_0%,transparent_45%),radial-gradient(ellipse_at_70%_90%,#0ea5e966_0%,transparent_50%),linear-gradient(145deg,#060d1f_0%,#0b1b3a_45%,#082f49_100%)]" />
      <div className="destiny-stars pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-56 w-56 rounded-full bg-accent-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" aria-hidden />
    </>
  );
}

function AlumniCard({ a }: { a: AlumniDirectoryEntry }) {
  const initial = a.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-grad-aqua" aria-hidden />
      <div className="flex items-start gap-3 pl-1">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel bg-grad-holo font-display text-lg font-extrabold text-white shadow-card">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold leading-tight">{a.name}</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {[a.currentRole, a.currentCompany].filter(Boolean).join(' · ') || 'Alumnus'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
            {a.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {a.location}
              </span>
            )}
            {a.graduationYear && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="h-3 w-3" aria-hidden />
                Class of {a.graduationYear}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {a.openToMentoring && <Badge tone="success">Mentoring</Badge>}
          {a.openToReferrals && <Badge tone="brand">Referrals</Badge>}
        </div>
      </div>

      {a.story && (
        <p className="line-clamp-3 pl-1 text-sm italic text-faint">
          <Quote className="mr-1 inline h-3.5 w-3.5 opacity-60" aria-hidden />
          {a.story}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-3 pl-1">
        {a.industry && <Badge tone="neutral">{a.industry}</Badge>}
        {a.linkedinUrl && (
          <a
            href={a.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
          >
            LinkedIn <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {a.openToMentoring && (
          <Link href="/mentorship" className="text-sm font-bold text-brand-500 hover:underline">
            Request help →
          </Link>
        )}
      </div>
    </Card>
  );
}

function StoryCard({ a }: { a: AlumniDirectoryEntry }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-sunset opacity-20 blur-2xl" />
      <Quote className="relative mb-3 h-8 w-8 text-accent-400/80" aria-hidden />
      <p className="relative text-base font-medium leading-relaxed text-ink">“{a.story}”</p>
      <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-hair pt-3">
        <div className="min-w-0">
          <div className="truncate font-bold">{a.name}</div>
          <div className="truncate text-xs text-faint">
            {[a.currentRole, a.currentCompany, a.graduationYear ? `'${String(a.graduationYear).slice(-2)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {a.openToMentoring && <Badge tone="success">Mentoring</Badge>}
      </div>
    </Card>
  );
}

function StatChip({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <div className={cn('h-1 w-10 rounded-full', accent)} />
        <Icon className="h-4 w-4 text-faint" aria-hidden />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-2xl font-extrabold leading-none">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-500"
      />
      {label}
    </label>
  );
}
