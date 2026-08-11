'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Check } from 'lucide-react';
import { Card, Button, Field, Input, Textarea, Spinner, Alert, Badge } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { assessmentsApi, type StaffAssessment } from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';

/**
 * Trainer review screen for a draft quiz.
 *
 * AI drafts the paper; nothing reaches a student until someone has read it.
 * This is where that reading happens — prompts, the marked answer and the
 * explanation are all editable, and publishing is the deliberate last step.
 *
 * Editing is refused server-side once the quiz is published or attempted, so
 * the page mirrors that rather than pretending the fields are live.
 */

type DraftOption = { text: string; isCorrect: boolean };
type DraftQuestion = {
  type: string;
  prompt: string;
  topic: string;
  explanation: string;
  points: number;
  options: DraftOption[];
};

/** Server shape -> editable local shape (nulls become empty strings). */
function toDraft(a: StaffAssessment): DraftQuestion[] {
  return a.questions.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    topic: q.topic ?? '',
    explanation: q.explanation ?? '',
    points: q.points,
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  }));
}

const OBJECTIVE = new Set(['MCQ', 'MULTI_SELECT', 'TRUE_FALSE']);

export default function AssessmentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const canEdit = user?.permissions.includes('assessment:create');

  const q = useQuery({
    queryKey: ['assessment', id, 'staff'],
    queryFn: () => assessmentsApi.getForStaff(id),
    enabled: Boolean(canEdit),
  });

  // Attempts only exist once the paper is live; this is where a trainer reads
  // the integrity signals for it.
  const attemptsQ = useQuery({
    queryKey: ['assessment', id, 'attempts'],
    queryFn: () => assessmentsApi.attempts(id),
    enabled: Boolean(canEdit) && q.data?.status !== 'DRAFT',
  });

  const [title, setTitle] = useState('');
  const [passingScore, setPassingScore] = useState<string>('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the form once the draft arrives. Keyed on id so navigating between
  // quizzes reloads rather than showing the previous paper.
  useEffect(() => {
    if (!q.data) return;
    setTitle(q.data.title);
    setPassingScore(q.data.passingScore == null ? '' : String(q.data.passingScore));
    setQuestions(toDraft(q.data));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      assessmentsApi.update(id, {
        title: title.trim(),
        ...(passingScore.trim() ? { passingScore: Number(passingScore) } : {}),
        questions: questions.map((qu) => ({
          type: qu.type,
          prompt: qu.prompt.trim(),
          topic: qu.topic.trim() || undefined,
          explanation: qu.explanation.trim() || undefined,
          points: qu.points,
          options: qu.options
            .filter((o) => o.text.trim())
            .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
        })),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      q.refetch();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const publish = useMutation({
    mutationFn: () => assessmentsApi.publish(id),
    onSuccess: () => router.push(`/assessments?batchId=${q.data?.batchId ?? ''}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not publish'),
  });

  if (!canEdit) return <Alert tone="error">You do not have access to review quizzes.</Alert>;
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Quiz not found.</Alert>;

  const locked = q.data.status !== 'DRAFT';

  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((qu, idx) => (idx === i ? { ...qu, ...patch } : qu)));
    setSaved(false);
  }
  function patchOption(qi: number, oi: number, patch: Partial<DraftOption>) {
    setQuestions((prev) =>
      prev.map((qu, idx) =>
        idx === qi
          ? { ...qu, options: qu.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : qu,
      ),
    );
    setSaved(false);
  }
  /** Single-answer types keep exactly one marked option. */
  function markCorrect(qi: number, oi: number) {
    setQuestions((prev) =>
      prev.map((qu, idx) => {
        if (idx !== qi) return qu;
        const single = qu.type !== 'MULTI_SELECT';
        return {
          ...qu,
          options: qu.options.map((o, j) => ({
            ...o,
            isCorrect: single ? j === oi : j === oi ? !o.isCorrect : o.isCorrect,
          })),
        };
      }),
    );
    setSaved(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/assessments?batchId=${q.data.batchId}`}
          className="text-sm font-semibold text-brand-500"
        >
          ← Assessments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Review quiz</span>
          </h1>
          <Badge tone={locked ? 'success' : 'warning'}>{q.data.status}</Badge>
        </div>
        <p className="mt-1 text-faint">
          Read every prompt and confirm the marked answer before this goes to the batch.
        </p>
      </div>

      {locked && (
        <Alert tone="warning">
          This quiz is {q.data.status.toLowerCase()} and can no longer be edited — students may
          already have sat it. Create a new quiz if the questions need to change.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !save.isPending && <Alert tone="success">Changes saved.</Alert>}

      {locked && (attemptsQ.data?.length ?? 0) > 0 && (
        <Card>
          <h2 className="font-bold">Attempts</h2>
          <p className="mt-1 text-sm text-faint">
            Tab-switches and pastes are reported by the student&apos;s browser, so treat them as
            a prompt to look closer rather than proof. The overrun flag is set by the server and
            is reliable.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-hair text-xs uppercase text-faint">
                <tr>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">Left tab</th>
                  <th className="px-2 py-2">Pasted</th>
                  <th className="px-2 py-2">Away</th>
                  <th className="px-2 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {attemptsQ.data!.map((at) => {
                  const name = at.student.profile
                    ? `${at.student.profile.firstName} ${at.student.profile.lastName}`
                    : at.student.email;
                  const noteworthy = at.blurCount >= 3 || at.pasteCount > 0 || at.autoSubmitted;
                  return (
                    <tr key={at.id} className="border-b border-hair">
                      <td className="px-2 py-1.5">{name}</td>
                      <td className="px-2 py-1.5">
                        {at.percent != null ? `${at.percent}%` : '—'}
                      </td>
                      <td className="px-2 py-1.5">{at.blurCount}</td>
                      <td className="px-2 py-1.5">{at.pasteCount}</td>
                      <td className="px-2 py-1.5">
                        {at.awayMs > 0 ? `${Math.round(at.awayMs / 1000)}s` : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {at.autoSubmitted && (
                          <Badge tone="danger" className="mr-1">
                            over time
                          </Badge>
                        )}
                        {!at.autoSubmitted && noteworthy && <Badge tone="warning">review</Badge>}
                        {!noteworthy && <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Title">
            {({ id: fid }) => (
              <Input
                id={fid}
                value={title}
                disabled={locked}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
          <Field label="Pass mark (%)">
            {({ id: fid }) => (
              <Input
                id={fid}
                type="number"
                min={0}
                max={100}
                value={passingScore}
                disabled={locked}
                onChange={(e) => {
                  setPassingScore(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
        </div>
      </Card>

      {questions.map((qu, i) => (
        <Card key={i}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-faint">
              Question {i + 1} · {qu.type}
            </span>
            {!locked && questions.length > 1 && (
              <Button
                variant="ghost"
                type="button"
                className="text-danger"
                onClick={() => {
                  setQuestions((prev) => prev.filter((_, idx) => idx !== i));
                  setSaved(false);
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Remove
              </Button>
            )}
          </div>

          <Field label="Prompt">
            {({ id: fid }) => (
              <Textarea
                id={fid}
                rows={2}
                value={qu.prompt}
                disabled={locked}
                onChange={(e) => patchQuestion(i, { prompt: e.target.value })}
              />
            )}
          </Field>

          {OBJECTIVE.has(qu.type) && (
            <div className="mt-3">
              <span className="text-sm font-medium">
                Answers{' '}
                <span className="text-xs font-normal text-faint">
                  — {qu.type === 'MULTI_SELECT' ? 'tick every correct option' : 'tick the correct one'}
                </span>
              </span>
              <ul className="mt-2 grid gap-2">
                {qu.options.map((o, j) => (
                  <li key={j} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => markCorrect(i, j)}
                      aria-label={o.isCorrect ? 'Correct answer' : 'Mark as correct'}
                      aria-pressed={o.isCorrect}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-panel ring-1 ring-inset transition-colors ${
                        o.isCorrect
                          ? 'bg-success/20 text-success ring-success/40'
                          : 'text-faint ring-hair hover:bg-chip'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <Input
                      value={o.text}
                      disabled={locked}
                      onChange={(e) => patchOption(i, j, { text: e.target.value })}
                    />
                    {!locked && qu.options.length > 2 && (
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label="Remove option"
                        onClick={() =>
                          patchQuestion(i, { options: qu.options.filter((_, k) => k !== j) })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {!locked && qu.options.length < 10 && (
                <Button
                  variant="ghost"
                  type="button"
                  className="mt-2"
                  onClick={() =>
                    patchQuestion(i, { options: [...qu.options, { text: '', isCorrect: false }] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add option
                </Button>
              )}
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Topic (drives skill tracking)">
              {({ id: fid }) => (
                <Input
                  id={fid}
                  value={qu.topic}
                  disabled={locked}
                  onChange={(e) => patchQuestion(i, { topic: e.target.value })}
                />
              )}
            </Field>
            <Field label="Explanation (shown after marking)">
              {({ id: fid }) => (
                <Input
                  id={fid}
                  value={qu.explanation}
                  disabled={locked}
                  onChange={(e) => patchQuestion(i, { explanation: e.target.value })}
                />
              )}
            </Field>
          </div>
        </Card>
      ))}

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || questions.length === 0}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() =>
              setQuestions((prev) => [
                ...prev,
                {
                  type: 'MCQ',
                  prompt: '',
                  topic: '',
                  explanation: '',
                  points: 1,
                  options: [
                    { text: '', isCorrect: true },
                    { text: '', isCorrect: false },
                  ],
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add question
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => publish.mutate()}
            disabled={publish.isPending || !saved}
            title={saved ? undefined : 'Save your changes before publishing'}
          >
            {publish.isPending ? 'Publishing…' : 'Publish to batch'}
          </Button>
          {!saved && (
            <span className="text-xs text-faint">Save before publishing.</span>
          )}
        </div>
      )}
    </div>
  );
}
