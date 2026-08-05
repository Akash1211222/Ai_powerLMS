'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Wand2,
  Send,
  BrainCircuit,
  Layers,
  ClipboardList,
  Trophy,
  ArrowRight,
  Users,
} from 'lucide-react';
import {
  Card,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  statusTone,
  Spinner,
  Alert,
  cn,
} from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { assignmentsApi, type CodeLanguage } from '@/lib/lms-learning-api';
import { batchesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { langOf, scoreTone } from '@/lib/assignment-ui';
import { DashboardHero, HeroPanel } from '@/components/dashboard-hero';

const LANG_OPTIONS: Array<{ value: CodeLanguage; label: string }> = [
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'TYPESCRIPT', label: 'TypeScript' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'JAVA', label: 'Java' },
  { value: 'CPP', label: 'C++' },
  { value: 'C', label: 'C' },
  { value: 'SQL', label: 'SQL' },
  { value: 'WEB', label: 'Web (HTML/CSS/JS)' },
  { value: 'NONE', label: 'Written / no compiler' },
];

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AssignmentsInner />
    </Suspense>
  );
}

function AssignmentsInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const batchId = params.get('batchId');
  const canCreate = user?.permissions.includes('assignment:create');
  const canSubmit = user?.permissions.includes('assignment:submit');

  if (canCreate && batchId) return <StaffAssignments batchId={batchId} />;
  if (canCreate && !batchId) return <StaffBatchPicker />;
  if (canSubmit || !canCreate) return <StudentAssignments />;
  return <Alert tone="error">Select a batch to manage assignments.</Alert>;
}

