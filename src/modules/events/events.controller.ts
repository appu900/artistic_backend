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
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  @UseInterceptors(FileInterceptor('coverPhoto'))
  async createEventAsAdmin(
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
    @UploadedFile() coverPhoto?: Express.Multer.File,
  ) {
    return this.eventService.createEvent(
      createEventDto,
      req.user.id,
      'admin',
      undefined,
      coverPhoto,
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
  @UseInterceptors(FileInterceptor('coverPhoto'))
  async createEventAsVenueOwner(
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
    @UploadedFile() coverPhoto?: Express.Multer.File,
  ) {
    // Venue owners can only create events for their own venues
    return this.eventService.createEvent(
      createEventDto,
      req.user.id,
      'venue_owner',
      req.user.venueOwnerId, // Assuming this is set in JWT payload
      coverPhoto,
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

  // ==================== BOOKING ENDPOINTS ====================

  @Post('book-tickets')
  @UseGuards(JwtAuthGuard)
  async bookEventTickets(@Body() bookingDto: BookEventTicketsDto, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(bookingDto.eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    return this.eventService.bookEventTickets({
      ...bookingDto,
      userId: req.user.id,
    });
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
}
