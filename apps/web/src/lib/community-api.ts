import { apiRequest } from './api-client';

export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';
export type PostKind = 'UPDATE' | 'SHOWCASE' | 'QUESTION' | 'AMA';
export type RsvpStatus = 'GOING' | 'MAYBE' | 'DECLINED';

export interface Author {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string; avatarUrl: string | null } | null;
}

export interface QuestionSummary {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: QuestionStatus;
  viewCount: number;
  createdAt: string;
  author: Author;
  _count: { answers: number };
}

export interface Answer {
  id: string;
  body: string;
  isAccepted: boolean;
  createdAt: string;
  author: Author;
  voteCount: number;
  votedByMe: boolean;
}

export interface QuestionDetail extends Omit<QuestionSummary, '_count'> {
  answers: Answer[];
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  kind: string;
  batchId: string | null;
  postCount: number;
  unread: number;
  joined: boolean;
}

export interface PostSummary {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  questionId: string | null;
  showcaseTitle: string | null;
  showcaseSub: string | null;
  showcaseEmoji: string | null;
  createdAt: string;
  author: Author;
  channel: { id: string; name: string; emoji: string; slug: string } | null;
  clapCount: number;
  commentCount: number;
  clappedByMe: boolean;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

export interface PostDetail extends PostSummary {
  comments: PostComment[];
}

export interface StudyRoom {
  id: string;
  title: string;
  meetingUrl: string | null;
  channelId: string | null;
  createdBy: Author;
  studyingNow: number;
  joinedByMe: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: 'DM' | 'GROUP_CHAT';
  title: string;
  groupId: string | null;
  members: Author[];
  lastMessage: { id: string; body: string; createdAt: string; author: Author } | null;
  lastReadAt: string | null;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: 'OPEN' | 'REQUEST';
  createdBy: Author;
  memberCount: number;
  joined: boolean;
  myRole: string | null;
  createdAt: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  createdBy: Author;
  rsvpCount: number;
  myRsvp: RsvpStatus | null;
  createdAt: string;
}

export interface HubStats {
  postsThisWeek: number;
  openRooms: number;
  unreadDms: number;
  upcomingEvents: number;
}

function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const communityApi = {
  stats: () => apiRequest<HubStats>('/community/stats', { auth: true }),

  channels: () => apiRequest<Channel[]>('/community/channels', { auth: true }),
  createChannel: (body: { name: string; slug: string; emoji?: string; kind?: string }) =>
    apiRequest<Channel>('/community/channels', { method: 'POST', body, auth: true }),
  joinChannel: (id: string) =>
    apiRequest<{ success: boolean }>(`/community/channels/${id}/join`, { method: 'POST', auth: true }),
  markChannelRead: (id: string) =>
    apiRequest<{ success: boolean }>(`/community/channels/${id}/read`, { method: 'POST', auth: true }),

  posts: (params?: { channelId?: string; kind?: PostKind; page?: number }) =>
    apiRequest<Paginated<PostSummary>>(`/community/posts${qs(params ?? {})}`, { auth: true }),
  getPost: (id: string) => apiRequest<PostDetail>(`/community/posts/${id}`, { auth: true }),
  createPost: (body: {
    body: string;
    title?: string;
    kind?: PostKind;
    channelId?: string | null;
    showcaseTitle?: string;
    showcaseSub?: string;
    showcaseEmoji?: string;
    tags?: string[];
  }) => apiRequest<PostSummary>('/community/posts', { method: 'POST', body, auth: true }),
  react: (id: string) =>
    apiRequest<{ postId: string; clappedByMe: boolean; clapCount: number }>(
      `/community/posts/${id}/react`,
      { method: 'POST', auth: true },
    ),
  comment: (id: string, body: string) =>
    apiRequest<PostComment>(`/community/posts/${id}/comments`, {
      method: 'POST',
      body: { body },
      auth: true,
    }),

  studyRooms: () => apiRequest<StudyRoom[]>('/community/study-rooms', { auth: true }),
  createStudyRoom: (body: { title: string; channelId?: string | null; meetingUrl?: string | null }) =>
    apiRequest<StudyRoom>('/community/study-rooms', { method: 'POST', body, auth: true }),
  joinStudyRoom: (id: string) =>
    apiRequest<{ success: boolean; meetingUrl: string | null }>(`/community/study-rooms/${id}/join`, {
      method: 'POST',
      auth: true,
    }),
  leaveStudyRoom: (id: string) =>
    apiRequest<{ success: boolean }>(`/community/study-rooms/${id}/leave`, { method: 'POST', auth: true }),

  conversations: () => apiRequest<ConversationSummary[]>('/community/conversations', { auth: true }),
  openConversation: (body: { userId?: string; groupId?: string; body?: string }) =>
    apiRequest<{ id: string }>('/community/conversations', { method: 'POST', body, auth: true }),
  messages: (id: string, page = 1) =>
    apiRequest<Paginated<ChatMessage>>(`/community/conversations/${id}/messages?page=${page}`, {
      auth: true,
    }),
  sendMessage: (id: string, body: string) =>
    apiRequest<ChatMessage>(`/community/conversations/${id}/messages`, {
      method: 'POST',
      body: { body },
      auth: true,
    }),

  groups: () => apiRequest<GroupSummary[]>('/community/groups', { auth: true }),
  getGroup: (id: string) =>
    apiRequest<
      GroupSummary & {
        members: Array<{ userId: string; role: string; user: Author }>;
      }
    >(`/community/groups/${id}`, { auth: true }),
  createGroup: (body: { name: string; description?: string; visibility?: 'OPEN' | 'REQUEST' }) =>
    apiRequest<GroupSummary>('/community/groups', { method: 'POST', body, auth: true }),
  joinGroup: (id: string) =>
    apiRequest<{ success: boolean }>(`/community/groups/${id}/join`, { method: 'POST', auth: true }),

  events: (page = 1) =>
    apiRequest<Paginated<CommunityEvent>>(`/community/events?page=${page}`, { auth: true }),
  createEvent: (body: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt?: string | null;
    location?: string | null;
    meetingUrl?: string | null;
  }) => apiRequest<CommunityEvent>('/community/events', { method: 'POST', body, auth: true }),
  rsvp: (id: string, status: RsvpStatus) =>
    apiRequest<{ success: boolean; status: RsvpStatus }>(`/community/events/${id}/rsvp`, {
      method: 'POST',
      body: { status },
      auth: true,
    }),

