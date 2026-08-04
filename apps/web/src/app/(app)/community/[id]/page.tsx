'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Textarea, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { communityApi } from '@/lib/community-api';
import { IconCheck } from '@/components/icons';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const q = useQuery({ queryKey: ['community', 'question', id], queryFn: () => communityApi.get(id) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['community', 'question', id] });
    qc.invalidateQueries({ queryKey: ['community', 'questions'] });
  };

  const answer = useMutation({
    mutationFn: () => communityApi.answer(id, body.trim()),
    onSuccess: () => {
      setBody('');
      invalidate();
    },
  });
  const vote = useMutation({ mutationFn: communityApi.vote, onSuccess: invalidate });
  const accept = useMutation({
    mutationFn: (answerId: string) => communityApi.accept(id, answerId),
    onSuccess: invalidate,
  });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Question not found.</Alert>;
  const question = q.data;
  const isAsker = user?.id === question.author.id;
  const name = (a: typeof question.author) =>
    a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : a.email;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/community" className="text-sm font-semibold text-brand-500">
        ← Community
      </Link>

      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-extrabold tracking-tight">{question.title}</h1>
          <Badge tone={question.status === 'ANSWERED' ? 'success' : 'brand'}>
            {question.status.toLowerCase()}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm">{question.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          {question.tags.map((t) => (
            <Badge key={t} tone="neutral">{t}</Badge>
          ))}
          <span className="text-xs text-faint">
            asked by {name(question.author)} · {ago(question.createdAt)}
          </span>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-bold">
          {question.answers.length} answer{question.answers.length === 1 ? '' : 's'}
        </h2>
        <div className="flex flex-col gap-3">
          {question.answers.map((a) => (
            <Card key={a.id} className={a.isAccepted ? 'border-success/40' : undefined}>
              <div className="flex gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    onClick={() => vote.mutate(a.id)}
                    disabled={a.author.id === user?.id || vote.isPending}
                    title={a.author.id === user?.id ? 'You cannot upvote your own answer' : 'Upvote'}
                    className={`flex h-8 w-8 items-center justify-center rounded-panel border text-sm transition ${
                      a.votedByMe
                        ? 'border-brand-400 bg-brand-500 text-white'
                        : 'border-hair text-faint hover:border-brand-300 disabled:opacity-40'
                    }`}
                  >
                    ▲
                  </button>
                  <span className="text-sm font-bold">{a.voteCount}</span>
                </div>
                <div className="min-w-0 flex-1">
                  {a.isAccepted && (
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-success">
                      <IconCheck width={14} height={14} /> Accepted answer
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs text-faint">
                      {name(a.author)} · {ago(a.createdAt)}
                    </span>
                    {isAsker && !a.isAccepted && question.status !== 'CLOSED' && (
                      <button
                        onClick={() => accept.mutate(a.id)}
                        className="text-xs font-semibold text-brand-500 hover:underline"
                      >
                        Accept this answer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {question.answers.length === 0 && (
            <Card>
              <p className="text-sm text-faint">No answers yet — be the first to help.</p>
            </Card>
          )}
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">Your answer</h2>
        <Textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share what you know (min 10 characters)…"
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => answer.mutate()} loading={answer.isPending} disabled={body.trim().length < 10}>
            Post answer
          </Button>
          {answer.isError && <span className="text-sm text-danger">Could not post your answer.</span>}
        </div>
      </Card>
    </div>
  );
}
