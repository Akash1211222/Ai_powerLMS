'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  Crosshair,
  ExternalLink,
  Filter,
  MapPin,
  Plus,
  Radar,
  Rocket,
  Send,
  Sparkles,
  Target,
  Users,
  Wifi,
} from 'lucide-react';
import { Card, Badge, Button, Input, Textarea, Select, Spinner, Alert, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import {
  opportunitiesApi,
  type DiscoverOpportunity,
  type Opportunity,
  type OpportunityType,
  type WorkMode,
} from '@/lib/opportunities-api';
import { applicationsApi, type Application, type ApplicationStatus, type ReviewStatus } from '@/lib/applications-api';
import { referralsApi } from '@/lib/referrals-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

const typeLabel: Record<OpportunityType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
};
const modeLabel: Record<WorkMode, string> = { ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid' };

const statusTone: Record<ApplicationStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  APPLIED: 'brand',
  UNDER_REVIEW: 'brand',
  SHORTLISTED: 'warning',
  INTERVIEW: 'warning',
  OFFERED: 'success',
  HIRED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

const PIPELINE_STEPS: ApplicationStatus[] = [
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFERED',
  'HIRED',
];

const statusLabel = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const REVIEW_STATUSES: ReviewStatus[] = ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED'];

function matchColor(score: number) {
  if (score >= 67) return '#10b981';
  if (score >= 34) return '#f59e0b';
  return '#f43f5e';
}

function matchTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 67) return 'success';
  if (score >= 34) return 'warning';
  return 'danger';
}

type StudentTab = 'radar' | 'pipeline' | 'network';
type SortKey = 'match' | 'newest' | 'company';

export default function OpportunitiesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('placement:manage');
  return canManage ? <ManageView /> : <DiscoverView />;
}

// --- Student discovery --------------------------------------------------

