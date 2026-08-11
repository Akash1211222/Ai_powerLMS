'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BrainCircuit,
  Sparkles,
  Trophy,
  RefreshCw,
  CheckCircle2,
  Play,
  Send,
  ArrowLeft,
  Target,
} from 'lucide-react';
import {
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Badge,
  statusTone,
  Spinner,
  Alert,
  cn,
} from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import {
  assignmentsApi,
  type CodeLanguage,
  type RunCodeResult,
  type SubmitResult,
} from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';
import { CodeWorkspace } from '@/components/code-workspace';
import { langOf, scoreTone } from '@/lib/assignment-ui';
import { DashboardHero, HeroPanel } from '@/components/dashboard-hero';
import { RadialGauge } from '@/components/charts';

export default function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const search = useSearchParams();
  const batchId = search.get('batchId');
  const canEvaluate = user?.permissions.includes('assignment:evaluate');

  if (canEvaluate) return <StaffReview id={id} batchId={batchId} />;
  return <StudentSubmit id={id} />;
}

function ScorePanel({
  score,
  maxScore,
  reason,
  confidence,
  criterionScores,
  criteria,
}: {
  score: number;
  maxScore: number;
  reason?: string | null;
  confidence?: number | null;
  criterionScores?: Array<{ criterionId: string; score: number; comment: string | null }>;
  criteria?: Array<{ id: string; title: string; weight: number }>;
}) {
  const pct = Math.round((score / Math.max(1, maxScore)) * 100);
  return (
    <div className="overflow-hidden rounded-card border border-accent-200 bg-card shadow-card dark:border-accent-400/30">
      <div className="relative overflow-hidden bg-grad-brand px-5 py-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Trophy className="h-3.5 w-3.5" aria-hidden /> Instant AI score
            </div>
            <div className="mt-1 font-display text-5xl font-extrabold leading-none">
              {score}
              <span className="text-xl font-bold text-white/70">/{maxScore}</span>
            </div>
            {confidence != null && (
              <div className="mt-2 text-xs text-white/75">
                {(confidence * 100).toFixed(0)}% confidence · updates overall performance
              </div>
            )}
          </div>
          <div className="rounded-panel bg-white/15 px-3 py-2 text-center backdrop-blur">
            <div className="font-display text-2xl font-extrabold">{pct}%</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Grade</div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-5">
        {reason && <p className="text-sm leading-relaxed text-ink">{reason}</p>}
        {criterionScores && criteria && criterionScores.length > 0 && (
          <ul className="space-y-2">
            {criterionScores.map((cs) => {
              const c = criteria.find((x) => x.id === cs.criterionId);
              const w = c?.weight ?? 1;
              const bar = Math.round((cs.score / Math.max(1, w)) * 100);
              return (
                <li key={cs.criterionId} className="rounded-panel bg-chip px-3 py-2.5">
                  <div className="mb-1.5 flex justify-between text-sm font-semibold">
                    <span>{c?.title ?? 'Criterion'}</span>
                    <span className={scoreTone(bar)}>
                      {cs.score}/{w}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-grad-aqua" style={{ width: `${bar}%` }} />
                  </div>
                  {cs.comment && (
                    <p className="mt-1.5 text-xs font-medium text-ink/75 dark:text-faint">{cs.comment}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StaffReview({ id, batchId }: { id: string; batchId: string | null }) {
  const qc = useQueryClient();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const subsQ = useQuery({
    queryKey: ['assignments', id, 'submissions'],
    queryFn: () => assignmentsApi.submissions(id),
    refetchInterval: 8000,
  });

  const evaluate = useMutation({
    mutationFn: (submissionId: string) => assignmentsApi.evaluate(submissionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', id, 'submissions'] }),
  });

  const review = useMutation({
    mutationFn: ({ submissionId, score }: { submissionId: string; score: number }) =>
      assignmentsApi.review(submissionId, score),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', id, 'submissions'] }),
  });

  if (subsQ.isLoading) return <Spinner />;

  const rows = subsQ.data ?? [];
  const graded = rows.filter((r) => r.evaluation?.finalScore != null);
  const avg =
    graded.length > 0
      ? Math.round(graded.reduce((s, r) => s + (r.evaluation?.finalScore ?? 0), 0) / graded.length)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Teacher review"
        title="Student"
        highlight="scores"
        subtitle="Live AI grades for the batch. Override any score when you want a human decision."
        actions={[
          {
            label: 'Back',
            href: batchId ? `/assignments?batchId=${batchId}` : '/assignments',
            icon: ArrowLeft,
          },
        ]}
      >
        <HeroPanel title="Class snapshot">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{rows.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Subs</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{graded.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Graded</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold text-accent-300">{avg ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Avg</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          {rows.length === 0 ? (
            <Card>
              <p className="text-sm text-faint">No submissions yet — students will appear here after they submit.</p>
            </Card>
          ) : (
            rows.map((s) => {
              const name = s.student.profile
                ? `${s.student.profile.firstName} ${s.student.profile.lastName}`
                : s.student.email;
              const initials = name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('');
              const open = expanded === s.id;
              const final = s.evaluation?.finalScore;
              return (
                <Card key={s.id} className="overflow-hidden p-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-chip/60"
                    onClick={() => setExpanded(open ? null : s.id)}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel bg-grad-holo font-display text-sm font-extrabold text-white">
                      {initials || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{name}</div>
                      <div className="truncate text-xs text-faint">{s.student.email}</div>
                    </div>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    <div className="w-16 text-right">
                      <div className="font-display text-xl font-extrabold text-accent-600">
                        {final ?? '—'}
                      </div>
                      <div className="text-[10px] font-bold text-faint">
                        AI {s.evaluation?.aiScore ?? '—'}
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-hair bg-soft/40 px-4 py-4">
                      {s.contentText && (
                        <pre className="mb-3 max-h-48 overflow-auto rounded-panel bg-[#0f1e3d] p-3 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                          {s.contentText.slice(0, 2000)}
                        </pre>
                      )}
                      {s.evaluation?.reason && (
                        <p className="mb-3 text-sm text-faint">{s.evaluation.reason}</p>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => evaluate.mutate(s.id)}>
                          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Re-run AI
                        </Button>
                        <Field label="Override score">
                          {({ id: fid }) => (
                            <Input
                              id={fid}
                              className="w-24"
                              placeholder="Score"
                              value={scores[s.id] ?? ''}
                              onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })}
                            />
                          )}
                        </Field>
                        <Button
                          size="sm"
                          onClick={() => {
                            const n = Number(scores[s.id]);
                            if (!Number.isFinite(n)) return;
                            review.mutate({ submissionId: s.id, score: n });
                          }}
                        >
                          Release override
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
        <Card className="flex flex-col items-center justify-center gap-2 py-6">
          <h3 className="text-sm font-bold text-faint">Class average</h3>
          <RadialGauge percent={avg ?? 0} label="avg score" color="#f97316" />
        </Card>
      </div>
    </div>
  );
}

function StudentSubmit({ id }: { id: string }) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ['assignments', 'mine', id],
    queryFn: () => assignmentsApi.getMine(id),
  });

  // Asked for explicitly: a hint nobody requested is a hint nobody reads,
  // and generating one per submission would spend a model call on the
  // many that pass.
  const hintQ = useMutation({
    mutationFn: () => assignmentsApi.hint(id),
  });

  const [code, setCode] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [lastOutput, setLastOutput] = useState('');
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instant, setInstant] = useState<SubmitResult['evaluation'] | null>(null);

  const a = detailQ.data?.assignment;
  const language = (a?.language ?? 'NONE') as CodeLanguage;
  const isCode = language !== 'NONE';
  const meta = langOf(language);
  const Icon = meta.Icon;

  const initialCode = useMemo(() => {
    if (!a) return '';
    return detailQ.data?.submission?.contentText ?? a.starterCode ?? '';
  }, [a, detailQ.data?.submission?.contentText]);

  const editorValue = code ?? initialCode;

  const submit = useMutation({
    mutationFn: () =>
      assignmentsApi.submit(id, {
        contentText: isCode ? editorValue : text.trim(),
        codeOutput: isCode ? lastOutput || undefined : undefined,
      }),
    onSuccess: (res) => {
      setError(null);
      setInstant(res.evaluation);
      qc.invalidateQueries({ queryKey: ['assignments', 'mine', id] });
      qc.invalidateQueries({ queryKey: ['assignments', 'mine'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'student'] });
      qc.invalidateQueries({ queryKey: ['intelligence'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Submit failed'),
  });

  if (detailQ.isLoading) return <Spinner />;
  if (detailQ.error || !a) return <Alert tone="error">Could not load assignment.</Alert>;

  const existingEval = instant ?? detailQ.data?.submission?.evaluation ?? null;
  const score = existingEval?.finalScore ?? existingEval?.aiScore;
  const step = score != null ? 3 : ran || (!isCode && text.trim().length >= 10) ? 2 : 1;

  function onRun(result: RunCodeResult) {
    setRan(true);
    const blob = [result.compileOutput, result.stdout, result.stderr, `exit=${result.exitCode}`]
      .filter(Boolean)
      .join('\n');
    setLastOutput(blob);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={cn('relative overflow-hidden rounded-card bg-gradient-to-br p-6 text-white shadow-card sm:p-8', meta.cover)}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 left-20 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
        <Link
          href="/assignments"
          className="relative inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Assignments
        </Link>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide backdrop-blur">
            <Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
            {isCode ? ' compiler' : ' brief'}
          </span>
          {a.aiGenerated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide backdrop-blur">
              <BrainCircuit className="h-3.5 w-3.5" aria-hidden /> AI assigned
            </span>
          )}
        </div>
        <h1 className="relative mt-3 max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {a.title}
        </h1>
        {a.description && <p className="relative mt-2 max-w-xl text-sm text-white/80">{a.description}</p>}

        <ol className="relative mt-6 flex flex-wrap gap-2">
          {[
            { n: 1, label: isCode ? 'Read & code' : 'Write answer', icon: Target },
            { n: 2, label: isCode ? 'Run compiler' : 'Review', icon: Play },
            { n: 3, label: 'AI score', icon: Trophy },
          ].map((s) => (
            <li
              key={s.n}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur transition',
                // Keep navy ink on white pills — theme `text-ink` flips light in dark mode.
                step >= s.n ? 'bg-white text-[#0f1e3d]' : 'bg-white/15 text-white/85',
              )}
            >
              {step > s.n ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" aria-hidden />
              ) : (
                <s.icon className="h-3.5 w-3.5" aria-hidden />
              )}
              {s.n}. {s.label}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-hair bg-chip px-4 py-3">
              <Sparkles className="h-4 w-4 text-accent-500" aria-hidden />
              <h2 className="font-display font-bold">Brief & rubric</h2>
            </div>
            <div className="p-5">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {a.instructions ?? '—'}
              </pre>
              {a.criteria.length > 0 && (
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {a.criteria.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-panel border border-hair p-3',
                        i === 0 && 'bg-brand-500/10 ring-1 ring-inset ring-brand-400/25 dark:bg-brand-400/15',
                        i === 1 && 'bg-accent-500/10 ring-1 ring-inset ring-accent-400/25 dark:bg-accent-400/15',
                        i >= 2 && 'bg-chip ring-1 ring-inset ring-hair',
                      )}
                    >
                      <div className="text-xs font-extrabold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                        {c.weight} pts
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-ink">{c.title}</div>
                      {c.description && (
                        <p className="mt-1 text-xs font-medium text-ink/75 dark:text-faint">{c.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {isCode ? (
            <CodeWorkspace
              language={language as Exclude<CodeLanguage, 'NONE'>}
              value={editorValue}
              onChange={setCode}
              onOutput={onRun}
            />
          ) : (
            <Card>
              <Field label="Your answer">
                {({ id: fid }) => (
                  <Textarea
                    id={fid}
                    rows={12}
                    value={text || detailQ.data?.submission?.contentText || ''}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write your response…"
                  />
                )}
              </Field>
            </Card>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <div className="sticky bottom-4 z-10">
            <Button
              className="w-full !text-white shadow-glow sm:w-auto"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || (isCode ? !editorValue.trim() : text.trim().length < 10)}
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden />
              {submit.isPending ? 'Scoring with AI…' : 'Submit & get AI score'}
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          {score != null && existingEval ? (
            <ScorePanel
              score={score}
              maxScore={a.maxScore}
              reason={existingEval.reason}
              confidence={existingEval.confidence}
              criterionScores={existingEval.criterionScores}
              criteria={a.criteria}
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="bg-grad-holo px-5 py-4 text-white">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent-300">
                  How it works
                </div>
                <h2 className="mt-1 font-display text-xl font-extrabold">Ready when you are</h2>
              </div>
              <ol className="space-y-3 p-5 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-700">
                    1
                  </span>
                  <span className="text-faint">
                    {isCode ? 'Edit the starter code in the compiler.' : 'Write a clear answer.'}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-extrabold text-accent-700">
                    2
                  </span>
                  <span className="text-faint">
                    {isCode ? 'Click Run and check the console.' : 'Double-check your points.'}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-700">
                    3
                  </span>
                  <span className="text-faint">Submit — AI grades instantly and updates performance.</span>
                </li>
              </ol>
            </Card>
          )}

          {detailQ.data?.submission && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-faint">Latest attempt</div>
              <div className="mt-2 flex items-center justify-between">
                <Badge tone={statusTone(detailQ.data.submission.status)}>
                  {detailQ.data.submission.status}
                </Badge>
                {score != null && (
                  <span className={cn('font-display text-lg font-extrabold', scoreTone((score / a.maxScore) * 100))}>
                    {score}/{a.maxScore}
                  </span>
                )}
              </div>

              {/* Test results: correctness measured by running the code, shown
                  case by case. Hidden cases report pass/fail only — their
                  inputs stay withheld so they cannot be special-cased. */}
              {detailQ.data.submission.testSummary && (
                <div className="mt-3 border-t border-hair pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-faint">Test cases</span>
                    <span
                      className={
                        detailQ.data.submission.testSummary.passed ===
                        detailQ.data.submission.testSummary.total
                          ? 'text-success'
                          : 'text-danger'
                      }
                    >
                      {detailQ.data.submission.testSummary.passed}/
                      {detailQ.data.submission.testSummary.total} passed
                    </span>
                  </div>
                  <ul className="mt-2 grid gap-1.5">
                    {(detailQ.data.submission.testResults ?? []).map((t, i) => (
                      <li key={t.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className={t.passed ? 'text-success' : 'text-danger'}>
                            {t.passed ? '✓' : '✗'}
                          </span>
                          <span className="truncate">
                            {t.name || `Case ${i + 1}`}
                            {t.isHidden && <span className="ml-1 text-faint">(hidden)</span>}
                            {t.timedOut && <span className="ml-1 text-danger">timed out</span>}
                          </span>
                        </div>
                        {!t.passed && !t.isHidden && t.expectedOutput != null && (
                          <div className="ml-5 mt-1 grid gap-0.5 font-mono text-[11px] text-faint">
                            <div>expected: {t.expectedOutput.trim() || '(empty)'}</div>
                            <div>actual: {(t.actualOutput ?? '').trim() || '(empty)'}</div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Offered only when something actually failed. */}
                  {detailQ.data.submission.testSummary.passed <
                    detailQ.data.submission.testSummary.total && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => hintQ.mutate()}
                        disabled={hintQ.isPending}
                      >
                        {hintQ.isPending ? 'Thinking…' : 'Why did this fail?'}
                      </Button>
                      {hintQ.data && (
                        <div className="mt-2 rounded-card border border-hair bg-chip p-3 text-xs">
                          <div className="font-semibold">
                            {hintQ.data.diagnosis}
                            {hintQ.data.line != null && (
                              <span className="ml-1 font-normal text-faint">
                                (line {hintQ.data.line})
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 leading-relaxed text-faint">
                            {hintQ.data.explanation}
                          </p>
                          <p className="mt-2 leading-relaxed">
                            <span className="font-semibold">Try this: </span>
                            {hintQ.data.hint}
                          </p>
                        </div>
                      )}
                      {hintQ.isError && (
                        <p className="mt-2 text-xs text-danger">Could not produce a hint.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
