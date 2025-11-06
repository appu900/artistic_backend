import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { EventsService, CreateEventDto, UpdateEventDto, EventFilters, BookEventTicketsDto } from './events.service';
import { OpenBookingDto } from './dto/open-booking.dto';
import { DatabasePrimaryValidation } from 'src/utils/validateMongoId';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { EventStatus, EventVisibility } from 'src/infrastructure/database/schemas/event.schema';

@Controller('events')
export class EventsController {
  constructor(private readonly eventService: EventsService) {}

  // ==================== ADMIN ENDPOINTS ====================

  @Post('admin/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor())
  async createEventAsAdmin(
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
    @UploadedFiles() files?: Array<Express.Multer.File>,
  ) {
    return this.eventService.createEvent(
      createEventDto,
      req.user.id,
      'admin',
      undefined,
      undefined,
      files,
    );
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('coverPhoto'))
  async updateEventAsAdmin(
    @Param('id') eventId: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: any,
    @UploadedFile() coverPhoto?: Express.Multer.File,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.updateEvent(
      eventId,
      updateEventDto,
      req.user.id,
      'admin',
      coverPhoto,
    );
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getEventsAsAdmin(@Query() filters: EventFilters) {
    return this.eventService.getEvents(filters);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getEventByIdAsAdmin(@Param('id') eventId: string) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.getEventById(eventId, true); // Include deleted events for admin
  }

  @Post('admin/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async publishEventAsAdmin(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.publishEvent(eventId, req.user.id, 'admin');
  }

  @Post('admin/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async cancelEventAsAdmin(
    @Param('id') eventId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.cancelEvent(eventId, req.user.id, 'admin', reason);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteEventAsAdmin(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    await this.eventService.deleteEvent(eventId, req.user.id, 'admin');
    return { message: 'Event deleted successfully' };
  }

  // ==================== VENUE OWNER ENDPOINTS ====================

  @Post('venue-owner/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  @UseInterceptors(AnyFilesInterceptor())
  async createEventAsVenueOwner(
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
    @UploadedFiles() files?: Array<Express.Multer.File>,
  ) {
    // Venue owners can only create events for their own venues
    return this.eventService.createEvent(
      createEventDto,
      req.user.id,
      'venue_owner',
      req.user.venueOwnerId, // Assuming this is set in JWT payload
      undefined,
      files,
    );
  }

  @Patch('venue-owner/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  @UseInterceptors(FileInterceptor('coverPhoto'))
  async updateEventAsVenueOwner(
    @Param('id') eventId: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: any,
    @UploadedFile() coverPhoto?: Express.Multer.File,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.updateEvent(
      eventId,
      updateEventDto,
      req.user.id,
      'venue_owner',
      coverPhoto,
    );
  }

  @Get('venue-owner/my-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async getMyEventsAsVenueOwner(@Query() filters: EventFilters, @Req() req: any) {
    return this.eventService.getEvents({
      ...filters,
      createdBy: req.user.id,
    });
  }

  @Get('venue-owner/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async getEventByIdAsVenueOwner(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    const event = await this.eventService.getEventById(eventId);
    
    // Venue owners can only view their own events
    if (event.createdBy.toString() !== req.user.id) {
      throw new ForbiddenException('You can only view your own events');
    }

    return event;
  }

  @Post('venue-owner/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async publishEventAsVenueOwner(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.publishEvent(eventId, req.user.id, 'venue_owner');
  }

  @Post('venue-owner/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async cancelEventAsVenueOwner(
    @Param('id') eventId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.cancelEvent(eventId, req.user.id, 'venue_owner', reason);
  }

  @Delete('venue-owner/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async deleteEventAsVenueOwner(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    await this.eventService.deleteEvent(eventId, req.user.id, 'venue_owner');
    return { message: 'Event deleted successfully' };
  }

  // ==================== PUBLIC ENDPOINTS ====================

  @Get('public')
  async getPublicEvents(@Query() filters: Partial<EventFilters>) {
    return this.eventService.getPublicEvents(filters);
  }

  @Get('public/:id')
  async getPublicEventById(@Param('id') eventId: string) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    const event = await this.eventService.getEventById(eventId);
    
    // Only return published public events
    if (event.status !== EventStatus.PUBLISHED || event.visibility === EventVisibility.PRIVATE) {
      throw new BadRequestException('Event not available');
    }

    // Increment view count
    await this.eventService.incrementViewCount(eventId);

    return event;
  }

  @Get('public/performance-type/:type')
  async getEventsByPerformanceType(
    @Param('type') performanceType: string,
    @Query() filters: Partial<EventFilters>,
  ) {
    return this.eventService.getEventsByPerformanceType(performanceType, filters);
  }

  @Get('public/:id/layout')
  async getEventLayoutForBooking(@Param('id') eventId: string) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.getEventLayoutDetails(eventId);
  }

  @Get('public/:id/decor')
  async getEventDecor(@Param('id') eventId: string) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.getEventDecor(eventId);
  }

  @Get('public/:id/seat-map')
  async getRealTimeSeatMap(@Param('id') eventId: string) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.getRealTimeSeatMap(eventId);
  }

  // ==================== BOOKING ENDPOINTS ====================

  @Post('book-tickets')
  @UseGuards(JwtAuthGuard)
  async bookEventTickets(@Body() bookingDto: BookEventTicketsDto, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(bookingDto.eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    // Robustly resolve user id from JWT payload
    const authUserId = req?.user?.id || req?.user?._id || req?.user?.userId;
    if (!authUserId) {
      throw new BadRequestException('User not found in auth context');
    }

    return this.eventService.bookEventTickets({
      ...bookingDto,
      userId: String(authUserId),
    });
  }


  @Get('bookings/my-bookings')
  @UseGuards(JwtAuthGuard)
  async getMyTicketBookings(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('eventId') eventId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Unified ticket booking listing has been deprecated.
    // Please use /seat-book/user-bookings instead (aggregate on client or create a new backend aggregator if needed).
    throw new BadRequestException('This endpoint is deprecated. Use /seat-book/user-bookings');
  }

  @Get('bookings/:id')
  @UseGuards(JwtAuthGuard)
  async getTicketBooking(@Param('id') id: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(id)) {
      throw new BadRequestException('Invalid booking ID');
    }
    
    // Debug: Log the user ID extraction
    const userId = req?.user?.id || req?.user?._id || req?.user?.userId;
    console.log(`🔍 Getting booking ${id} for user:`, {
      userId,
      userObject: req?.user,
    });
    
    // Unified booking details have been moved. Use:
    //   - /seat-book/details/:bookingId (seat)
    //   - /seat-book/table-details/:bookingId (table)
    //   - /seat-book/booth-details/:bookingId (booth)
    throw new BadRequestException('This endpoint is deprecated. Use /seat-book/*-details');
  }

  @Post('bookings/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelTicketBooking(@Param('id') id: string, @Body('reason') reason: string) {
    if (!DatabasePrimaryValidation.validateIds(id)) {
      throw new BadRequestException('Invalid booking ID');
    }
    // Unified cancel moved to /seat-book/cancel/:bookingId (auto-detects seat/table/booth)
    throw new BadRequestException('This endpoint is deprecated. Use /seat-book/cancel/:id');
  }

  /**
   * Rebuild open booking layout (Admin)
   */
  @Post('admin/:id/rebuild-open-booking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async rebuildOpenBookingAsAdmin(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }
    return this.eventService.rebuildOpenBooking(eventId, req.user.id, 'admin');
  }

  /**
   * Rebuild open booking layout (Venue Owner)
   */
  @Post('venue-owner/:id/rebuild-open-booking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async rebuildOpenBookingAsVenueOwner(@Param('id') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }
    return this.eventService.rebuildOpenBooking(eventId, req.user.id, 'venue_owner');
  }

  // ==================== LEGACY ENDPOINTS (for backward compatibility) ====================

  @Post('/booking/open')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENUE_OWNER)
  async openBooking(@Body() dto: OpenBookingDto) {
    if (
      !DatabasePrimaryValidation.validateIds(dto.eventId) ||
      !DatabasePrimaryValidation.validateIds(dto.layoutId)
    ) {
      throw new BadRequestException('IDs are not valid');
    }
    return this.eventService.openTicketBookingForEvent(
      dto.layoutId,
      dto.eventId,
    );
  }