  // Legacy Q&A
  list: (tag?: string) =>
    apiRequest<Paginated<QuestionSummary>>(
      `/community/questions${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`,
      { auth: true },
    ),
  get: (id: string) => apiRequest<QuestionDetail>(`/community/questions/${id}`, { auth: true }),
  ask: (title: string, body: string, tags: string[]) =>
    apiRequest<QuestionSummary>('/community/questions', {
      method: 'POST',
      body: { title, body, tags },
      auth: true,
    }),
  answer: (questionId: string, body: string) =>
    apiRequest<Answer>(`/community/questions/${questionId}/answers`, {
      method: 'POST',
      body: { body },
      auth: true,
    }),
  vote: (answerId: string) =>
    apiRequest<{ answerId: string; votedByMe: boolean; voteCount: number }>(
      `/community/answers/${answerId}/vote`,
      { method: 'POST', auth: true },
    ),
  accept: (questionId: string, answerId: string) =>
    apiRequest<QuestionDetail>(`/community/questions/${questionId}/accept/${answerId}`, {
      method: 'POST',
      auth: true,
    }),
  tags: () => apiRequest<Array<{ tag: string; count: number }>>('/community/tags', { auth: true }),

  // Moderation — requires community:moderate. Content is hidden, not deleted.
  removePost: (id: string) =>
    apiRequest<{ id: string; removed: true }>(`/community/posts/${id}`, {
      method: 'DELETE',
      auth: true,
    }),
  removeQuestion: (id: string) =>
    apiRequest<{ id: string; removed: true }>(`/community/questions/${id}`, {
      method: 'DELETE',
      auth: true,
    }),
  removeAnswer: (id: string) =>
    apiRequest<{ id: string; removed: true }>(`/community/answers/${id}`, {
      method: 'DELETE',
      auth: true,
    }),
};
