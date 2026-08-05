'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, Badge, Button, Spinner, Alert } from '@fca/ui';
import { communityApi } from '@/lib/community-api';

export default function CommunityGroupPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const group = useQuery({ queryKey: ['community', 'group', id], queryFn: () => communityApi.getGroup(id) });
  const join = useMutation({
    mutationFn: () => communityApi.joinGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'group', id] }),
  });
  const openChat = useMutation({
    mutationFn: () => communityApi.openConversation({ groupId: id }),
    onSuccess: (c) => {
      window.location.href = `/community?tab=messages&c=${c.id}`;
    },
  });

  if (group.isLoading) return <Spinner />;
  if (group.error || !group.data) return <Alert tone="error">Group not found.</Alert>;
  const g = group.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/community?tab=groups" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Groups
      </Link>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold">{g.name}</h1>
            <p className="mt-1 text-sm text-faint">{g.description || 'No description'}</p>
          </div>
          {g.joined ? <Badge tone="success">{g.myRole ?? 'MEMBER'}</Badge> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!g.joined && (
            <Button onClick={() => join.mutate()} loading={join.isPending}>
              Join group
            </Button>
          )}
          {g.joined && (
            <Button variant="secondary" onClick={() => openChat.mutate()} loading={openChat.isPending}>
              Open group chat
            </Button>
          )}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-display font-bold">Members ({g.members.length})</h2>
        <ul className="flex flex-col gap-2">
          {g.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between rounded-panel bg-chip px-3 py-2 text-sm">
              <span className="font-semibold">
                {m.user.profile
                  ? `${m.user.profile.firstName} ${m.user.profile.lastName}`
                  : m.user.email}
              </span>
              <Badge tone="neutral">{m.role}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
