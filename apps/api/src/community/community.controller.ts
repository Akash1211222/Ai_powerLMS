import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CommunityService } from './community.service';
import {
  askSchema,
  answerSchema,
  listQuestionsQuerySchema,
  type AskDto,
  type AnswerDto,
  type ListQuestionsQuery,
} from './dto/community.schemas';

@ApiTags('community')
@ApiBearerAuth()
@Controller('community')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

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

  @Post('answers/:id/vote')
  @ApiOperation({ summary: 'Toggle your upvote on an answer' })
  vote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.toggleVote(user.userId, id);
  }
}
