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

import { ViewportDto, BulkSeatStatusUpdateDto } from './dto/create-venue-layout.dto';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { RolesGuard } from '../../common/guards/roles.guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/roles.enum';

@Controller('venue-layout')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueLayoutController {
  constructor(private readonly venueLayoutService: VenueLayoutService) {}

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
  getSeatAvailability(@Param('id') id: string) {
    return this.venueLayoutService.getSeatAvailability(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  update(@Param('id') id: string, @Body() updateVenueLayoutDto: CreateVenueLayoutDto) {
    return this.venueLayoutService.update(id, updateVenueLayoutDto);
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  toggleActive(@Param('id') id: string) {
    return this.venueLayoutService.toggleActive(id);
  }

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

  @Get(':id/stats')
  getLayoutStats(@Param('id') id: string) {
    return this.venueLayoutService.getLayoutStats(id);
  }
}
