'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Hash,
  MessageCircle,
  MessagesSquare,
  Radio,
  Send,
  Users,
} from 'lucide-react';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert, cn } from '@fca/ui';
import {
  communityApi,
  type PostKind,
  type RsvpStatus,
  type Author,
} from '@/lib/community-api';
import { alumniApi } from '@/lib/alumni-api';
import { reputationApi } from '@/lib/reputation-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { useAuth } from '@/lib/auth-context';

type Tab = 'feed' | 'messages' | 'groups' | 'events';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function displayName(a: Author) {
  return a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : a.email;
}

function initials(a: Author) {
  if (a.profile) return `${a.profile.firstName[0] ?? ''}${a.profile.lastName[0] ?? ''}`.toUpperCase();
  return a.email.slice(0, 2).toUpperCase();
}

const KIND_LABEL: Record<PostKind, string> = {
  UPDATE: 'Update',
  SHOWCASE: 'Project showcase',
  QUESTION: 'Question',
  AMA: 'AMA thread',
};

export default function CommunityPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CommunityHub />
    </Suspense>
  );
}

function CommunityHub() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const search = useSearchParams();
  const initialTab = (search.get('tab') as Tab | null) ?? 'feed';
  const [tab, setTab] = useState<Tab>(
    ['feed', 'messages', 'groups', 'events'].includes(initialTab) ? initialTab : 'feed',
  );
  const [channelId, setChannelId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>('UPDATE');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [showcaseTitle, setShowcaseTitle] = useState('');
  const [showcaseSub, setShowcaseSub] = useState('');
  const [activeConv, setActiveConv] = useState<string | null>(search.get('c'));
  const [dmUserId, setDmUserId] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [groupName, setGroupName] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventWhen, setEventWhen] = useState('');
  const [roomTitle, setRoomTitle] = useState('');

  const stats = useQuery({ queryKey: ['community', 'stats'], queryFn: communityApi.stats });
  const channels = useQuery({ queryKey: ['community', 'channels'], queryFn: communityApi.channels });
  const posts = useQuery({
    queryKey: ['community', 'posts', channelId],
    queryFn: () => communityApi.posts({ channelId: channelId ?? undefined }),
  });
  const rooms = useQuery({
    queryKey: ['community', 'rooms'],
    queryFn: communityApi.studyRooms,
    refetchInterval: 15_000,
  });
  const alumni = useQuery({ queryKey: ['alumni'], queryFn: alumniApi.directory });
  const board = useQuery({ queryKey: ['community', 'leaderboard'], queryFn: reputationApi.leaderboard });
  const conversations = useQuery({
    queryKey: ['community', 'conversations'],
    queryFn: communityApi.conversations,
    enabled: tab === 'messages',
    refetchInterval: tab === 'messages' ? 8_000 : false,
  });
  const messages = useQuery({
    queryKey: ['community', 'messages', activeConv],
    queryFn: () => communityApi.messages(activeConv!),
    enabled: Boolean(activeConv) && tab === 'messages',
    refetchInterval: 5_000,
  });
  const groups = useQuery({
    queryKey: ['community', 'groups'],
    queryFn: communityApi.groups,
    enabled: tab === 'groups',
  });
  const events = useQuery({
    queryKey: ['community', 'events'],
    queryFn: () => communityApi.events(),
    enabled: tab === 'events',
  });

  const invalidateFeed = () => {
    qc.invalidateQueries({ queryKey: ['community'] });
  };

  const createPost = useMutation({
    mutationFn: () =>
      communityApi.createPost({
        body: body.trim(),
        title: title.trim() || undefined,
        kind,
        channelId,
        showcaseTitle: kind === 'SHOWCASE' ? showcaseTitle.trim() || undefined : undefined,
        showcaseSub: kind === 'SHOWCASE' ? showcaseSub.trim() || undefined : undefined,
        showcaseEmoji: kind === 'SHOWCASE' ? '📊' : undefined,
      }),
    onSuccess: () => {
      setBody('');
      setTitle('');
      setShowcaseTitle('');
      setShowcaseSub('');
      setComposerOpen(false);
      invalidateFeed();
    },
  });

  const clap = useMutation({
    mutationFn: (id: string) => communityApi.react(id),
    onSuccess: () => invalidateFeed(),
  });

  const joinRoom = useMutation({
    mutationFn: (id: string) => communityApi.joinStudyRoom(id),
    onSuccess: (res) => {
      invalidateFeed();
      if (res.meetingUrl) window.open(res.meetingUrl, '_blank', 'noopener,noreferrer');
    },
  });

  const createRoom = useMutation({
    mutationFn: () => communityApi.createStudyRoom({ title: roomTitle.trim(), channelId }),
    onSuccess: () => {
      setRoomTitle('');
      invalidateFeed();
    },
  });

  const sendMsg = useMutation({
    mutationFn: () => communityApi.sendMessage(activeConv!, msgBody.trim()),
    onSuccess: () => {
      setMsgBody('');
      qc.invalidateQueries({ queryKey: ['community', 'messages', activeConv] });
      qc.invalidateQueries({ queryKey: ['community', 'conversations'] });
    },
  });

  const openDm = useMutation({
    mutationFn: () => communityApi.openConversation({ userId: dmUserId.trim(), body: msgBody.trim() || undefined }),
    onSuccess: (c) => {
      setActiveConv(c.id);
      setDmUserId('');
      setMsgBody('');
      qc.invalidateQueries({ queryKey: ['community', 'conversations'] });
    },
  });

  const createGroup = useMutation({
    mutationFn: () => communityApi.createGroup({ name: groupName.trim() }),
    onSuccess: () => {
      setGroupName('');
      qc.invalidateQueries({ queryKey: ['community', 'groups'] });
    },
  });

  const joinGroup = useMutation({
    mutationFn: (id: string) => communityApi.joinGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'groups'] }),
  });

  const createEvent = useMutation({
    mutationFn: () =>
      communityApi.createEvent({
        title: eventTitle.trim(),
        startsAt: new Date(eventWhen).toISOString(),
      }),
    onSuccess: () => {
      setEventTitle('');
      setEventWhen('');
      qc.invalidateQueries({ queryKey: ['community', 'events'] });
    },
  });

  const rsvp = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RsvpStatus }) => communityApi.rsvp(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'events'] }),
  });

  const canPost = useMemo(() => {
    if (body.trim().length < 1) return false;
    if (kind === 'QUESTION' && (title.trim().length < 10 || body.trim().length < 20)) return false;
    return true;
  }, [body, title, kind]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof MessagesSquare }> = [
    { id: 'feed', label: 'Feed', icon: Hash },
    { id: 'messages', label: 'Messages', icon: MessagesSquare },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'events', label: 'Events', icon: CalendarDays },
  ];

  if (posts.isLoading && tab === 'feed') return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Community"
        title="Learn together."
        highlight="Ship together."
        subtitle={`${todayLabel()} — ask, showcase, and find your people across the academy.`}
      >
        <HeroPanel title="This week">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{stats.data?.postsThisWeek ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Posts</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{stats.data?.openRooms ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Rooms</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{stats.data?.unreadDms ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Unread</div>
            </div>
            <div className="rounded-panel bg-white/10 p-2">
              <div className="font-display text-lg font-extrabold">{stats.data?.upcomingEvents ?? '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Events</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="flex flex-wrap gap-1.5 rounded-card border border-hair bg-panel p-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'feed' && (
        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
            <Card className="p-4">
              <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
                My channels
              </div>
              <button
                type="button"
                onClick={() => setChannelId(null)}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-panel px-2.5 py-2 text-left text-sm font-bold',
                  channelId === null ? 'bg-chip text-brand-600 dark:text-brand-300' : 'hover:bg-soft',
                )}
              >
                <span>✨</span> All feed
              </button>
              {(channels.data ?? []).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setChannelId(ch.id);
                    communityApi.markChannelRead(ch.id).catch(() => undefined);
                  }}
                  className={cn(
                    'mb-1 flex w-full items-center gap-2 rounded-panel px-2.5 py-2 text-left text-sm font-bold',
                    channelId === ch.id ? 'bg-chip text-brand-600 dark:text-brand-300' : 'hover:bg-soft',
                  )}
                >
                  <span>{ch.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                  {ch.unread > 0 && (
                    <span className="rounded-full bg-grad-brand px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                      {ch.unread}
                    </span>
                  )}
                </button>
              ))}
            </Card>

            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
                  Study rooms · live
                </div>
                <Radio className="h-3.5 w-3.5 text-success" aria-hidden />
              </div>
              {(rooms.data ?? []).length === 0 && (
                <p className="text-xs text-faint">No open rooms — start one.</p>
              )}
              {(rooms.data ?? []).map((r) => (
                <div key={r.id} className="border-t border-hair py-2.5 first:border-0 first:pt-0">
                  <div className="text-sm font-bold">{r.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-faint">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {r.studyingNow} studying now
                    <button
                      type="button"
                      className="ml-auto font-extrabold text-brand-600 dark:text-brand-300"
                      onClick={() => joinRoom.mutate(r.id)}
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex gap-2">
                <Input
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="Room title"
                  className="h-9"
                />
                <Button
                  size="sm"
                  disabled={roomTitle.trim().length < 3 || createRoom.isPending}
                  onClick={() => createRoom.mutate()}
                >
                  Open
                </Button>
              </div>
            </Card>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grad-aqua text-xs font-extrabold text-white">
                {user?.profile
                  ? `${user.profile.firstName[0]}${user.profile.lastName[0]}`
                  : (user?.email?.slice(0, 2) ?? '?').toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="flex-1 rounded-panel border border-hair bg-soft px-3.5 py-2.5 text-left text-sm text-faint"
              >
                Share progress, ask a question, or showcase a project…
              </button>
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Post
              </Button>
            </Card>

            {composerOpen && (
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap gap-2">
                  {(['UPDATE', 'SHOWCASE', 'QUESTION', 'AMA'] as PostKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-bold',
                        kind === k ? 'bg-grad-holo text-white' : 'bg-chip text-faint',
                      )}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                {(kind === 'QUESTION' || kind === 'AMA' || kind === 'SHOWCASE') && (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={kind === 'QUESTION' ? 'Question title (min 10 chars)' : 'Optional title'}
                  />
                )}
                <Textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write something useful…"
                />
                {kind === 'SHOWCASE' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={showcaseTitle}
                      onChange={(e) => setShowcaseTitle(e.target.value)}
                      placeholder="Project title"
                    />
                    <Input
                      value={showcaseSub}
                      onChange={(e) => setShowcaseSub(e.target.value)}
                      placeholder="Stack · timeline"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => createPost.mutate()} loading={createPost.isPending} disabled={!canPost}>
                    Publish
                  </Button>
                  <Button variant="secondary" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </Button>
                  {createPost.isError && <span className="text-sm text-danger">Could not publish.</span>}
                </div>
              </Card>
            )}

            {posts.isError && <Alert tone="error">Could not load the feed.</Alert>}
            {(posts.data?.data ?? []).length === 0 && !posts.isLoading && (
              <Card>
                <p className="text-sm text-faint">No posts yet — be the first to share.</p>
              </Card>
            )}
            {(posts.data?.data ?? []).map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip text-xs font-extrabold">
                    {initials(p.author)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold">{displayName(p.author)}</span>
                      <Badge tone="brand">{KIND_LABEL[p.kind]}</Badge>
                      {p.channel && (
                        <span className="text-[11px] font-semibold text-faint">
                          {p.channel.emoji} {p.channel.name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold text-faint">{ago(p.createdAt)}</div>
                  </div>
                </div>
                {p.title && <h3 className="mt-3 font-display text-base font-bold">{p.title}</h3>}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{p.body}</p>
                {p.kind === 'SHOWCASE' && p.showcaseTitle && (
                  <div className="mt-3 overflow-hidden rounded-panel border border-hair">
                    <div className="flex h-28 items-center justify-center bg-grad-holo text-4xl">
                      {p.showcaseEmoji ?? '📊'}
                    </div>
                    <div className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold">{p.showcaseTitle}</div>
                        {p.showcaseSub && <div className="text-xs font-semibold text-faint">{p.showcaseSub}</div>}
                      </div>
                    </div>
                  </div>
                )}
                {p.questionId && (
                  <Link
                    href={`/community/${p.questionId}`}
                    className="mt-2 inline-block text-xs font-bold text-brand-600 dark:text-brand-300"
                  >
                    Open Q&A thread →
                  </Link>
                )}
                <div className="mt-3 flex gap-4 text-xs font-bold text-faint">
                  <button
                    type="button"
                    className={cn('hover:text-ink', p.clappedByMe && 'text-accent-600')}
                    onClick={() => clap.mutate(p.id)}
                  >
                    👏 {p.clapCount}
                  </button>
                  <Link href={`/community/posts/${p.id}`} className="hover:text-ink">
                    <MessageCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                    {p.commentCount} comments
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-bold">Alumni spotlight</h2>
                <Link href="/alumni" className="text-xs font-extrabold text-brand-600 dark:text-brand-300">
                  Directory
                </Link>
              </div>
              {(alumni.data ?? []).slice(0, 4).map((a) => (
                <div key={a.userId} className="flex items-center gap-2.5 border-t border-hair py-2.5 first:border-0 first:pt-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-chip text-[10px] font-extrabold">
                    {a.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{a.name}</div>
                    <div className="truncate text-[11px] font-semibold text-faint">
                      {[a.currentRole, a.currentCompany].filter(Boolean).join(' @ ') || 'Alumni'}
                      {a.graduationYear ? ` · ${a.graduationYear}` : ''}
                    </div>
                  </div>
                  {a.openToMentoring ? (
                    <Link href="/mentorship">
                      <Button size="sm" className="!h-8 !px-2.5 !text-[11px]">
                        Ask
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/alumni">
                      <Button size="sm" variant="secondary" className="!h-8 !px-2.5 !text-[11px]">
                        View
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Alumni control who can contact them. Referral requests are reviewed first.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 font-display font-bold">Weekly XP leaderboard</h2>
              {(board.data ?? []).slice(0, 5).map((l, i) => (
                <div key={l.userId} className="flex items-center gap-2.5 border-t border-hair py-2 first:border-0 first:pt-0">
                  <span
                    className={cn(
                      'w-5 text-sm font-extrabold',
                      i === 0 ? 'text-accent-500' : i === 1 ? 'text-faint' : i === 2 ? 'text-orange-600' : 'text-faint',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-bold">
                    {l.name}
                    {l.userId === user?.id ? ' (you)' : ''}
                  </span>
                  <span className="text-xs font-extrabold text-brand-600 dark:text-brand-300">
                    {l.score.toLocaleString()}
                  </span>
                </div>
              ))}
              {(board.data ?? []).length === 0 && (
                <p className="text-xs text-faint">Contribute answers to climb the board.</p>
              )}
            </Card>
          </aside>
        </div>
      )}

      {tab === 'messages' && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="flex flex-col p-0">
            <div className="border-b border-hair p-3">
              <div className="text-sm font-extrabold">Conversations</div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={dmUserId}
                  onChange={(e) => setDmUserId(e.target.value)}
                  placeholder="Peer user id"
                  className="h-9"
                />
                <Button size="sm" disabled={!dmUserId.trim()} onClick={() => openDm.mutate()}>
                  DM
                </Button>
              </div>
            </div>
            <ul className="max-h-[480px] overflow-y-auto">
              {(conversations.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveConv(c.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 border-b border-hair px-3 py-3 text-left hover:bg-soft',
                      activeConv === c.id && 'bg-chip',
                    )}
                  >
                    <span className="truncate text-sm font-bold">{c.title}</span>
                    <span className="truncate text-xs text-faint">{c.lastMessage?.body ?? 'No messages yet'}</span>
                  </button>
                </li>
              ))}
              {(conversations.data ?? []).length === 0 && (
                <p className="p-4 text-sm text-faint">No conversations yet.</p>
              )}
            </ul>
          </Card>
          <Card className="flex min-h-[420px] flex-col p-0">
            {!activeConv ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-faint">
                Select a conversation or start a DM.
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {(messages.data?.data ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'max-w-[80%] rounded-panel px-3 py-2 text-sm',
                        m.author.id === user?.id ? 'ml-auto bg-grad-holo text-white' : 'bg-chip',
                      )}
                    >
                      <div className="mb-0.5 text-[10px] font-bold opacity-70">{displayName(m.author)}</div>
                      {m.body}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-hair p-3">
                  <Input
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="Write a message…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && msgBody.trim()) sendMsg.mutate();
                    }}
                  />
                  <Button disabled={!msgBody.trim() || sendMsg.isPending} onClick={() => sendMsg.mutate()}>
                    <Send className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {tab === 'groups' && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-end gap-2 p-4">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-bold text-faint">Create a group</label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" />
            </div>
            <Button disabled={groupName.trim().length < 2 || createGroup.isPending} onClick={() => createGroup.mutate()}>
              Create
            </Button>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(groups.data ?? []).map((g) => (
              <Card key={g.id} className="flex flex-col gap-3 p-4">
                <div>
                  <Link href={`/community/groups/${g.id}`} className="font-display font-bold hover:text-brand-600">
                    {g.name}
                  </Link>
                  <p className="mt-1 text-xs text-faint">{g.description || 'No description'}</p>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-faint">
                  <span>{g.memberCount} members</span>
                  {g.joined ? (
                    <Badge tone="success">Joined</Badge>
                  ) : (
                    <Button size="sm" onClick={() => joinGroup.mutate(g.id)}>
                      Join
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="flex flex-col gap-4">
          <Card className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Event title" />
            <Input
              type="datetime-local"
              value={eventWhen}
              onChange={(e) => setEventWhen(e.target.value)}
            />
            <Button
              disabled={eventTitle.trim().length < 3 || !eventWhen || createEvent.isPending}
              onClick={() => createEvent.mutate()}
            >
              Create event
            </Button>
          </Card>
          {(events.data?.data ?? []).map((e) => (
            <Card key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-display font-bold">{e.title}</div>
                <div className="mt-0.5 text-xs font-semibold text-faint">
                  {new Date(e.startsAt).toLocaleString()} · {e.rsvpCount} RSVPs
                  {e.location ? ` · ${e.location}` : ''}
                </div>
                {e.description && <p className="mt-1 text-sm text-faint">{e.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['GOING', 'MAYBE', 'DECLINED'] as RsvpStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => rsvp.mutate({ id: e.id, status: s })}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-bold',
                      e.myRsvp === s ? 'bg-grad-holo text-white' : 'bg-chip text-faint hover:text-ink',
                    )}
                  >
                    {s.toLowerCase()}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