  @Get('eventLayout/:id')
  async fetchLayoutDetails(@Param('id') seatLayoutId: string) {
    if (!DatabasePrimaryValidation.validateIds(seatLayoutId)) {
      throw new BadRequestException('Invalid layout ID');
    }
    
    return this.eventService.eventLayoutDetails(seatLayoutId);
  }

  // ==================== SEARCH AND FILTER ENDPOINTS ====================

  @Get('search')
  async searchEvents(@Query() filters: EventFilters) {
    // Only return published, non-private events for public search
    return this.eventService.getEvents({
      ...filters,
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
    });
  }

  @Get('cities')
  async getEventCities() {
    // Return distinct cities where events are happening
    // This would be implemented as an aggregation query
    return { cities: [] }; // Placeholder
  }

  @Get('performance-types')
  async getPerformanceTypes() {
    // Return distinct performance types
    // This would be implemented as an aggregation query
    return { performanceTypes: [] }; // Placeholder
  }

  // ==================== PAYMENT FLOW ENDPOINTS ====================

  @Post('store-pending-event-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async storePendingEventData(
    @Body() body: {
      comboBookingId: string;
      data: {
        eventData: any;
        selectedArtists: any[];
        selectedEquipment: any[];
        coverPhoto: any;
        token: string;
        timestamp: string;
      };
    },
    @Req() req: any,
  ) {
    return this.eventService.storePendingEventData(
      body.comboBookingId,
      body.data,
      req.user.id
    );
  }

  @Post('create-event-after-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async createEventAfterPayment(
    @Body() data: {
      comboBookingId: string;
      trackId: string;
    },
    @Req() req: any,
  ) {
    return this.eventService.createEventAfterPayment(
      data.comboBookingId,
      data.trackId
    );
  }
}



