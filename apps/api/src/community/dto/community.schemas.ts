import { z } from 'zod';

export const askSchema = z.object({
  title: z.string().min(10).max(200).trim(),
  body: z.string().min(20).max(10000).trim(),
  tags: z.array(z.string().min(1).max(40).trim().toLowerCase()).max(5).optional(),
});
export type AskDto = z.infer<typeof askSchema>;

export const answerSchema = z.object({
  body: z.string().min(10).max(10000).trim(),
});
export type AnswerDto = z.infer<typeof answerSchema>;

export const listQuestionsQuerySchema = z.object({
  tag: z.string().max(40).trim().toLowerCase().optional(),
  status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

// --- Social hub -----------------------------------------------------------

export const createChannelSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
  emoji: z.string().min(1).max(8).optional(),
  kind: z.enum(['GENERAL', 'TOPIC', 'BATCH']).optional(),
  batchId: z.string().cuid().optional(),
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;

export const createPostSchema = z.object({
  body: z.string().min(1).max(10000).trim(),
  title: z.string().min(3).max(200).trim().optional(),
  kind: z.enum(['UPDATE', 'SHOWCASE', 'QUESTION', 'AMA']).default('UPDATE'),
  channelId: z.string().cuid().optional().nullable(),
  showcaseTitle: z.string().max(120).trim().optional(),
  showcaseSub: z.string().max(200).trim().optional(),
  showcaseEmoji: z.string().max(8).optional(),
  tags: z.array(z.string().min(1).max(40).trim().toLowerCase()).max(5).optional(),
});
export type CreatePostDto = z.infer<typeof createPostSchema>;

export const listPostsQuerySchema = z.object({
  channelId: z.string().cuid().optional(),
  kind: z.enum(['UPDATE', 'SHOWCASE', 'QUESTION', 'AMA']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const commentSchema = z.object({
  body: z.string().min(1).max(5000).trim(),
});
export type CommentDto = z.infer<typeof commentSchema>;

export const createStudyRoomSchema = z.object({
  title: z.string().min(3).max(120).trim(),
  channelId: z.string().cuid().optional().nullable(),
  meetingUrl: z.string().url().max(500).optional().nullable(),
});
export type CreateStudyRoomDto = z.infer<typeof createStudyRoomSchema>;

export const createConversationSchema = z.object({
  userId: z.string().cuid().optional(),
  groupId: z.string().cuid().optional(),
  body: z.string().min(1).max(5000).trim().optional(),
});
export type CreateConversationDto = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000).trim(),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const createGroupSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  description: z.string().max(1000).trim().optional(),
  visibility: z.enum(['OPEN', 'REQUEST']).optional(),
});
export type CreateGroupDto = z.infer<typeof createGroupSchema>;

export const createEventSchema = z.object({
  title: z.string().min(3).max(160).trim(),
  description: z.string().max(5000).trim().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  location: z.string().max(200).trim().optional().nullable(),
  meetingUrl: z.string().url().max(500).optional().nullable(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const rsvpSchema = z.object({
  status: z.enum(['GOING', 'MAYBE', 'DECLINED']),
});
export type RsvpDto = z.infer<typeof rsvpSchema>;

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
