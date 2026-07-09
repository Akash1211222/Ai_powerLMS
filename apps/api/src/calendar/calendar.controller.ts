import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CalendarService } from './calendar.service';
import {
  calendarQuerySchema,
  createEventSchema,
  type CalendarQuery,
  type CreateEventDto,
} from './dto/calendar.schemas';

/** Unified calendar for the current user (self-scoped). */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({ summary: 'Unified calendar events in a date range' })
  events(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(calendarQuerySchema)) q: CalendarQuery,
  ) {
    return this.calendar.getEvents(user.userId, q.from, q.to);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a personal calendar event' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEventSchema)) dto: CreateEventDto,
  ) {
    return this.calendar.createPersonalEvent(user.userId, dto);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Delete a personal calendar event' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calendar.deletePersonalEvent(user.userId, id);
  }
}
