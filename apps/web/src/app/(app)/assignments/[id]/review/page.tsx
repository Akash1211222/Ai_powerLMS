'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Card, Button, Field, Input, Textarea, Spinner, Alert, Badge } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { assignmentsApi, type StaffAssignment } from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';

/**
 * Trainer review screen for a draft assignment.
 *
 * AI drafts the brief; this is where it gets read before a class sees it.
 * Until now there was no staff view of assignment content at all — the list
 * carried titles only, and the detail page showed submissions to grade — so a
 * generated draft was invisible to the person expected to approve it.
 *
 * Editing is refused server-side once published or submitted to, and the page
 * mirrors that rather than offering fields that would bounce.
 */

type DraftCriterion = { title: string; description: string; weight: number };
type DraftTestCase = { name: string; stdin: string; expectedOutput: string; isHidden: boolean };

/** Languages whose stdout the runner can compare against an expected value. */
const RUNNABLE = new Set(['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP']);

export default function AssignmentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const canEdit = user?.permissions.includes('assignment:create');

  const q = useQuery({
    queryKey: ['assignment', id, 'staff'],
    queryFn: () => assignmentsApi.getForStaff(id),
    enabled: Boolean(canEdit),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [criteria, setCriteria] = useState<DraftCriterion[]>([]);
  const [testCases, setTestCases] = useState<DraftTestCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const a: StaffAssignment | undefined = q.data;
    if (!a) return;
    setTitle(a.title);
    setDescription(a.description ?? '');
    setInstructions(a.instructions ?? '');
    setStarterCode(a.starterCode ?? '');
    setMaxScore(String(a.maxScore));
    setCriteria(
      a.criteria.map((c) => ({
        title: c.title,
        description: c.description ?? '',
        weight: c.weight,
      })),
    );
    setTestCases(
      (a.testCases ?? []).map((t) => ({
        name: t.name ?? '',
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        isHidden: t.isHidden,
      })),
    );
  }, [q.data]);

  const weightTotal = criteria.reduce((n, c) => n + (Number(c.weight) || 0), 0);

  const save = useMutation({
    mutationFn: () =>
      assignmentsApi.update(id, {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        maxScore: Number(maxScore) || 100,
        starterCode: starterCode.trim() ? starterCode : null,
        criteria: criteria.map((c) => ({
          title: c.title.trim(),
          description: c.description.trim() || undefined,
          weight: Number(c.weight),
        })),
        testCases: testCases
          .filter((t) => t.expectedOutput.trim())
          .map((t) => ({
            name: t.name.trim() || undefined,
            stdin: t.stdin,
            expectedOutput: t.expectedOutput,
            isHidden: t.isHidden,
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
    mutationFn: () => assignmentsApi.publish(id),
    onSuccess: () => router.push(`/assignments?batchId=${q.data?.batchId ?? ''}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not publish'),
  });

  if (!canEdit) return <Alert tone="error">You do not have access to review assignments.</Alert>;
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Assignment not found.</Alert>;

  const a = q.data;
  const locked = a.status !== 'DRAFT';

  function patchCriterion(i: number, patch: Partial<DraftCriterion>) {
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setSaved(false);
  }
  function patchTestCase(i: number, patch: Partial<DraftTestCase>) {
    setTestCases((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    setSaved(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/assignments?batchId=${a.batchId}`}
          className="text-sm font-semibold text-brand-500"
        >
          ← Assignments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Review assignment</span>
          </h1>
          <Badge tone={locked ? 'success' : 'warning'}>{a.status}</Badge>
          {a.aiGenerated && <Badge tone="brand">AI draft</Badge>}
          {a.language && a.language !== 'NONE' && <Badge tone="neutral">{a.language}</Badge>}
        </div>
        <p className="mt-1 text-faint">
          Read the brief and the starter code before this reaches the batch.
        </p>
      </div>

      {locked && (
        <Alert tone="warning">
          This assignment is {a.status.toLowerCase()} and can no longer be edited
          {(a._count?.submissions ?? 0) > 0
            ? ` — ${a._count?.submissions} submission(s) are already marked against this rubric.`
            : '.'}
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !save.isPending && <Alert tone="success">Changes saved.</Alert>}

      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
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
          <Field label="Max score">
            {({ id: fid }) => (
              <Input
                id={fid}
                type="number"
                min={1}
                value={maxScore}
                disabled={locked}
                onChange={(e) => {
                  setMaxScore(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Summary">
            {({ id: fid }) => (
              <Textarea
                id={fid}
                rows={2}
                value={description}
                disabled={locked}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">Brief the student sees</h2>
        <div className="mt-3">
          <Field label="Instructions">
            {({ id: fid }) => (
              <Textarea
                id={fid}
                rows={12}
                value={instructions}
                disabled={locked}
                className="font-mono text-xs"
                onChange={(e) => {
                  setInstructions(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">Starter code</h2>
        <p className="mt-1 text-sm text-faint">
          Loaded into the in-browser compiler when the student opens the task.
        </p>
        <div className="mt-3">
          <Field label={`Starter (${a.language ?? 'NONE'})`}>
            {({ id: fid }) => (
              <Textarea
                id={fid}
                rows={14}
                value={starterCode}
                disabled={locked}
                className="font-mono text-xs"
                placeholder="No starter code — the student begins from an empty editor."
                onChange={(e) => {
                  setStarterCode(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Rubric</h2>
          <span className={`text-sm ${weightTotal === 100 ? 'text-faint' : 'text-danger'}`}>
            Weights total {weightTotal}
            {weightTotal !== 100 && ' — should be 100'}
          </span>
        </div>
        <ul className="mt-3 grid gap-3">
          {criteria.map((c, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto] sm:items-end">
              <Field label="Criterion">
                {({ id: fid }) => (
                  <Input
                    id={fid}
                    value={c.title}
                    disabled={locked}
                    onChange={(e) => patchCriterion(i, { title: e.target.value })}
                  />
                )}
              </Field>
              <Field label="What it measures">
                {({ id: fid }) => (
                  <Input
                    id={fid}
                    value={c.description}
                    disabled={locked}
                    onChange={(e) => patchCriterion(i, { description: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Weight">
                {({ id: fid }) => (
                  <Input
                    id={fid}
                    type="number"
                    min={1}
                    max={100}
                    value={String(c.weight)}
                    disabled={locked}
                    onChange={(e) => patchCriterion(i, { weight: Number(e.target.value) })}
                  />
                )}
              </Field>
              {!locked && criteria.length > 1 && (
                <Button
                  variant="ghost"
                  type="button"
                  aria-label="Remove criterion"
                  onClick={() => {
                    setCriteria((prev) => prev.filter((_, idx) => idx !== i));
                    setSaved(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!locked && criteria.length < 20 && (
          <Button
            variant="ghost"
            type="button"
            className="mt-3"
            onClick={() => {
              setCriteria((prev) => [...prev, { title: '', description: '', weight: 10 }]);
              setSaved(false);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add criterion
          </Button>
        )}
      </Card>

      {RUNNABLE.has(a.language ?? 'NONE') && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Test cases</h2>
            <span className="text-sm text-faint">
              {testCases.length === 0
                ? 'No cases — correctness will be judged by AI alone'
                : `${testCases.length} case(s), ${testCases.filter((t) => t.isHidden).length} hidden`}
            </span>
          </div>
          <p className="mt-1 text-sm text-faint">
            The submitted code is run with each input and its output compared to the expected
            value. Hidden cases are withheld from the student, so a solution has to generalise
            instead of matching the examples it can see.
          </p>

          <ul className="mt-3 grid gap-3">
            {testCases.map((t, i) => (
              <li key={i} className="rounded-card border border-hair p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <Field label="Name (optional)">
                    {({ id: fid }) => (
                      <Input
                        id={fid}
                        value={t.name}
                        disabled={locked}
                        placeholder="e.g. empty input"
                        onChange={(e) => patchTestCase(i, { name: e.target.value })}
                      />
                    )}
                  </Field>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={t.isHidden}
                      disabled={locked}
                      onChange={(e) => patchTestCase(i, { isHidden: e.target.checked })}
                    />
                    Hidden
                  </label>
                  {!locked && (
                    <Button
                      variant="ghost"
                      type="button"
                      aria-label="Remove test case"
                      className="mb-1"
                      onClick={() => {
                        setTestCases((prev) => prev.filter((_, idx) => idx !== i));
                        setSaved(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Input (stdin)">
                    {({ id: fid }) => (
                      <Textarea
                        id={fid}
                        rows={3}
                        value={t.stdin}
                        disabled={locked}
                        className="font-mono text-xs"
                        onChange={(e) => patchTestCase(i, { stdin: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Expected output">
                    {({ id: fid }) => (
                      <Textarea
                        id={fid}
                        rows={3}
                        value={t.expectedOutput}
                        disabled={locked}
                        className="font-mono text-xs"
                        onChange={(e) => patchTestCase(i, { expectedOutput: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </li>
            ))}
          </ul>

          {!locked && testCases.length < 30 && (
            <Button
              variant="ghost"
              type="button"
              className="mt-3"
              onClick={() => {
                setTestCases((prev) => [
                  ...prev,
                  { name: '', stdin: '', expectedOutput: '', isHidden: false },
                ]);
                setSaved(false);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add test case
            </Button>
          )}
        </Card>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
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
          {!saved && <span className="text-xs text-faint">Save before publishing.</span>}
        </div>
      )}
    </div>
  );
}