function DiscoverView() {
  const q = useQuery({ queryKey: ['me', 'opportunities'], queryFn: opportunitiesApi.discover });
  const applications = useQuery({ queryKey: ['me', 'applications'], queryFn: applicationsApi.mine });
  const referrals = useQuery({ queryKey: ['me', 'referrals'], queryFn: referralsApi.mine });

  const [tab, setTab] = useState<StudentTab>('radar');
  const [typeFilter, setTypeFilter] = useState<OpportunityType | 'ALL'>('ALL');
  const [modeFilter, setModeFilter] = useState<WorkMode | 'ALL'>('ALL');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('match');
  const [query, setQuery] = useState('');

  const items = q.data ?? [];
  const myApps = (applications.data ?? []).filter((a) => a.status !== 'WITHDRAWN');
  const referredOn = new Set((referrals.data?.received ?? []).map((r) => r.opportunityId));

  const stats = useMemo(() => {
    const open = items.length;
    const applied = myApps.length;
    const avg =
      open === 0 ? 0 : Math.round(items.reduce((s, o) => s + o.match.matchScore, 0) / open);
    const hot = items.filter((o) => o.match.matchScore >= 67).length;
    const best = items.reduce((m, o) => Math.max(m, o.match.matchScore), 0);
    return { open, applied, avg, hot, best };
  }, [items, myApps.length]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (typeFilter !== 'ALL') list = list.filter((o) => o.type === typeFilter);
    if (modeFilter !== 'ALL') list = list.filter((o) => o.workMode === modeFilter);
    if (eligibleOnly) list = list.filter((o) => o.match.eligible && !o.applicationStatus);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.companyName.toLowerCase().includes(q) ||
          (o.location ?? '').toLowerCase().includes(q) ||
          o.requirements.some((r) => r.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      if (sort === 'match') return b.match.matchScore - a.match.matchScore;
      if (sort === 'company') return a.companyName.localeCompare(b.companyName);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [items, typeFilter, modeFilter, eligibleOnly, query, sort]);

  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="error">Could not load opportunities.</Alert>;

  const tabs: Array<{ id: StudentTab; label: string; icon: typeof Radar; count?: number }> = [
    { id: 'radar', label: 'Radar', icon: Radar, count: items.length },
    { id: 'pipeline', label: 'Pipeline', icon: Send, count: myApps.length },
    { id: 'network', label: 'Network', icon: Users, count: (referrals.data?.received.length ?? 0) + (referrals.data?.made.length ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Opportunity radar"
        title="Roles that"
        highlight="fit your signal"
        subtitle={`${todayLabel()} · ${stats.hot} strong matches · ${stats.applied} in pipeline`}
        actions={[
          { label: 'Polish career profile', href: '/career', icon: Sparkles, primary: true },
          { label: 'Skills academy', href: '/skills', icon: Target },
        ]}
      >
        <HeroPanel title="Best match">
          <div className="flex items-center gap-3">
            <MatchRing score={stats.best} size={64} stroke={3} />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Peak fit</div>
              <div className="truncate text-sm font-semibold">
                {stats.best > 0 ? `${stats.best}% on the board` : 'No open roles yet'}
              </div>
              <div className="mt-0.5 text-[11px] text-white/55">{stats.open} roles scanning</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/opportunities-hub-hero.png"
          alt="Fox at a holographic job radar console"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/45 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Match mission</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Sweep the board. Apply where you light up.
          </p>
          <p className="mt-1 text-sm text-white/75">
            Skills, readiness, and referrals stacked into one signal.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="On radar" value={stats.open} sub="open roles" accent="bg-grad-holo" />
        <StatChip label="In pipeline" value={stats.applied} sub="active apps" accent="bg-grad-aqua" />
        <StatChip label="Avg match" value={`${stats.avg}%`} sub="across board" accent="bg-grad-sunset" />
        <StatChip label="Hot fits" value={stats.hot} sub="≥67% match" accent="bg-grad-mint" />
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

      {tab === 'radar' && (
        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-aqua opacity-25 blur-2xl" />
            <div className="relative flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-faint" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide text-faint">Tune the radar</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, company, skill…"
                  className="lg:col-span-2"
                />
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as OpportunityType | 'ALL')}>
                  <option value="ALL">All types</option>
                  {(Object.keys(typeLabel) as OpportunityType[]).map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </Select>
                <Select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as WorkMode | 'ALL')}>
                  <option value="ALL">All modes</option>
                  {(Object.keys(modeLabel) as WorkMode[]).map((m) => (
                    <option key={m} value={m}>
                      {modeLabel[m]}
                    </option>
                  ))}
                </Select>
                <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="match">Sort: best match</option>
                  <option value="newest">Sort: newest</option>
                  <option value="company">Sort: company</option>
                </Select>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={eligibleOnly}
                  onChange={(e) => setEligibleOnly(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Show only roles I can apply to now
              </label>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <Crosshair className="h-10 w-10 text-faint" aria-hidden />
              <p className="font-display text-lg font-bold">No blips on this frequency</p>
              <p className="max-w-sm text-sm text-faint">
                Widen filters, or level up skills and readiness so more roles light up.
              </p>
              <Link href="/career" className="text-sm font-bold text-brand-500 hover:underline">
                Open career cockpit →
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((o) => (
                <DiscoverCard
                  key={o.id}
                  o={o}
                  referred={referredOn.has(o.id)}
                  canRefer={referrals.data?.canRefer ?? false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'pipeline' && <PipelineBoard apps={myApps} />}

      {tab === 'network' && (
        <NetworkPanel
          made={referrals.data?.made ?? []}
          received={referrals.data?.received ?? []}
          canRefer={referrals.data?.canRefer ?? false}
        />
      )}
    </div>
  );
}

function DiscoverCard({
  o,
  referred,
  canRefer,
}: {
  o: DiscoverOpportunity;
  referred: boolean;
  canRefer: boolean;
}) {
  const qc = useQueryClient();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [showRefer, setShowRefer] = useState(false);
  const [referEmail, setReferEmail] = useState('');
  const [referNote, setReferNote] = useState('');

  const refer = useMutation({
    mutationFn: () => referralsApi.create(o.id, referEmail.trim(), referNote.trim()),
    onSuccess: () => {
      setShowRefer(false);
      setReferEmail('');
      setReferNote('');
      qc.invalidateQueries({ queryKey: ['me', 'referrals'] });
    },
  });

  const apply = useMutation({
    mutationFn: () => applicationsApi.apply(o.id, note.trim() || undefined),
    onSuccess: () => {
      setShowNote(false);
      setNote('');
      qc.invalidateQueries({ queryKey: ['me', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['me', 'applications'] });
    },
  });

  const initial = o.companyName.trim().charAt(0).toUpperCase() || '?';
  const accent = matchColor(o.match.matchScore);

  return (
    <Card className="relative flex flex-col gap-4 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} aria-hidden />
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />

      <div className="relative flex items-start gap-3 pl-1">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel font-display text-lg font-extrabold text-white shadow-card"
          style={{ background: `linear-gradient(135deg, ${accent}, #0b1b3a)` }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold leading-tight">{o.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-faint">
            <span className="inline-flex items-center gap-1 font-semibold text-ink">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              {o.companyName}
            </span>
            {o.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {o.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3.5 w-3.5" aria-hidden />
              {modeLabel[o.workMode]}
            </span>
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" aria-hidden />
              {typeLabel[o.type]}
            </span>
          </div>
        </div>
        <MatchRing score={o.match.matchScore} size={56} stroke={3} />
      </div>

      <p className="line-clamp-3 pl-1 text-sm text-faint">{o.description}</p>

      {o.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {o.requirements.map((r) => {
            const has = o.match.matchedSkills.includes(r);
            return (
              <Badge key={r} tone={has ? 'success' : 'neutral'}>
                {has ? '✓ ' : ''}
                {r}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pl-1">
        {referred && <Badge tone="success">Referred for you</Badge>}
        {!o.match.eligible && <Badge tone="danger">Below readiness gate</Badge>}
        {o.applicationStatus && (
          <Badge tone={statusTone[o.applicationStatus as ApplicationStatus]}>
            {statusLabel(o.applicationStatus)}
          </Badge>
        )}
      </div>

      {showNote && (
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a short cover note (optional)…"
          className="ml-1"
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-3 pl-1">
        {o.applicationStatus ? (
          <span className="text-sm font-semibold text-faint">Already in your pipeline</span>
        ) : o.match.eligible ? (
          showNote ? (
            <Button onClick={() => apply.mutate()} loading={apply.isPending} className="bg-grad-holo text-white shadow-glow">
              Submit application
            </Button>
          ) : (
            <Button onClick={() => setShowNote(true)} className="bg-grad-holo text-white shadow-glow">
              <Rocket className="mr-1.5 h-4 w-4" aria-hidden />
              Apply
            </Button>
          )
        ) : (
          <Badge tone="warning">Needs readiness ≥ {o.minReadiness}</Badge>
        )}
        {apply.isError && <span className="text-sm text-danger">Could not apply.</span>}
        {o.applyUrl && (
          <a
            href={o.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-500 hover:underline"
          >
            External apply <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {canRefer && (
          <button
            type="button"
            onClick={() => setShowRefer((s) => !s)}
            className="cursor-pointer text-sm font-semibold text-brand-500 hover:underline"
          >
            {showRefer ? 'Cancel referral' : 'Refer someone'}
          </button>
        )}
      </div>

      {canRefer && showRefer && (
        <div className="ml-1 flex flex-col gap-2 rounded-panel bg-soft p-3">
          <Input
            type="email"
            value={referEmail}
            onChange={(e) => setReferEmail(e.target.value)}
            placeholder="Their email address"
          />
          <Textarea
            rows={2}
            value={referNote}
            onChange={(e) => setReferNote(e.target.value)}
            placeholder="Why you're vouching for them (min 10 characters)…"
          />
          <Button
            onClick={() => refer.mutate()}
            loading={refer.isPending}
            disabled={!referEmail.includes('@') || referNote.trim().length < 10}
          >
            Submit referral
          </Button>
          {refer.isSuccess && <span className="text-sm text-success">Referral sent.</span>}
          {refer.isError && (
            <span className="text-sm text-danger">Could not refer — check the email and try again.</span>
          )}
        </div>
      )}
    </Card>
  );
}

function PipelineBoard({ apps }: { apps: Application[] }) {
  if (apps.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Send className="h-10 w-10 text-faint" aria-hidden />
        <p className="font-display text-lg font-bold">Pipeline is clear</p>
        <p className="max-w-sm text-sm text-faint">Apply from the radar tab — your applications will orbit here by stage.</p>
      </Card>
    );
  }

  const byStatus = PIPELINE_STEPS.map((status) => ({
    status,
    rows: apps.filter((a) => a.status === status),
  })).filter((col) => col.rows.length > 0 || ['APPLIED', 'INTERVIEW', 'OFFERED'].includes(col.status));

  const other = apps.filter((a) => !PIPELINE_STEPS.includes(a.status));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {byStatus.map((col) => (
          <div
            key={col.status}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-card border border-hair bg-panel p-3 shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-faint">
                {statusLabel(col.status)}
              </span>
              <Badge tone={statusTone[col.status]}>{col.rows.length}</Badge>
            </div>
            {col.rows.length === 0 ? (
              <p className="rounded-panel border border-dashed border-hair px-2 py-6 text-center text-xs text-faint">
                Empty
              </p>
            ) : (
              col.rows.map((a) => <PipelineCard key={a.id} a={a} />)
            )}
          </div>
        ))}
      </div>
      {other.length > 0 && (
        <div className="flex flex-col gap-2">
          {other.map((a) => (
            <PipelineCard key={a.id} a={a} wide />
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineCard({ a, wide }: { a: Application; wide?: boolean }) {
  const stepIdx = PIPELINE_STEPS.indexOf(a.status);
  return (
    <div
      className={cn(
        'rounded-panel border border-hair bg-chip/40 p-3',
        wide && 'flex items-center justify-between gap-3',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{a.opportunity.title}</div>
        <div className="truncate text-xs text-faint">{a.opportunity.companyName}</div>
        {stepIdx >= 0 && (
          <div className="mt-2 flex gap-1" aria-hidden>
            {PIPELINE_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn('h-1 flex-1 rounded-full', i <= stepIdx ? 'bg-grad-holo' : 'bg-hair')}
              />
            ))}
          </div>
        )}
      </div>
      {wide && <Badge tone={statusTone[a.status]}>{statusLabel(a.status)}</Badge>}
    </div>
  );
}

function NetworkPanel({
  made,
  received,
  canRefer,
}: {
  made: Awaited<ReturnType<typeof referralsApi.mine>>['made'];
  received: Awaited<ReturnType<typeof referralsApi.mine>>['received'];
  canRefer: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-mint opacity-30 blur-2xl" />
        <h2 className="relative mb-3 font-display text-lg font-bold">Vouched for you</h2>
        {received.length === 0 ? (
          <p className="text-sm text-faint">No referrals yet — ask a peer who knows your work to vouch.</p>
        ) : (
          <ul className="relative flex flex-col gap-2">
            {received.map((r) => (
              <li key={r.id} className="rounded-panel border border-hair bg-chip/40 p-3">
                <div className="font-semibold">{r.opportunity.title}</div>
                <div className="text-xs text-faint">{r.opportunity.companyName}</div>
                <p className="mt-1 text-sm text-faint">{r.note}</p>
                <div className="mt-2">
                  <Badge tone="success">{r.status.toLowerCase()}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-grad-sunset opacity-30 blur-2xl" />
        <h2 className="relative mb-3 font-display text-lg font-bold">You referred</h2>
        {!canRefer && made.length === 0 ? (
          <p className="text-sm text-faint">Referral unlocks when you’re placement-ready enough to vouch.</p>
        ) : made.length === 0 ? (
          <p className="text-sm text-faint">Open a role on the radar and tap Refer someone.</p>
        ) : (
          <ul className="relative flex flex-col gap-2">
            {made.map((r) => (
              <li key={r.id} className="rounded-panel border border-hair bg-chip/40 p-3">
                <div className="font-semibold">{r.opportunity.title}</div>
                <div className="text-xs text-faint">
                  {r.opportunity.companyName}
                  {r.student?.email ? ` · ${r.student.email}` : ''}
                </div>
                <div className="mt-2">
                  <Badge tone="brand">{r.status.toLowerCase()}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// --- Staff management ---------------------------------------------------

function ManageView() {
  const qc = useQueryClient();
  const { org, isLoading: orgLoading } = useActiveOrg();
  const list = useQuery({
    queryKey: ['opportunities', org?.id],
    queryFn: () => opportunitiesApi.list(org!.id),
    enabled: Boolean(org?.id),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | Opportunity['status']>('ALL');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['opportunities', org?.id] });
  const publish = useMutation({ mutationFn: opportunitiesApi.publish, onSuccess: invalidate });
  const close = useMutation({ mutationFn: opportunitiesApi.close, onSuccess: invalidate });

  if (orgLoading || list.isLoading) return <Spinner />;
  if (!org) return <Alert tone="error">No organization found.</Alert>;

  const items = list.data?.data ?? [];
  const drafts = items.filter((o) => o.status === 'DRAFT').length;
  const open = items.filter((o) => o.status === 'OPEN').length;
  const closed = items.filter((o) => o.status === 'CLOSED').length;
  const visible = statusFilter === 'ALL' ? items : items.filter((o) => o.status === statusFilter);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Placement board"
        title="Post roles,"
        highlight="steer the pipeline"
        subtitle={`${todayLabel()} · ${open} open · ${drafts} draft · ${closed} closed`}
      >
        <HeroPanel title="Live openings">
          <div className="font-display text-3xl font-extrabold">{open}</div>
          <div className="text-xs text-white/60">roles accepting applications</div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/opportunities-hub-hero.png"
          alt="Fox at a holographic job radar console"
          className="h-36 w-full object-cover object-[center_30%] sm:h-44"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/40 to-transparent" />
        <div className="absolute bottom-4 left-4 text-white">
          <p className="font-display text-xl font-extrabold">Mission control for hiring</p>
          <p className="text-sm text-white/75">Draft → publish → review applicants in one board.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="Draft" value={drafts} accent="bg-grad-sunset" />
        <StatChip label="Open" value={open} accent="bg-grad-mint" />
        <StatChip label="Closed" value={closed} accent="bg-grad-aqua" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
          {(['ALL', 'DRAFT', 'OPEN', 'CLOSED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'cursor-pointer rounded-panel px-3 py-2 text-sm font-bold transition',
                statusFilter === s ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <Button
          onClick={() => {
            setShowCreate((v) => !v);
            if (!showCreate) {
              document.getElementById('post-role')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="bg-grad-holo text-white shadow-glow"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {showCreate ? 'Hide composer' : 'Post a role'}
        </Button>
      </div>

      <div className={cn('grid gap-6', showCreate && 'lg:grid-cols-[1fr_360px]')}>
        <div className="flex flex-col gap-3">
          {visible.length === 0 ? (
            <Card className="py-10 text-center">
              <p className="font-display text-lg font-bold">No roles in this lane</p>
              <p className="mt-1 text-sm text-faint">Post your first opportunity to start the board.</p>
            </Card>
          ) : (
            visible.map((o) => (
              <ManageCard
                key={o.id}
                o={o}
                onPublish={() => publish.mutate(o.id)}
                onClose={() => close.mutate(o.id)}
                busy={publish.isPending || close.isPending}
              />
            ))
          )}
        </div>
        {showCreate && (
          <div id="post-role">
            <CreateForm
              organizationId={org.id}
              onCreated={() => {
                invalidate();
                setShowCreate(false);
              }}
            />
          </div>
        )}
      </div>

      {!showCreate && (
        <div id="post-role" className="sr-only" aria-hidden />
      )}
    </div>
  );
}

function ManageCard({
  o,
  onPublish,
  onClose,
  busy,
}: {
  o: Opportunity;
  onPublish: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [showApplicants, setShowApplicants] = useState(false);
  const statusAccent =
    o.status === 'OPEN' ? '#10b981' : o.status === 'CLOSED' ? '#94a3b8' : '#f59e0b';

  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: statusAccent }} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold">{o.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-faint">
            <span className="font-semibold text-ink">{o.companyName}</span>
            {o.location && <span>· {o.location}</span>}
            <span>· {typeLabel[o.type]}</span>
            <span>· {modeLabel[o.workMode]}</span>
          </div>
        </div>
        <Badge tone={o.status === 'OPEN' ? 'success' : o.status === 'CLOSED' ? 'neutral' : 'warning'}>
          {o.status}
        </Badge>
      </div>
      {o.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {o.requirements.map((r) => (
            <Badge key={r} tone="neutral">
              {r}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-3 pl-1">
        {o.status !== 'OPEN' && (
          <Button onClick={onPublish} loading={busy} className="bg-grad-holo text-white shadow-glow">
            Publish
          </Button>
        )}
        {o.status === 'OPEN' && (
          <Button variant="secondary" onClick={onClose} loading={busy}>
            Close
          </Button>
        )}
        <button
          type="button"
          onClick={() => setShowApplicants((s) => !s)}
          className="cursor-pointer text-sm font-semibold text-brand-500 hover:underline"
        >
          {showApplicants ? 'Hide applicants' : 'View applicants'}
        </button>
      </div>
      {showApplicants && <Applicants opportunityId={o.id} />}
    </Card>
  );
}

function Applicants({ opportunityId }: { opportunityId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['opportunity', opportunityId, 'applications'],
    queryFn: () => applicationsApi.forOpportunity(opportunityId),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => applicationsApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunity', opportunityId, 'applications'] }),
  });

  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <p className="border-t border-hair pt-3 text-sm text-faint">No applicants yet.</p>;

  const TERMINAL = ['HIRED', 'REJECTED', 'WITHDRAWN'];
  return (
    <ul className="flex flex-col gap-2 border-t border-hair pt-3">
      {rows.map((a) => {
        const name = a.student.profile
          ? `${a.student.profile.firstName} ${a.student.profile.lastName}`
          : a.student.email;
        const terminal = TERMINAL.includes(a.status);
        return (
          <li key={a.id} className="flex items-center justify-between gap-3 rounded-panel bg-chip/40 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="text-xs text-faint">
                Readiness {a.readinessSnapshot ?? '—'} · Match {a.matchSnapshot ?? '—'}%
                {a.referralCount > 0 && ` · ${a.referralCount} referral${a.referralCount === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={statusTone[a.status]}>{statusLabel(a.status)}</Badge>
              {!terminal && (
                <Select
                  value=""
                  onChange={(e) =>
                    e.target.value && setStatus.mutate({ id: a.id, status: e.target.value as ReviewStatus })
                  }
                  className="h-9 w-36"
                >
                  <option value="">Move to…</option>
                  {REVIEW_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CreateForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<OpportunityType>('FULL_TIME');
  const [workMode, setWorkMode] = useState<WorkMode>('ONSITE');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [minReadiness, setMinReadiness] = useState('');

  const create = useMutation({
    mutationFn: () =>
      opportunitiesApi.create({
        organizationId,
        title: title.trim(),
        companyName: companyName.trim(),
        location: location.trim() || null,
        type,
        workMode,
        description: description.trim(),
        requirements: requirements
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        minReadiness: minReadiness ? Number(minReadiness) : null,
      }),
    onSuccess: () => {
      setTitle('');
      setCompanyName('');
      setLocation('');
      setDescription('');
      setRequirements('');
      setMinReadiness('');
      onCreated();
    },
  });

  const valid = title.trim().length >= 2 && companyName.trim().length >= 1 && description.trim().length >= 10;

  return (
    <Card className="sticky top-4 flex h-fit flex-col gap-3 overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-holo opacity-20 blur-2xl" />
      <h2 className="relative font-display text-lg font-bold">Post an opportunity</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role title" />
      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company" />
      <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value as OpportunityType)}>
          {(Object.keys(typeLabel) as OpportunityType[]).map((t) => (
            <option key={t} value={t}>
              {typeLabel[t]}
            </option>
          ))}
        </Select>
        <Select value={workMode} onChange={(e) => setWorkMode(e.target.value as WorkMode)}>
          {(Object.keys(modeLabel) as WorkMode[]).map((m) => (
            <option key={m} value={m}>
              {modeLabel[m]}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Role description (min 10 chars)…"
      />
      <Input
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
        placeholder="Required skills, comma-separated"
      />
      <Input
        type="number"
        value={minReadiness}
        onChange={(e) => setMinReadiness(e.target.value)}
        placeholder="Min readiness 0–100 (optional)"
        min={0}
        max={100}
      />
      <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!valid} className="bg-grad-holo text-white shadow-glow">
        Create draft
      </Button>
      {create.isError && <span className="text-sm text-danger">Could not create — check the fields.</span>}
    </Card>
  );
}

// --- Shared bits --------------------------------------------------------

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

function MatchRing({ score, size = 56, stroke = 3 }: { score: number; size?: number; stroke?: number }) {
  const color = matchColor(score);
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-hair" strokeWidth={stroke} />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${clamped} ${100 - clamped}`}
          pathLength={100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xs font-extrabold leading-none" style={{ color }}>
          {clamped}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-faint">fit</span>
      </div>
    </div>
  );
}
