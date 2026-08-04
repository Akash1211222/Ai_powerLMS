'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, Button, Spinner, Alert } from '@fca/ui';
import { assessmentsApi, type AttemptResult } from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';

export default function AssessmentAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => assessmentsApi.start(id),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not start'),
  });

  const submit = useMutation({
    mutationFn: () => {
      const questions = start.data?.questions ?? [];
      return assessmentsApi.submit(
        attemptId!,
        questions.map((q) => {
          const selected = answers[q.id];
          return { questionId: q.id, selectedOptionIds: selected ? [selected] : [] };
        }),
      );
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Submit failed'),
  });

  const mineQ = useQuery({
    queryKey: ['assessments', 'mine'],
    queryFn: () => assessmentsApi.mine(),
  });
  const assessment = (mineQ.data ?? []).find((a) => a.id === id);

  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/assessments" className="text-sm font-semibold text-brand-500">
          ← Assessments
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Results</span></h1>
        <Card>
          <div className="text-3xl font-extrabold">
            {result.percent ?? 0}%
          </div>
          <div className="mt-1 text-sm text-faint">
            {result.score}/{result.maxScore} points
          </div>
        </Card>
        {result.topics && result.topics.length > 0 ? (
          <Card>
            <h2 className="mb-3 font-bold">Topic performance</h2>
            <ul className="flex flex-col gap-2">
              {result.topics.map((t) => (
                <li key={t.topic} className="flex justify-between text-sm">
                  <span>{t.topic}</span>
                  <span className="font-semibold">
                    {t.correct}/{t.total} ({t.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : result.topicPerformance && result.topicPerformance.length > 0 ? (
          <Card>
            <h2 className="mb-3 font-bold">Topic performance</h2>
            <ul className="flex flex-col gap-2">
              {result.topicPerformance.map((t) => (
                <li key={t.topic} className="flex justify-between text-sm">
                  <span>{t.topic}</span>
                  <span className="font-semibold">
                    {t.correct}/{t.total} ({t.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  if (!attemptId) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/assessments" className="text-sm font-semibold text-brand-500">
          ← Assessments
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          {assessment?.title ?? 'Assessment'}
        </h1>
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <p className="text-sm text-faint">
            {assessment?.timeLimitMin
              ? `Time limit: ${assessment.timeLimitMin} minutes.`
              : 'No time limit.'}
            {assessment?.passingScore != null
              ? ` Passing score: ${assessment.passingScore}%.`
              : ''}
          </p>
          <div className="mt-4">
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              Start attempt
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const questions = start.data?.questions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">In progress</span></h1>
      {error && <Alert tone="error">{error}</Alert>}
      {questions.map((q, i) => (
        <Card key={q.id}>
          <div className="font-bold">
            {i + 1}. {q.prompt}
          </div>
          <div className="mt-1 text-xs text-faint">{q.points} pt</div>
          <ul className="mt-3 flex flex-col gap-2">
            {q.options.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === o.id}
                    onChange={() => setAnswers({ ...answers, [q.id]: o.id })}
                  />
                  {o.text}
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Button onClick={() => submit.mutate()} loading={submit.isPending}>
        Submit answers
      </Button>
    </div>
  );
}
