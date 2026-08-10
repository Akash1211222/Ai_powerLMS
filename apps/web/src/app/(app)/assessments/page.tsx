'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Select, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { assessmentsApi } from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AssessmentsInner />
    </Suspense>
  );
}

function AssessmentsInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const batchId = params.get('batchId');
  const canCreate = user?.permissions.includes('assessment:create');

  if (canCreate && batchId) return <StaffAssessments batchId={batchId} />;
  return <StudentAssessments />;
}

function StaffAssessments({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [topicHint, setTopicHint] = useState('');
  // Matches the API's 3-15 range; the trainer decides how much to review.
  const [questionCount, setQuestionCount] = useState(8);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['assessments', batchId],
    queryFn: () => assessmentsApi.listForBatch(batchId),
  });

  const create = useMutation({
    mutationFn: () =>
      assessmentsApi.create({
        batchId,
        title: title.trim(),
        timeLimitMin: 30,
        passingScore: 60,
        questions: [
          {
            type: 'MCQ',
            prompt: 'What does LMS stand for?',
            topic: 'Fundamentals',
            points: 1,
            options: [
              { text: 'Learning Management System', isCorrect: true },
              { text: 'Large Media Server', isCorrect: false },
              { text: 'Local Memory Store', isCorrect: false },
              { text: 'Linked Module Script', isCorrect: false },
            ],
          },
          {
            type: 'TRUE_FALSE',
            prompt: 'Attendance can be corrected by student request.',
            topic: 'Attendance',
            points: 1,
            options: [
              { text: 'True', isCorrect: true },
              { text: 'False', isCorrect: false },
            ],
          },
          {
            type: 'MCQ',
            prompt: 'Which role manages job postings?',
            topic: 'Placement',
            points: 1,
            options: [
              { text: 'Placement Officer', isCorrect: true },
              { text: 'Alumni', isCorrect: false },
              { text: 'Recruiter only', isCorrect: false },
              { text: 'Mentor', isCorrect: false },
            ],
          },
        ],
      }),
    onSuccess: () => {
      setTitle('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['assessments', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const aiGenerate = useMutation({
    mutationFn: () =>
      assessmentsApi.aiGenerate({
        batchId,
        topicHint: topicHint.trim() || undefined,
        questionCount,
      }),
    onSuccess: () => {
      setTopicHint('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['assessments', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'AI generate failed'),
  });

  const publish = useMutation({
    mutationFn: (id: string) => assessmentsApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', batchId] }),
  });

  if (listQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/batches/${batchId}`} className="text-sm font-semibold text-brand-500">
          ← Batch
        </Link>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Assessments</span></h1>
      </div>

      <Card>
        <h2 className="font-bold">AI generate quiz</h2>
        <p className="mt-1 text-sm text-faint">
          Gemini drafts course-matched MCQ / true-false questions for this batch. Review and edit them, then publish.
        </p>
        {error && (
          <Alert tone="error" className="mt-2">
            {error}
          </Alert>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="Topic hint (optional)">
            {({ id }) => (
              <Input
                id={id}
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
                placeholder="e.g. async JavaScript, React hooks"
              />
            )}
          </Field>
          <Field label="Questions">
            {({ id }) => (
              <Select
                id={id}
                value={String(questionCount)}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
              >
                {[3, 5, 8, 10, 12, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} questions
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={() => aiGenerate.mutate()} disabled={aiGenerate.isPending}>
            {aiGenerate.isPending ? 'Generating…' : 'Generate with AI'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">Create quiz (sample questions included)</h2>
        <div className="mt-3">
          <Field label="Title">
            {({ id }) => (
              <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => create.mutate()}
            disabled={title.trim().length < 2 || create.isPending}
          >
            Create draft
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {(listQ.data ?? []).map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold">{a.title}</div>
                <div className="text-xs text-faint">
                  {a._count?.questions ?? 0} questions · {a.timeLimitMin ?? '—'} min
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                {a.status === 'DRAFT' && (
                  <>
                    {/* Review comes first — publishing unread AI output is the
                        thing this flow exists to prevent. */}
                    <Link href={`/assessments/${a.id}/review`}>
                      <Button size="sm">Review &amp; edit</Button>
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => publish.mutate(a.id)}>
                      Publish
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StudentAssessments() {
  const listQ = useQuery({
    queryKey: ['assessments', 'mine'],
    queryFn: () => assessmentsApi.mine(),
  });

  if (listQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">My assessments</span></h1>
        <p className="mt-1 text-faint">Take quizzes and review topic performance.</p>
      </div>
      {(listQ.data ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-faint">No published assessments yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(listQ.data ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Link href={`/assessments/${a.id}`} className="font-bold text-brand-600">
                    {a.title}
                  </Link>
                  <div className="text-xs text-faint">
                    {a.attempts?.[0]
                      ? a.attempts[0].percent != null
                        ? `Score ${a.attempts[0].percent}%`
                        : a.attempts[0].status
                      : 'Not attempted'}
                  </div>
                </div>
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
