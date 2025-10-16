import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArtistAvailabilityService } from './artist-availability.service';
import { BulkUnavailabilityDto } from './dto/create-unavailability.dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { GetUser } from 'src/common/decorators/getUser.decorator';

@Controller('artist-availability')
export class ArtistAvailabilityController {
  constructor(
    private readonly availabilityService: ArtistAvailabilityService,
  ) {}

  @Get('search')
  async findAvailableArtists(
    @Query('date') dateStr: string,
    @Query('startHour') startHour: string,
    @Query('endHour') endHour: string,
  ) {
    const date = new Date(dateStr);
    const start = parseInt(startHour, 10);
    const end = parseInt(endHour, 10);

    return this.availabilityService.findAvailableArtist(date, start, end);
  }

  @Get('/artist/:artistProfileId')
  async getArtistUnavailabilityByProfileId(
    @Param('artistProfileId') artistProfileId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const monthNumber = month ? parseInt(month, 10) : undefined;
    const yearNumber = year ? parseInt(year, 10) : undefined;
    return this.availabilityService.getArtistUnavailabilityByProfileId(artistProfileId, monthNumber, yearNumber);
  }

  @Get('/calendar/:artistProfileId')
  async getArtistCalendarAvailability(
    @Param('artistProfileId') artistProfileId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const monthNumber = month ? parseInt(month, 10) : undefined;
    const yearNumber = year ? parseInt(year, 10) : undefined;
    return this.availabilityService.getCalendarAvailability(artistProfileId, monthNumber, yearNumber);
  }

  @Get('/date/:artistProfileId/:date')
  async getArtistDateAvailability(
    @Param('artistProfileId') artistProfileId: string,
    @Param('date') date: string, // Format: YYYY-MM-DD
  ) {
    return this.availabilityService.getDateAvailability(artistProfileId, date);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @Get('/my-unavailability')
  async getMyUnavailability(@GetUser() user: any) {
    return this.availabilityService.getArtistUnavailability(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @Post('/remove')
  async removeUnavailability(
    @Body() body: BulkUnavailabilityDto,
    @GetUser() user: any
  ) {
    return this.availabilityService.removeUnavailability(user.userId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @Post('/bulk')
  async markUnavailableBulk(
    @Param('userId') userId: string,
    @Body() body: BulkUnavailabilityDto,
    @GetUser() user:any
  ) {
    return this.availabilityService.markUnavailableBulk(user.userId, body);
  }
}
