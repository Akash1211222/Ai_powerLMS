'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, Badge, Button, Textarea, Spinner, Alert } from '@fca/ui';
import { communityApi } from '@/lib/community-api';

export default function CommunityPostPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const post = useQuery({ queryKey: ['community', 'post', id], queryFn: () => communityApi.getPost(id) });
  const clap = useMutation({
    mutationFn: () => communityApi.react(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'post', id] }),
  });
  const comment = useMutation({
    mutationFn: () => communityApi.comment(id, body.trim()),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['community', 'post', id] });
    },
  });

  if (post.isLoading) return <Spinner />;
  if (post.error || !post.data) return <Alert tone="error">Post not found.</Alert>;
  const p = post.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 dark:text-brand-300">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to feed
      </Link>
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Badge tone="brand">{p.kind}</Badge>
          {p.channel && (
            <span className="text-xs font-semibold text-faint">
              {p.channel.emoji} {p.channel.name}
            </span>
          )}
        </div>
        {p.title && <h1 className="mt-2 font-display text-2xl font-extrabold">{p.title}</h1>}
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p>
        {p.questionId && (
          <Link href={`/community/${p.questionId}`} className="mt-3 inline-block text-sm font-bold text-brand-600">
            Open Q&A thread →
          </Link>
        )}
        <button
          type="button"
          className="mt-4 text-sm font-bold text-faint hover:text-ink"
          onClick={() => clap.mutate()}
        >
          👏 {p.clapCount} {p.clappedByMe ? '· clapped' : ''}
        </button>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-display font-bold">Comments ({p.comments.length})</h2>
        {p.comments.map((c) => (
          <div key={c.id} className="rounded-panel bg-chip px-3 py-2.5">
            <div className="text-xs font-bold">
              {c.author.profile
                ? `${c.author.profile.firstName} ${c.author.profile.lastName}`
                : c.author.email}
            </div>
            <p className="mt-1 text-sm">{c.body}</p>
          </div>
        ))}
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" />
        <Button
          disabled={body.trim().length < 1 || comment.isPending}
          loading={comment.isPending}
          onClick={() => comment.mutate()}
        >
          Comment
        </Button>
      </Card>
    </div>
  );
}
