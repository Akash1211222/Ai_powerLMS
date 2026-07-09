import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { NotificationService } from './notification.service';
import {
  listNotificationsQuerySchema,
  updatePreferenceSchema,
  type ListNotificationsQuery,
  type UpdatePreferenceDto,
} from './dto/notification.schemas';

/** Self-scoped notification endpoints — a user reads/manages only their own. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (paginated) with unread count' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) q: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.userId, q.unreadOnly, q.page, q.pageSize);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count (for the bell badge)' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPreference(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreference(user.userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePreference(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updatePreferenceSchema)) dto: UpdatePreferenceDto,
  ) {
    return this.notifications.updatePreference(user.userId, dto);
  }
}
