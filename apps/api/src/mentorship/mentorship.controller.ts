import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@fca/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MentorshipService } from './mentorship.service';
import {
  updateMentorProfileSchema,
  createSlotSchema,
  bookSchema,
  completeSchema,
  createMentorRequestSchema,
  arrangeMentorRequestSchema,
  type UpdateMentorProfileDto,
  type CreateSlotDto,
  type BookDto,
  type CompleteDto,
  type CreateMentorRequestDto,
  type ArrangeMentorRequestDto,
} from './dto/mentorship.schemas';

@ApiTags('mentorship')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  // --- Mentor side (mentor:manage) --------------------------------------

  @Get('me/mentor-profile')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Your mentor profile (created on first access)' })
  profile(@CurrentUser() user: AuthUser) {
    return this.mentorship.getOrCreateProfile(user.userId);
  }

  @Put('me/mentor-profile')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Update your mentor profile' })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateMentorProfileSchema)) dto: UpdateMentorProfileDto,
  ) {
    return this.mentorship.updateProfile(user.userId, dto);
  }

  @Post('me/mentor-slots')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Open an availability window' })
  createSlot(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSlotSchema)) dto: CreateSlotDto) {
    return this.mentorship.createSlot(user.userId, dto);
  }

  @Get('me/mentor-slots')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Your availability windows + who booked them' })
  mySlots(@CurrentUser() user: AuthUser) {
    return this.mentorship.listMySlots(user.userId);
  }

  @Delete('me/mentor-slots/:id')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Remove an unbooked availability window' })
  cancelSlot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorship.cancelSlot(user.userId, id);
  }

  @Get('me/mentor-bookings')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Bookings students made with you' })
  mentorBookings(@CurrentUser() user: AuthUser) {
    return this.mentorship.listMentorBookings(user.userId);
  }

  @Post('me/mentor-bookings/:id/complete')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Close out a session (COMPLETED or NO_SHOW)' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeSchema)) dto: CompleteDto,
  ) {
    return this.mentorship.completeBooking(user.userId, id, dto);
  }

  @Get('me/incoming-help-requests')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Open student help requests in your organization' })
  mentorHelpRequests(@CurrentUser() user: AuthUser) {
    return this.mentorship.listOpenRequestsForMentor(user.userId);
  }

  @Post('me/incoming-help-requests/:id/arrange')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Arrange a Meet call for a student help request' })
  arrangeHelpRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(arrangeMentorRequestSchema)) dto: ArrangeMentorRequestDto,
  ) {
    return this.mentorship.arrangeRequest(user.userId, id, dto);
  }

  @Post('me/incoming-help-requests/:id/close')
  @RequirePermissions(PERMISSIONS.MENTOR_MANAGE)
  @ApiOperation({ summary: 'Close a help request without scheduling' })
  closeHelpRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorship.closeRequest(user.userId, id);
  }

  // --- Student side (any authenticated member of the org) ---------------

  @Get('mentors')
  @ApiOperation({ summary: 'Mentors in your organization accepting bookings' })
  mentors(@CurrentUser() user: AuthUser) {
    return this.mentorship.listMentors(user.userId);
  }

  @Get('mentors/:id/slots')
  @ApiOperation({ summary: 'A mentor’s open future slots' })
  mentorSlots(@Param('id') id: string) {
    return this.mentorship.listMentorSlots(id);
  }

  @Post('mentor-slots/:id/book')
  @ApiOperation({ summary: 'Book an open slot' })
  book(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(bookSchema)) dto: BookDto) {
    return this.mentorship.book(user.userId, id, dto);
  }

  @Get('me/bookings')
  @ApiOperation({ summary: 'Your mentorship bookings' })
  myBookings(@CurrentUser() user: AuthUser) {
    return this.mentorship.listMyBookings(user.userId);
  }

  @Post('me/bookings/:id/cancel')
  @ApiOperation({ summary: 'Cancel a booking (either side); reopens the slot' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorship.cancelBooking(user.userId, id);
  }

  @Post('me/mentor-help-requests')
  @ApiOperation({ summary: 'Request a mentor / topic when no slot is available' })
  createHelpRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMentorRequestSchema)) dto: CreateMentorRequestDto,
  ) {
    return this.mentorship.createRequest(user.userId, dto);
  }

  @Get('me/mentor-help-requests')
  @ApiOperation({ summary: 'Your mentor help requests' })
  myHelpRequests(@CurrentUser() user: AuthUser) {
    return this.mentorship.listMyRequests(user.userId);
  }

  @Post('me/mentor-help-requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel an open help request' })
  cancelHelpRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorship.cancelRequest(user.userId, id);
  }
}