function StaffBatchPicker() {
  const { org } = useActiveOrg();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['batches', org?.id],
    queryFn: () => batchesApi.list(org!.id),
    enabled: Boolean(org?.id),
  });

  if (!org || q.isLoading) return <Spinner />;
  const batches = q.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Teacher workspace"
        title="Pick a batch"
        highlight="to assign"
        subtitle="AI will match the course language and open the right compiler for every student."
      >
        <HeroPanel title="Tip">
          <p className="text-sm font-medium text-white/80">
            Python batches get a Python lab. Full Stack opens JavaScript. Java opens the Java compiler.
          </p>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {batches.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <p className="text-sm text-faint">No batches yet. Create one first.</p>
            <Link href="/batches" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-500">
              Go to batches <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Card>
        ) : (
          batches.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => router.push(`/assignments?batchId=${b.id}`)}
              className="group relative overflow-hidden rounded-card text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="absolute inset-0 bg-grad-holo opacity-90 transition group-hover:opacity-100" />
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
              <div className="relative flex min-h-[140px] flex-col justify-between p-5 text-white">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                    <Users className="h-3 w-3" aria-hidden /> Batch
                  </div>
                  <div className="font-display text-xl font-extrabold">{b.name}</div>
                  <div className="mt-1 text-sm text-white/70">{b.course?.title ?? b.code}</div>
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-accent-300">
                  Open assignments <ArrowRight className="h-4 w-4" aria-hidden />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StaffAssignments({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<CodeLanguage>('JAVASCRIPT');
  const [instructions, setInstructions] = useState('');
  const [topicHint, setTopicHint] = useState('');
  const [aiLanguage, setAiLanguage] = useState<CodeLanguage>('JAVASCRIPT');
  const [aiDifficulty, setAiDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  const listQ = useQuery({
    queryKey: ['assignments', batchId],
    queryFn: () => assignmentsApi.listForBatch(batchId),
  });

  const create = useMutation({
    mutationFn: () =>
      assignmentsApi.create({
        batchId,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        language,
        publish: true,
        criteria: [
          { title: 'Correctness', weight: 40 },
          { title: 'Code quality', weight: 30 },
          { title: 'Completeness', weight: 30 },
        ],
        aiEvaluationEnabled: true,
      }),
    onSuccess: () => {
      setTitle('');
      setInstructions('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['assignments', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const aiGen = useMutation({
    mutationFn: () =>
      assignmentsApi.aiGenerate({
        batchId,
        topicHint: topicHint.trim(),
        languageHint: aiLanguage === 'NONE' ? undefined : aiLanguage,
        difficulty: aiDifficulty,
        publish: true,
      }),
    onSuccess: () => {
      setTopicHint('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['assignments', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'AI generation failed'),
  });

  const publish = useMutation({
    mutationFn: (id: string) => assignmentsApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', batchId] }),
  });

  const items = listQ.data ?? [];
  const published = items.filter((a) => a.status === 'PUBLISHED').length;
  const totalSubs = items.reduce((s, a) => s + (a._count?.submissions ?? 0), 0);
  const aiCount = items.filter((a) => a.aiGenerated).length;

  if (listQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Teacher workspace"
        title="Batch"
        highlight="assignments"
        subtitle="AI writes course-matched labs and opens the right compiler for every student."
        actions={[
          { label: 'Back to batch', href: `/batches/${batchId}`, icon: Layers },
        ]}
      >
        <HeroPanel title="Batch pulse">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{items.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Total</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{published}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Live</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{totalSubs}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Subs</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Published" value={published} icon={ClipboardList} accent="bg-grad-aqua" />
        <MiniStat label="AI generated" value={aiCount} icon={BrainCircuit} accent="bg-grad-sunset" />
        <MiniStat label="Submissions" value={totalSubs} icon={Trophy} accent="bg-grad-mint" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex border-b border-hair">
          {(
            [
              { id: 'ai' as const, label: 'AI generate', icon: Wand2 },
              { id: 'manual' as const, label: 'Manual create', icon: Send },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold transition',
                mode === tab.id ? 'bg-grad-holo text-white' : 'bg-panel text-faint hover:text-ink',
              )}
            >
              <tab.icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-3">
            {mode === 'ai' ? (
              <>
                <div className="rounded-panel bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  <span className="font-bold">Topic-driven coding lab</span> — AI builds a relevant exercise
                  with runnable starter code for the in-browser emulator (JS / Python / SQL / etc.).
                </div>
                <Field label="Topic (required)">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={topicHint}
                      onChange={(e) => setTopicHint(e.target.value)}
                      placeholder="e.g. async await & promises, SQL joins, React state"
                    />
                  )}
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Emulator language">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={aiLanguage}
                        onChange={(e) => setAiLanguage(e.target.value as CodeLanguage)}
                      >
                        {LANG_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Difficulty">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={aiDifficulty}
                        onChange={(e) => setAiDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                      >
                        <option value="EASY">Easy</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HARD">Hard</option>
                      </Select>
                    )}
                  </Field>
                </div>
                <Button
                  onClick={() => aiGen.mutate()}
                  disabled={aiGen.isPending || topicHint.trim().length < 2}
                  className="w-fit"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                  {aiGen.isPending ? 'Generating…' : 'Generate & publish with AI'}
                </Button>
              </>
            ) : (
              <>
                <Field label="Title">
                  {({ id }) => (
                    <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />
                  )}
                </Field>
                <Field label="Compiler language">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
                    >
                      {LANG_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Instructions">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={4}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending || title.trim().length < 2}
                  className="w-fit"
                >
                  Publish to batch
                </Button>
              </>
            )}
            {error && <Alert tone="error">{error}</Alert>}
          </div>
          <div className="rounded-panel bg-grad-holo p-5 text-white">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent-300">
              What students get
            </div>
            <ul className="mt-3 space-y-2.5 text-sm text-white/85">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                Language-matched in-browser compiler
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                Starter code + clear acceptance criteria
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                Instant AI score that updates performance
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                You can override any grade anytime
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold">Assignment board</h2>
        {items.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">No assignments yet — generate one with AI above.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((a, i) => {
              const meta = langOf(a.language);
              const Icon = meta.Icon;
              return (
                <Link
                  key={a.id}
                  href={`/assignments/${a.id}?batchId=${batchId}`}
                  className="group animate-popIn"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <article className="overflow-hidden rounded-card border border-hair bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
                    <div className={cn('relative h-28 bg-gradient-to-br p-4 text-white', meta.cover)}>
                      <div className="pointer-events-none absolute -right-4 -bottom-6 font-display text-7xl font-extrabold text-white/15">
                        {meta.short}
                      </div>
                      <div className="relative flex items-start justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-panel bg-white/15 backdrop-blur">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <Badge tone={statusTone(a.status)} className="!bg-white/95 !text-[#0f1e3d]">
                          {a.status}
                        </Badge>
                      </div>
                      <div className="relative mt-4 font-display text-lg font-extrabold leading-tight">
                        {a.title}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={cn('rounded-full px-2.5 py-0.5 font-bold', meta.chip)}>
                          {meta.label}
                        </span>
                        {a.aiGenerated && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 font-extrabold uppercase tracking-wide text-brand-700">
                            <BrainCircuit className="h-3 w-3" aria-hidden /> AI
                          </span>
                        )}
                        <span className="text-faint">{a._count?.submissions ?? 0} subs</span>
                      </div>
                      {a.status === 'DRAFT' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            publish.mutate(a.id);
                          }}
                        >
                          Publish
                        </Button>
                      ) : (
                        <span className="text-xs font-bold text-brand-500 opacity-0 transition group-hover:opacity-100">
                          Review →
                        </span>
                      )}
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentAssignments() {
  const q = useQuery({ queryKey: ['assignments', 'mine'], queryFn: assignmentsApi.mine });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="error">Could not load assignments.</Alert>;

  const items = q.data ?? [];
  const done = items.filter((a) => {
    const s = a.submissions?.[0]?.evaluation?.finalScore ?? a.submissions?.[0]?.evaluation?.aiScore;
    return s != null;
  }).length;
  const todo = items.length - done;
  const avg =
    done > 0
      ? Math.round(
          items.reduce((sum, a) => {
            const s = a.submissions?.[0]?.evaluation?.finalScore ?? a.submissions?.[0]?.evaluation?.aiScore;
            return sum + (s ?? 0);
          }, 0) / done,
        )
      : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Your coding lab"
        title="Assignments"
        highlight="& compilers"
        subtitle="Course-matched work. Run code in the right compiler. Submit and get an AI score instantly."
      >
        <HeroPanel title="Your progress">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{todo}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">To do</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{done}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Scored</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{avg ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Avg</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-grad-holo text-white shadow-glow-aqua">
              <ClipboardList className="h-7 w-7" aria-hidden />
            </span>
            <p className="max-w-md text-sm text-faint">
              No published assignments yet. When you enroll in a course, AI creates matching work for your batch.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a, i) => {
            const sub = a.submissions?.[0];
            const meta = langOf(a.language);
            const Icon = meta.Icon;
            const score = sub?.evaluation?.finalScore ?? sub?.evaluation?.aiScore;
            const pct = score != null ? Math.round((score / a.maxScore) * 100) : null;
            return (
              <Link
                key={a.id}
                href={`/assignments/${a.id}`}
                className="group animate-popIn"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <article className="overflow-hidden rounded-card border border-hair bg-card shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
                  <div className={cn('relative h-32 bg-gradient-to-br p-4 text-white', meta.cover)}>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
                    <div className="pointer-events-none absolute -right-2 bottom-0 font-display text-6xl font-extrabold text-white/20">
                      {meta.short}
                    </div>
                    <div className="relative flex items-start justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-white/20 backdrop-blur">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      {score != null ? (
                        <div className="rounded-panel bg-white/95 px-2.5 py-1 text-right shadow-card dark:bg-[#0b1528]/95">
                          <div className={cn('font-display text-xl font-extrabold leading-none', scoreTone(pct ?? 0))}>
                            {score}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-300">/{a.maxScore}</div>
                        </div>
                      ) : (
                        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur">
                          {sub?.status ?? 'To do'}
                        </span>
                      )}
                    </div>
                    <h3 className="relative mt-5 line-clamp-2 font-display text-lg font-extrabold leading-snug">
                      {a.title}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className={cn('rounded-full px-2.5 py-0.5 font-bold', meta.chip)}>
                        {meta.label}
                      </span>
                      {a.dueAt && <span className="text-faint">Due {formatDate(a.dueAt)}</span>}
                      {a.aiGenerated && (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand-500">
                          <BrainCircuit className="h-3 w-3" aria-hidden /> AI
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-brand-500 opacity-0 transition group-hover:opacity-100">
                      Open →
                    </span>
                  </div>
                  {pct != null && (
                    <div className="px-4 pb-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-track">
                        <div
                          className="h-full rounded-full bg-grad-brand transition-[width]"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Trophy;
  accent: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-panel text-white', accent)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <div className="text-xs font-semibold text-faint">{label}</div>
        <div className="font-display text-2xl font-extrabold">{value}</div>
      </div>
    </Card>
  );
}
