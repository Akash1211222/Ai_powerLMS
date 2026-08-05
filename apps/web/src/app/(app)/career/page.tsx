'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  FolderGit2,
  GraduationCap,
  Rocket,
  MapPin,
  Link2,
  GitBranch,
  Users,
  FileText,
  Phone,
  CheckCircle2,
  Circle,
  Sparkles,
  Target,
  Trash2,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Card, Badge, Button, Input, Textarea, Select, Spinner, Alert, cn } from '@fca/ui';
import {
  careerApi,
  type CareerProfile,
  type ExperienceKind,
  type ProfileVisibility,
} from '@/lib/career-api';
import type { PlacementTier } from '@/lib/placement-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { SectionArtworkPanel } from '@/components/section-artwork';
import { RadialGauge } from '@/components/charts';

const tierMeta: Record<
  PlacementTier,
  { tone: 'success' | 'warning' | 'danger' | 'brand'; label: string; color: string; tip: string }
> = {
  READY: {
    tone: 'success',
    label: 'Placement ready',
    color: '#10b981',
    tip: 'You’re in the sweet spot — keep applying and refreshing projects.',
  },
  NEARLY_READY: {
    tone: 'brand',
    label: 'Nearly ready',
    color: '#2563eb',
    tip: 'One more project or skill boost and you’re launch-ready.',
  },
  DEVELOPING: {
    tone: 'warning',
    label: 'Developing',
    color: '#f59e0b',
    tip: 'Fill gaps in profile, skills, and experience to climb faster.',
  },
  NOT_READY: {
    tone: 'danger',
    label: 'Not ready yet',
    color: '#f43f5e',
    tip: 'Start with headline, resume link, and one solid project.',
  },
};

const kindLabel: Record<ExperienceKind, string> = {
  WORK: 'Work',
  EDUCATION: 'Education',
  CERTIFICATION: 'Certification',
  VOLUNTEER: 'Volunteer',
};

const kindIcon: Record<ExperienceKind, typeof Briefcase> = {
  WORK: Briefcase,
  EDUCATION: GraduationCap,
  CERTIFICATION: Sparkles,
  VOLUNTEER: Target,
};

type Tab = 'story' | 'projects' | 'timeline' | 'readiness';

type ProfileForm = Pick<
  CareerProfile,
  | 'headline'
  | 'summary'
  | 'location'
  | 'phone'
  | 'websiteUrl'
  | 'linkedinUrl'
  | 'githubUrl'
  | 'resumeUrl'
  | 'openToWork'
  | 'visibility'
>;

function toForm(p: CareerProfile): ProfileForm {
  return {
    headline: p.headline ?? '',
    summary: p.summary ?? '',
    location: p.location ?? '',
    phone: p.phone ?? '',
    websiteUrl: p.websiteUrl ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    githubUrl: p.githubUrl ?? '',
    resumeUrl: p.resumeUrl ?? '',
    openToWork: p.openToWork,
    visibility: p.visibility,
  };
}

