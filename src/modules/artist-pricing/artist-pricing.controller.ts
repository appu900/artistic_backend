import { 
  Body, 
  Controller, 
  Delete, 
  Get, 
  Param, 
  Post, 
  Put, 
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArtistPricingService, TimeSlotPricingData } from './artist-pricing.service';
import { TimeSlotService } from './time-slot.service';
import { ArtistPricingData } from './types/create-artist.price';
import { PerformancePreference } from 'src/infrastructure/database/schemas/artist-profile.schema';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

@Controller('artist-pricing')
@UseGuards(JwtAuthGuard)
export class ArtistPricingController {
  constructor(
    private readonly artistPricingService: ArtistPricingService,
    private readonly timeSlotService: TimeSlotService,
  ) {}

  @Post(':artistProfileId')
  async createPricing(
    @Param('artistProfileId') artistProfileId: string,
    @Body() pricingData: ArtistPricingData,
  ) {
    return await this.artistPricingService.create(artistProfileId, pricingData);
  }

  @Get(':artistProfileId')
  async getPricing(@Param('artistProfileId') artistProfileId: string) {
    return await this.artistPricingService.findByArtistProfileId(artistProfileId);
  }

  @Put(':artistProfileId/basic')
  async updateBasicPricing(
    @Param('artistProfileId') artistProfileId: string,
    @Body() pricingData: ArtistPricingData,
  ) {
    return await this.artistPricingService.updateBasicPricing(
      artistProfileId,
      pricingData,
    );
  }

  @Put(':artistProfileId/timeslot')
  async updateTimeSlotPricing(
    @Param('artistProfileId') artistProfileId: string,
    @Body() pricingData: TimeSlotPricingData,
  ) {
    return await this.artistPricingService.updateTimeSlotPricing(
      artistProfileId,
      pricingData,
    );
  }

  @Get(':artistProfileId/timeslot/all')
  async getAllTimeSlotPricing(@Param('artistProfileId') artistProfileId: string) {
    return await this.artistPricingService.getAllTimeSlotPricing(artistProfileId);
  }

  @Get(':artistProfileId/availability/:date')
  async getDateAvailability(
    @Param('artistProfileId') artistProfileId: string,
    @Param('date') date: string,
    @Query('performanceType') performanceType: PerformancePreference,
  ) {
    const dateObj = new Date(date);
    return await this.timeSlotService.getDateAvailability(
      artistProfileId,
      dateObj,
      performanceType,
    );
  }

  @Post(':artistProfileId/booking/cost')
  async calculateBookingCost(
    @Param('artistProfileId') artistProfileId: string,
    @Body() body: {
      performanceType: PerformancePreference;
      startHour: number;
      duration: number;
    },
  ) {
    const cost = await this.timeSlotService.calculateBookingCost(
      artistProfileId,
      body.performanceType,
      body.startHour,
      body.duration,
    );
    return { totalCost: cost };
  }

  @Post(':artistProfileId/availability/check')
  async checkAvailability(
    @Param('artistProfileId') artistProfileId: string,
    @Body() body: {
      date: string;
      startHour: number;
      duration: number;
    },
  ) {
    const dateObj = new Date(body.date);
    return await this.timeSlotService.checkConsecutiveAvailability(
      artistProfileId,
      dateObj,
      body.startHour,
      body.duration,
    );
  }

  @Post(':artistProfileId/booking/validate')
  async validateConsecutiveBooking(
    @Param('artistProfileId') artistProfileId: string,
    @Body() body: {
      date: string;
      startHour: number;
      duration: number;
    },
  ) {
    const dateObj = new Date(body.date);
    return await this.timeSlotService.validateConsecutiveBooking(
      artistProfileId,
      dateObj,
      body.startHour,
      body.duration,
    );
  }

  @Delete(':artistProfileId')
  async deletePricing(@Param('artistProfileId') artistProfileId: string) {
    return await this.artistPricingService.delete(artistProfileId);
  }
}
