import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CommunityService } from './community.service';
import { CommunityFeedService } from './community-feed.service';
import { CommunitySocialService } from './community-social.service';
import {
  askSchema,
  answerSchema,
  listQuestionsQuerySchema,
  createChannelSchema,
  createPostSchema,
  listPostsQuerySchema,
  commentSchema,
  createStudyRoomSchema,
  createConversationSchema,
  sendMessageSchema,
  createGroupSchema,
  createEventSchema,
  rsvpSchema,
  listEventsQuerySchema,
  type AskDto,
  type AnswerDto,
  type ListQuestionsQuery,
  type CreateChannelDto,
  type CreatePostDto,
  type ListPostsQuery,
  type CommentDto,
  type CreateStudyRoomDto,
  type CreateConversationDto,
  type SendMessageDto,
  type CreateGroupDto,
  type CreateEventDto,
  type RsvpDto,
  type ListEventsQuery,
} from './dto/community.schemas';

@ApiTags('community')
@ApiBearerAuth()
@Controller('community')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly feed: CommunityFeedService,
    private readonly social: CommunitySocialService,
  ) {}

  // --- Hub stats ----------------------------------------------------------

  @Get('stats')
  @ApiOperation({ summary: 'Community hub stat chips' })
  stats(@CurrentUser() user: AuthUser) {
    return this.feed.hubStats(user.userId);
  }

  // --- Channels -----------------------------------------------------------

  @Get('channels')
  listChannels(@CurrentUser() user: AuthUser) {
    return this.feed.listChannels(user.userId);
  }

  @Post('channels')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  createChannel(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateChannelDto,
  ) {
    return this.feed.createChannel(user.userId, dto);
  }

  @Post('channels/:id/join')
  joinChannel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.joinChannel(user.userId, id);
  }

  @Post('channels/:id/read')
  markChannelRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.markChannelRead(user.userId, id);
  }

  // --- Posts / feed -------------------------------------------------------

  @Get('posts')
  listPosts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listPostsQuerySchema)) query: ListPostsQuery,
  ) {
    return this.feed.listPosts(user.userId, query);
  }

  @Post('posts')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  createPost(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPostSchema)) dto: CreatePostDto,
  ) {
    return this.feed.createPost(user.userId, dto);
  }

  @Get('posts/:id')
  getPost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.getPost(user.userId, id);
  }

  @Post('posts/:id/react')
  react(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.toggleClap(user.userId, id);
  }

  @Post('posts/:id/comments')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(commentSchema)) dto: CommentDto,
  ) {
    return this.feed.addComment(user.userId, id, dto);
  }

  // --- Study rooms --------------------------------------------------------

  @Get('study-rooms')
  listRooms(@CurrentUser() user: AuthUser) {
    return this.feed.listStudyRooms(user.userId);
  }

  @Post('study-rooms')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  createRoom(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStudyRoomSchema)) dto: CreateStudyRoomDto,
  ) {
    return this.feed.createStudyRoom(user.userId, dto);
  }

  @Post('study-rooms/:id/join')
  joinRoom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.joinStudyRoom(user.userId, id);
  }

  @Post('study-rooms/:id/leave')
  leaveRoom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feed.leaveStudyRoom(user.userId, id);
  }

  // --- Conversations / messages -------------------------------------------

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthUser) {
    return this.social.listConversations(user.userId);
  }

  @Post('conversations')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  openConversation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createConversationSchema)) dto: CreateConversationDto,
  ) {
    return this.social.openConversation(user.userId, dto);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page?: string,
  ) {
    return this.social.listMessages(user.userId, id, page ? Number(page) : 1);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.social.sendMessage(user.userId, id, dto);
  }

  // --- Groups -------------------------------------------------------------

  @Get('groups')
  listGroups(@CurrentUser() user: AuthUser) {
    return this.social.listGroups(user.userId);
  }

  @Post('groups')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  createGroup(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto,
  ) {
    return this.social.createGroup(user.userId, dto);
  }

  @Get('groups/:id')
  getGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.getGroup(user.userId, id);
  }

  @Post('groups/:id/join')
  joinGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.joinGroup(user.userId, id);
  }

  // --- Events -------------------------------------------------------------

  @Get('events')
  listEvents(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listEventsQuerySchema)) query: ListEventsQuery,
  ) {
    return this.social.listEvents(user.userId, query);
  }

  @Post('events')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  createEvent(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEventSchema)) dto: CreateEventDto,
  ) {
    return this.social.createEvent(user.userId, dto);
  }

  @Post('events/:id/rsvp')
  rsvp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rsvpSchema)) dto: RsvpDto,
  ) {
    return this.social.rsvp(user.userId, id, dto);
  }

  // --- Legacy Q&A ---------------------------------------------------------

  @Get('tags')
  @ApiOperation({ summary: 'Popular tags in your community' })
  tags(@CurrentUser() user: AuthUser) {
    return this.community.tags(user.userId);
  }

  @Get('questions')
  @ApiOperation({ summary: 'Browse questions in your organization' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuestionsQuerySchema)) query: ListQuestionsQuery,
  ) {
    return this.community.list(user.userId, query);
  }

  @Post('questions')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  @ApiOperation({ summary: 'Ask a question' })
  ask(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(askSchema)) dto: AskDto) {
    return this.community.ask(user.userId, dto);
  }

  @Get('questions/:id')
  @ApiOperation({ summary: 'A question with its answers, votes and your own vote' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.get(user.userId, id);
  }

  @Post('questions/:id/answers')
  @RequirePermissions(PERMISSIONS.COMMUNITY_POST)
  @ApiOperation({ summary: 'Answer a question' })
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(answerSchema)) dto: AnswerDto,
  ) {
    return this.community.answer(user.userId, id, dto);
  }

  @Post('questions/:id/accept/:answerId')
  @ApiOperation({ summary: 'Accept the answer that solved it (asker only)' })
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('answerId') answerId: string) {
    return this.community.accept(user.userId, id, answerId);
  }

  // ---- Moderation --------------------------------------------------------
  // Soft removal, scoped to the moderator's own organizations by the service.

  @Delete('posts/:id')
  @RequirePermissions(PERMISSIONS.COMMUNITY_MODERATE)
  @ApiOperation({ summary: 'Remove a post from the feed (moderator)' })
  removePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.removePost(user.userId, id);
  }

  @Delete('questions/:id')
  @RequirePermissions(PERMISSIONS.COMMUNITY_MODERATE)
  @ApiOperation({ summary: 'Remove a question and hide its thread (moderator)' })
  removeQuestion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.removeQuestion(user.userId, id);
  }

  @Delete('answers/:id')
  @RequirePermissions(PERMISSIONS.COMMUNITY_MODERATE)
  @ApiOperation({ summary: 'Remove an answer (moderator). Reopens the question if it was the accepted one.' })
  removeAnswer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.removeAnswer(user.userId, id);
  }

  @Post('answers/:id/vote')
  @ApiOperation({ summary: 'Toggle your upvote on an answer' })
  vote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.toggleVote(user.userId, id);
  }
}