function profileCompleteness(p: CareerProfile, form: ProfileForm) {
  const checks = [
    { id: 'headline', label: 'Headline', done: Boolean(form.headline?.trim()) },
    { id: 'summary', label: 'Summary', done: Boolean(form.summary?.trim()) },
    { id: 'location', label: 'Location', done: Boolean(form.location?.trim()) },
    { id: 'linkedin', label: 'LinkedIn', done: Boolean(form.linkedinUrl?.trim()) },
    { id: 'github', label: 'GitHub', done: Boolean(form.githubUrl?.trim()) },
    { id: 'resume', label: 'Resume link', done: Boolean(form.resumeUrl?.trim()) },
    { id: 'project', label: '≥1 project', done: p.projects.length > 0 },
    { id: 'experience', label: '≥1 experience', done: p.experiences.length > 0 },
  ];
  const done = checks.filter((c) => c.done).length;
  return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

export default function CareerPage() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'career-profile'], queryFn: careerApi.mine });
  const resumeQ = useQuery({ queryKey: ['me', 'resume'], queryFn: careerApi.resume });

  const [tab, setTab] = useState<Tab>('story');
  const [form, setForm] = useState<ProfileForm | null>(null);

  useEffect(() => {
    if (profileQ.data && !form) setForm(toForm(profileQ.data));
  }, [profileQ.data, form]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me', 'career-profile'] });
    qc.invalidateQueries({ queryKey: ['me', 'resume'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      const clean = <T,>(v: T | '') => (v === '' ? null : v);
      return careerApi.update({
        headline: clean(f.headline),
        summary: clean(f.summary),
        location: clean(f.location),
        phone: clean(f.phone),
        websiteUrl: clean(f.websiteUrl),
        linkedinUrl: clean(f.linkedinUrl),
        githubUrl: clean(f.githubUrl),
        resumeUrl: clean(f.resumeUrl),
        openToWork: f.openToWork,
        visibility: f.visibility,
      });
    },
    onSuccess: invalidate,
  });

  if (profileQ.isLoading || !form) return <Spinner />;
  if (profileQ.error || !profileQ.data) return <Alert tone="error">Could not load your profile.</Alert>;

  const profile = profileQ.data;
  const set = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f!, ...patch }));
  const readiness = resumeQ.data?.readiness;
  const tier = readiness ? tierMeta[readiness.tier] : tierMeta.DEVELOPING;
  const completeness = profileCompleteness(profile, form);
  const name = resumeQ.data?.identity.name ?? 'Your name';

  const tabs: Array<{ id: Tab; label: string; icon: typeof Rocket }> = [
    { id: 'story', label: 'Your story', icon: Sparkles },
    { id: 'projects', label: 'Projects', icon: FolderGit2 },
    { id: 'timeline', label: 'Timeline', icon: Briefcase },
    { id: 'readiness', label: 'Readiness', icon: Rocket },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Career cockpit"
        title="Build a profile"
        highlight="that gets interviews"
        subtitle={`${todayLabel()} · ${tier.label} · ${completeness.percent}% profile complete`}
        actions={[
          { label: 'Browse opportunities', href: '/opportunities', icon: Target, primary: true },
          { label: 'Practice soft skills', href: '/skills', icon: Sparkles },
        ]}
      >
        <HeroPanel title="Launch meter">
          <div className="flex items-center gap-3">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={tier.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(100, readiness?.readinessScore ?? completeness.percent)} ${100 - Math.min(100, readiness?.readinessScore ?? completeness.percent)}`}
                  pathLength={100}
                />
              </svg>
              <span className="absolute font-display text-sm font-extrabold">
                {readiness?.readinessScore ?? completeness.percent}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Readiness</div>
              <div className="truncate text-sm font-semibold">{tier.label}</div>
              {form.openToWork && (
                <span className="mt-1 inline-flex rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10px] font-extrabold text-emerald-950">
                  OPEN TO WORK
                </span>
              )}
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/career-hub-hero.png"
          alt="Career fox climbing the readiness staircase"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/40 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Career story</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            {form.headline?.trim() || 'Add a headline that recruiters remember'}
          </p>
          <p className="mt-1 truncate text-sm text-white/75">
            {name}
            {form.location ? ` · ${form.location}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip
          label="Profile"
          value={`${completeness.percent}%`}
          sub={`${completeness.done}/${completeness.total} checks`}
          accent="bg-grad-holo"
        />
        <StatChip label="Projects" value={profile.projects.length} accent="bg-grad-aqua" />
        <StatChip label="Experience" value={profile.experiences.length} accent="bg-grad-sunset" />
        <StatChip
          label="Top skills"
          value={resumeQ.data?.topSkills.length ?? 0}
          accent="bg-grad-mint"
        />
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
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'story' && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="relative flex flex-col gap-4 overflow-hidden">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-grad-aqua opacity-20 blur-2xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Professional story</h2>
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-chip/50 px-3 py-1.5 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={form.openToWork}
                  onChange={(e) => set({ openToWork: e.target.checked })}
                  className="h-4 w-4 accent-brand-500"
                />
                Open to work
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-faint">Headline</span>
              <Input
                value={form.headline ?? ''}
                onChange={(e) => set({ headline: e.target.value })}
                placeholder="Aspiring Full-Stack Engineer · React & Node"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-faint">Summary</span>
              <Textarea
                rows={4}
                value={form.summary ?? ''}
                onChange={(e) => set({ summary: e.target.value })}
                placeholder="What you build, what you’re chasing, why teams should care…"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field icon={MapPin} label="Location">
                <Input
                  value={form.location ?? ''}
                  onChange={(e) => set({ location: e.target.value })}
                  placeholder="Bengaluru, IN"
                />
              </Field>
              <Field icon={Phone} label="Phone">
                <Input
                  value={form.phone ?? ''}
                  onChange={(e) => set({ phone: e.target.value })}
                  placeholder="+91…"
                />
              </Field>
              <Field icon={Users} label="LinkedIn">
                <Input
                  value={form.linkedinUrl ?? ''}
                  onChange={(e) => set({ linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/…"
                />
              </Field>
              <Field icon={GitBranch} label="GitHub">
                <Input
                  value={form.githubUrl ?? ''}
                  onChange={(e) => set({ githubUrl: e.target.value })}
                  placeholder="https://github.com/…"
                />
              </Field>
              <Field icon={Link2} label="Website">
                <Input
                  value={form.websiteUrl ?? ''}
                  onChange={(e) => set({ websiteUrl: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field icon={FileText} label="Resume URL">
                <Input
                  value={form.resumeUrl ?? ''}
                  onChange={(e) => set({ resumeUrl: e.target.value })}
                  placeholder="https://…/resume.pdf"
                />
              </Field>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-faint">Visibility</span>
              <Select
                value={form.visibility}
                onChange={(e) => set({ visibility: e.target.value as ProfileVisibility })}
              >
                <option value="PRIVATE">Private — only you and admins</option>
                <option value="PLACEMENT">Placement — visible to placement officers</option>
                <option value="PUBLIC">Public — anyone with the link</option>
              </Select>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => save.mutate()} loading={save.isPending} className="bg-grad-holo text-white shadow-glow">
                Save story
              </Button>
              {save.isSuccess && <span className="text-sm font-semibold text-success">Saved.</span>}
              {save.isError && (
                <span className="text-sm font-semibold text-danger">Could not save — check your URLs.</span>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <SectionArtworkPanel
              section="career"
              titleOverride={form.openToWork ? 'You’re on the market' : 'Craft your narrative'}
              blurbOverride={tier.tip}
            />
            <Card>
              <h3 className="font-display font-bold">Completion checklist</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {completeness.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm font-semibold">
                    {c.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                    ) : (
                      <Circle className="h-4 w-4 text-faint" aria-hidden />
                    )}
                    <span className={c.done ? 'text-ink' : 'text-faint'}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-grad-mint transition-all duration-700"
                  style={{ width: `${completeness.percent}%` }}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'projects' && <ProjectsSection profile={profile} onChange={invalidate} />}

      {tab === 'timeline' && <ExperiencesSection profile={profile} onChange={invalidate} />}

      {tab === 'readiness' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent-400/20 blur-2xl" />
            <h2 className="font-display text-lg font-bold">Placement readiness</h2>
            <p className="mt-1 text-sm text-faint">{tier.tip}</p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <RadialGauge
                percent={readiness?.readinessScore ?? completeness.percent}
                label={tier.label}
                color={tier.color}
                size={160}
              />
              <Badge tone={tier.tone}>{tier.label}</Badge>
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link
                href="/opportunities"
                className="rounded-panel border border-hair bg-chip/40 px-3 py-3 text-sm font-bold transition hover:bg-chip"
              >
                View opportunities →
              </Link>
              <Link
                href="/skills"
                className="rounded-panel border border-hair bg-chip/40 px-3 py-3 text-sm font-bold transition hover:bg-chip"
              >
                Boost skills →
              </Link>
            </div>
          </Card>

          <Card>
            <h2 className="font-display font-bold">Skill signals for recruiters</h2>
            {resumeQ.data && resumeQ.data.topSkills.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-3">
                {resumeQ.data.topSkills.map((s) => (
                  <li key={s.name}>
                    <div className="mb-1 flex items-center justify-between text-sm font-bold">
                      <span>{s.name}</span>
                      <span className="text-brand-600">{s.score}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-track">
                      <div
                        className="h-full rounded-full bg-grad-holo transition-all duration-700"
                        style={{ width: `${s.score}%`, boxShadow: '0 0 10px rgba(37,99,235,0.35)' }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/artwork/mascot-career.png"
                  alt=""
                  className="att-mascot mx-auto h-28 w-auto"
                  aria-hidden
                />
                <p className="mt-2 text-sm text-faint">
                  Take quizzes and practice in Skills — top skills will show here for placement.
                </p>
                <Link href="/skills" className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">
                  Go to Skills academy →
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <div className={cn('mb-2 h-1 w-10 rounded-full', accent)} />
      <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
      <div className="font-display text-2xl font-extrabold leading-none">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] font-semibold text-faint">{sub}</div>}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-faint">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {label}
      </span>
      {children}
    </label>
  );
}

function ProjectsSection({ profile, onChange }: { profile: CareerProfile; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [skills, setSkills] = useState('');

  const add = useMutation({
    mutationFn: () =>
      careerApi.addProject({
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setUrl('');
      setSkills('');
      onChange();
    },
  });
  const del = useMutation({ mutationFn: careerApi.deleteProject, onSuccess: onChange });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col gap-3">
        {profile.projects.length === 0 ? (
          <Card className="py-12 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/artwork/mascot-career.png" alt="" className="att-mascot mx-auto h-28" aria-hidden />
            <p className="mt-2 font-semibold">Showcase your best builds</p>
            <p className="text-sm text-faint">Add a project with a live link — recruiters click these first.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {profile.projects.map((p, i) => (
              <Card
                key={p.id}
                className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-glow"
              >
                <div
                  className={cn(
                    'absolute inset-x-0 top-0 h-1',
                    i % 3 === 0 ? 'bg-grad-holo' : i % 3 === 1 ? 'bg-grad-sunset' : 'bg-grad-aqua',
                  )}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-bold group-hover:text-brand-600">{p.title}</h3>
                    {p.description && <p className="mt-1 text-xs text-faint line-clamp-3">{p.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => del.mutate(p.id)}
                    className="rounded-panel p-1.5 text-faint transition hover:bg-danger/10 hover:text-danger"
                    aria-label="Remove project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {p.skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.skills.map((s) => (
                      <Badge key={s} tone="brand">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                  >
                    Open project <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-panel bg-grad-aqua text-white">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="font-display font-bold">Add a project</h2>
        </div>
        <div className="flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (optional)" />
          <Input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Skills, comma-separated"
          />
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you built and the impact…"
          />
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={title.trim().length < 2}>
            Add project
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExperiencesSection({ profile, onChange }: { profile: CareerProfile; onChange: () => void }) {
  const [kind, setKind] = useState<ExperienceKind>('WORK');
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [current, setCurrent] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      careerApi.addExperience({
        kind,
        title: title.trim(),
        organization: organization.trim(),
        startDate,
        endDate: current || !endDate ? null : endDate,
        current,
      }),
    onSuccess: () => {
      setTitle('');
      setOrganization('');
      setStartDate('');
      setEndDate('');
      setCurrent(false);
      onChange();
    },
  });
  const del = useMutation({ mutationFn: careerApi.deleteExperience, onSuccess: onChange });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  const sorted = useMemo(
    () =>
      [...profile.experiences].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [profile.experiences],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <h2 className="mb-4 font-display font-bold">Career timeline</h2>
        {sorted.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-faint">No entries yet — add work, education, or certs.</p>
          </div>
        ) : (
          <ol className="relative border-l border-hair pl-5">
            {sorted.map((e) => {
              const Icon = kindIcon[e.kind];
              return (
                <li key={e.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[1.55rem] flex h-6 w-6 items-center justify-center rounded-full bg-grad-holo text-white shadow-glow">
                    <Icon className="h-3 w-3" aria-hidden />
                  </span>
                  <div className="rounded-panel border border-hair bg-chip/30 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{e.title}</span>
                          <Badge tone="neutral">{kindLabel[e.kind]}</Badge>
                          {e.current && <Badge tone="success">Current</Badge>}
                        </div>
                        <div className="mt-0.5 text-xs text-faint">
                          {e.organization} · {fmt(e.startDate)} –{' '}
                          {e.current ? 'Present' : e.endDate ? fmt(e.endDate) : '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => del.mutate(e.id)}
                        className="rounded-panel p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="h-fit">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-panel bg-grad-sunset text-white">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="font-display font-bold">Add experience</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ExperienceKind)}>
            {(Object.keys(kindLabel) as ExperienceKind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabel[k]}
              </option>
            ))}
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role or qualification" />
          <Input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Organization"
            className="sm:col-span-2"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Start</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">End</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={current} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={current}
              onChange={(e) => setCurrent(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            I currently work/study here
          </label>
          <div className="sm:col-span-2">
            <Button
              onClick={() => add.mutate()}
              loading={add.isPending}
              disabled={title.trim().length < 2 || organization.trim().length < 1 || !startDate}
            >
              Add entry
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
