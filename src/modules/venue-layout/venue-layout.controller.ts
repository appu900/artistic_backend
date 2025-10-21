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
import { UpdateVenueLayoutDto } from './dto/update-venue-layout.dto';
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
  update(@Param('id') id: string, @Body() updateVenueLayoutDto: UpdateVenueLayoutDto) {
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
}
