import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VenueLayoutService } from './venue-layout.service';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { VenueOwnerIdMigrationService } from './migrate-venue-owner-ids';
import { ViewportDto, BulkSeatStatusUpdateDto } from './dto/create-venue-layout.dto';
import { 
  SeatLockRequestDto, 
  SeatLockReleaseDto,
  SeatLockExtendDto,
  BulkSeatStateUpdatesDto,
  InitializeEventSeatsDto,
  SeatAvailabilityQueryDto 
} from './dto/seat-state.dto';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { RolesGuard } from '../../common/guards/roles.guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/roles.enum';

@Controller('venue-layout')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueLayoutController {
  constructor(
    private readonly venueLayoutService: VenueLayoutService,
    private readonly migrationService: VenueOwnerIdMigrationService
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  create(@Body() createVenueLayoutDto: CreateVenueLayoutDto) {
    return this.venueLayoutService.create(createVenueLayoutDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  findAll(
    @Query('venueOwnerId') venueOwnerId?: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.venueLayoutService.findAll({ venueOwnerId, eventId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.venueLayoutService.findOne(id);
  }

  @Get(':id/availability')
  getSeatAvailability(@Param('id') id: string, @Query('eventId') eventId?: string) {
    return this.venueLayoutService.getSeatAvailability(id, eventId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  update(@Param('id') id: string, @Body() updateVenueLayoutDto: CreateVenueLayoutDto) {
    return this.venueLayoutService.update(id, updateVenueLayoutDto);
  }

  // Removed toggleActive - isActive is now event-specific

  @Post(':id/duplicate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  duplicate(@Param('id') id: string, @Body('name') name?: string) {
    return this.venueLayoutService.duplicateLayout(id, name);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  remove(@Param('id') id: string) {
    return this.venueLayoutService.remove(id);
  }

  // Migration endpoint for fixing venue owner IDs
  @Post('migrate/venue-owner-ids')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async migrateVenueOwnerIds() {
    return this.migrationService.migrateVenueOwnerIds();
  }

  // Debug endpoint to inspect data relationships
  @Get('debug/venue-owner-data/:venueOwnerId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async debugVenueOwnerData(@Param('venueOwnerId') venueOwnerId: string) {
    return this.venueLayoutService.debugVenueOwnerData(venueOwnerId);
  }

  // Enhanced endpoints for large venue support
  @Post(':id/viewport')
  getLayoutByViewport(
    @Param('id') id: string,
    @Body() viewport: ViewportDto
  ) {
    return this.venueLayoutService.findByViewport(id, viewport);
  }

  @Patch(':id/seat-status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  updateSeatStatuses(
    @Param('id') layoutId: string,
    @Body() updateDto: BulkSeatStatusUpdateDto
  ) {
    return this.venueLayoutService.updateSeatStatuses(layoutId, updateDto.updates);
  }

  @Patch(':id/bulk-update-seats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  bulkUpdateSeats(
    @Param('id') layoutId: string,
    @Body() body: { seatIds: string[]; updates: any }
  ) {
    return this.venueLayoutService.bulkUpdateSeats(layoutId, body.seatIds, body.updates);
  }

  // Removed getLayoutStats - replaced by availability endpoint with eventId

  // ==========================================
  // NEW: Seat State Management Endpoints
  // ==========================================

  @Post('events/initialize-seats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  initializeEventSeats(@Body() dto: InitializeEventSeatsDto) {
    return this.venueLayoutService.initializeEventSeats(dto);
  }

  @Post('events/seat-availability')
  getSeatAvailabilityForEvent(@Body() query: SeatAvailabilityQueryDto) {
    return this.venueLayoutService.getSeatAvailabilityForEvent(query);
  }

  @Patch('events/:eventId/seat-states')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  bulkUpdateSeatStates(
    @Param('eventId') eventId: string,
    @Body() updates: BulkSeatStateUpdatesDto
  ) {
    return this.venueLayoutService.bulkUpdateSeatStates(eventId, updates);
  }


  // Redis Seat Locking Endpoints


  @Post('events/:eventId/lock-seats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER, UserRole.NORMAL)
  lockSeatsForBooking(
    @Param('eventId') eventId: string,
    @Body() lockRequest: SeatLockRequestDto
  ) {
    return this.venueLayoutService.lockSeatsForBooking(
      eventId,
      lockRequest.seatIds,
      lockRequest.userId,
      lockRequest.lockDurationMinutes
    );
  }

  @Post('events/:eventId/release-seats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER, UserRole.NORMAL)
  releaseSeatsFromBooking(
    @Param('eventId') eventId: string,
    @Body() releaseRequest: SeatLockReleaseDto
  ) {
    return this.venueLayoutService.releaseSeatsFromBooking(
      eventId,
      releaseRequest.seatIds,
      releaseRequest.userId
    );
  }

  @Post('events/:eventId/extend-locks')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER, UserRole.NORMAL)
  extendSeatLocks(
    @Param('eventId') eventId: string,
    @Body() extendRequest: SeatLockExtendDto
  ) {
    return this.venueLayoutService.extendSeatLocks(
      eventId,
      extendRequest.seatIds,
      extendRequest.userId,
      extendRequest.additionalMinutes
    );
  }

  @Post('events/:eventId/confirm-booking')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER, UserRole.NORMAL)
  confirmSeatBooking(
    @Param('eventId') eventId: string,
    @Body() body: { 
      seatIds: string[]; 
      userId: string; 
      bookingId: string; 
      bookedPrices?: Record<string, number> 
    }
  ) {
    return this.venueLayoutService.confirmSeatBooking(
      eventId,
      body.seatIds,
      body.userId,
      body.bookingId,
      body.bookedPrices
    );
  }

  @Get('events/:eventId/seat-locks')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  checkSeatLocks(@Param('eventId') eventId: string, @Query('seatIds') seatIds?: string) {
    const seatIdArray = seatIds ? seatIds.split(',') : [];
    return this.venueLayoutService.checkSeatLocks(eventId, seatIdArray);
  }

  @Get('events/:eventId/lock-stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  getSeatLockStats(@Param('eventId') eventId: string) {
    return this.venueLayoutService.getSeatLockStats(eventId);
  }
}
