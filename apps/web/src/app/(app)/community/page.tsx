'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert } from '@fca/ui';
import { communityApi, type QuestionStatus } from '@/lib/community-api';

const statusTone: Record<QuestionStatus, 'brand' | 'success' | 'neutral'> = {
  OPEN: 'brand',
  ANSWERED: 'success',
  CLOSED: 'neutral',
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function CommunityPage() {
  const qc = useQueryClient();
  const [tag, setTag] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');

  const questions = useQuery({
    queryKey: ['community', 'questions', tag],
    queryFn: () => communityApi.list(tag ?? undefined),
  });
  const tagList = useQuery({ queryKey: ['community', 'tags'], queryFn: communityApi.tags });

  const ask = useMutation({
    mutationFn: () =>
      communityApi.ask(
        title.trim(),
        body.trim(),
        tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5),
      ),
    onSuccess: () => {
      setAsking(false);
      setTitle('');
      setBody('');
      setTags('');
      qc.invalidateQueries({ queryKey: ['community'] });
    },
  });

  if (questions.isLoading) return <Spinner />;
  if (questions.error) return <Alert tone="error">Could not load the community.</Alert>;
  const items = questions.data?.data ?? [];
  const canAsk = title.trim().length >= 10 && body.trim().length >= 20;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Community</h1>
          <p className="mt-1 text-sm text-faint">
            Ask your cohort, alumni and trainers — every answer stays searchable.
          </p>
        </div>
        <Button onClick={() => setAsking((s) => !s)}>{asking ? 'Cancel' : 'Ask a question'}</Button>
      </div>

      {asking && (
        <Card className="flex flex-col gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your question in one line (min 10 chars)" />
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Give enough detail for someone to answer well (min 20 chars)…"
          />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated (e.g. sql, pandas)" />
          <div className="flex items-center gap-3">
            <Button onClick={() => ask.mutate()} loading={ask.isPending} disabled={!canAsk}>
              Post question
            </Button>
            {ask.isError && <span className="text-sm text-danger">Could not post — check the length limits.</span>}
          </div>
        </Card>
      )}

      {(tagList.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTag(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              tag === null ? 'bg-brand-500 text-white' : 'bg-soft text-faint hover:text-ink'
            }`}
          >
            All
          </button>
          {(tagList.data ?? []).map((t) => (
            <button
              key={t.tag}
              onClick={() => setTag(t.tag)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                tag === t.tag ? 'bg-brand-500 text-white' : 'bg-soft text-faint hover:text-ink'
              }`}
            >
              {t.tag} · {t.count}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">
            {tag ? `No questions tagged "${tag}" yet.` : 'No questions yet — ask the first one.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((q) => (
            <Link key={q.id} href={`/community/${q.id}`}>
              <Card className="transition hover:border-brand-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{q.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-faint">{q.body}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={statusTone[q.status]}>{q.status.toLowerCase()}</Badge>
                    <span className="text-xs text-faint">
                      {q._count.answers} answer{q._count.answers === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {q.tags.map((t) => (
                    <Badge key={t} tone="neutral">{t}</Badge>
                  ))}
                  <span className="text-xs text-faint">
                    {q.author.profile ? `${q.author.profile.firstName} ${q.author.profile.lastName}` : q.author.email} ·{' '}
                    {ago(q.createdAt)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
