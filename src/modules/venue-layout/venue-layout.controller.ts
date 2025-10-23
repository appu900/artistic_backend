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
  Req,
  BadRequestException,
} from '@nestjs/common';
import { VenueLayoutService } from './venue-layout.service';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
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
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async create(@Body() createVenueLayoutDto: CreateVenueLayoutDto, @Req() req: any) {
    // If a venue owner is creating a layout, automatically set them as the owner
    if (req.user && req.user.role === 'VENUE_OWNER') {
      // Find the venue owner's profile ID
      const userProfile = await this.venueLayoutService.getVenueOwnerProfileByUserId(req.user.userId);
      if (!userProfile) {
        throw new BadRequestException('Venue owner profile not found');
      }
      
      // Set the venueOwnerId to their profile ID
      createVenueLayoutDto.venueOwnerId = userProfile._id.toString();
      
      // Ensure ownerCanEdit is true for venue owners creating their own layouts
      if (createVenueLayoutDto.ownerCanEdit === undefined) {
        createVenueLayoutDto.ownerCanEdit = true;
      }
    }
    
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
  async findOne(@Param('id') id: string, @Req() req: any) {
    const layout = await this.venueLayoutService.findOne(id);
    
    // Add ownerCanEdit logic for venue owners
    if (req.user && req.user.role === 'VENUE_OWNER') {
      // Check if this venue owner can edit this layout
      const canEdit = await this.venueLayoutService.checkOwnerEditPermission(id, req.user.userId);
      (layout as any).ownerCanEdit = canEdit;
    } else {
      // Admins and super admins can always edit, regular users cannot
      (layout as any).ownerCanEdit = req.user && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    }
    
    return layout;
  }

  @Get(':id/availability')
  getSeatAvailability(@Param('id') id: string, @Query('eventId') eventId?: string) {
    return this.venueLayoutService.getSeatAvailability(id, eventId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async update(@Param('id') id: string, @Body() updateVenueLayoutDto: CreateVenueLayoutDto, @Req() req: any) {
    // For venue owners, check if they have permission to edit this layout
    if (req.user && req.user.role === 'VENUE_OWNER') {
      const canEdit = await this.venueLayoutService.checkOwnerEditPermission(id, req.user.userId);
      if (!canEdit) {
        throw new BadRequestException('You do not have permission to edit this layout');
      }
    }
    
    return this.venueLayoutService.update(id, updateVenueLayoutDto);
  }

  // Removed toggleActive - isActive is now event-specific

  @Post(':id/duplicate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async duplicate(@Param('id') id: string, @Req() req: any, @Body('name') name?: string) {
    // For venue owners, check if they have permission to duplicate this layout
    if (req.user && req.user.role === 'VENUE_OWNER') {
      const canEdit = await this.venueLayoutService.checkOwnerEditPermission(id, req.user.userId);
      if (!canEdit) {
        throw new BadRequestException('You do not have permission to duplicate this layout');
      }
    }
    
    return this.venueLayoutService.duplicateLayout(id, name);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async remove(@Param('id') id: string, @Req() req: any) {
    // For venue owners, check if they have permission to delete this layout
    if (req.user && req.user.role === 'VENUE_OWNER') {
      const canEdit = await this.venueLayoutService.checkOwnerEditPermission(id, req.user.userId);
      if (!canEdit) {
        throw new BadRequestException('You do not have permission to delete this layout');
      }
    }
    
    return this.venueLayoutService.remove(id);
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

  // Seat State Management Endpoints

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
