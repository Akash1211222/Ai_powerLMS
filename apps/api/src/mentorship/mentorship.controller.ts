import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MentorshipService } from './mentorship.service';
import {
  createBookingSchema,
  updateBookingSchema,
  updateMentorProfileSchema,
  type CreateBookingDto,
  type UpdateBookingDto,
  type UpdateMentorProfileDto,
} from './dto/mentorship.schemas';

@ApiTags('mentorship')
@ApiBearerAuth()
@Controller('mentorship')
@UseGuards(JwtAuthGuard)
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  @Get('mentors')
  @ApiOperation({ summary: 'Mentor directory for an organization' })
  listMentors(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId: string) {
    return this.mentorship.listMentors(user.userId, organizationId);
  }

  @Get('profile')
  @ApiOperation({ summary: "Current user's mentor profile (null if not a mentor)" })
  myProfile(@CurrentUser() user: AuthUser) {
    return this.mentorship.getMyProfile(user.userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Create/update own mentor profile' })
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateMentorProfileSchema)) dto: UpdateMentorProfileDto,
  ) {
    return this.mentorship.upsertProfile(user.userId, dto);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Request a mentorship session' })
  createBooking(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ) {
    return this.mentorship.createBooking(user.userId, dto);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'My sessions (as mentor and as student)' })
  myBookings(@CurrentUser() user: AuthUser) {
    return this.mentorship.myBookings(user.userId);
  }

  @Patch('bookings/:id')
  @ApiOperation({ summary: 'Confirm/decline/complete/cancel/rate a session' })
  updateBooking(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBookingSchema)) dto: UpdateBookingDto,
  ) {
    return this.mentorship.updateBooking(user.userId, id, dto);
  }
}
