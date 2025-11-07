import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ArtistPricing,
  ArtistPricingDocument,
  TimeSlotPricing,
} from 'src/infrastructure/database/schemas/Artist-pricing.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
  PerformancePreference,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableDocument,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';

export interface TimeSlotAvailability {
  hour: number;
  isAvailable: boolean;
  price: number;
  reason?: string; 
}

export interface DateAvailability {
  date: string;
  timeSlots: TimeSlotAvailability[];
  maxPerformanceHours?: number;
  cooldownPeriodHours?: number;
}

@Injectable()
export class TimeSlotService {
  constructor(
    @InjectModel(ArtistPricing.name)
    private artistPricingModel: Model<ArtistPricingDocument>,
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(ArtistUnavailable.name)
    private artistUnavailableModel: Model<ArtistUnavailableDocument>,
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
  ) {}

  /**
   * Get time slot pricing for an artist and performance type
   */
  async getTimeSlotPricing(
    artistProfileId: string,
    performanceType: PerformancePreference,
  ): Promise<TimeSlotPricing[]> {
    const artistObjectId = new Types.ObjectId(artistProfileId);
    let pricing = await this.artistPricingModel.findOne({
      artistProfileId: artistObjectId,
    });
    
    if (!pricing) {
      pricing = await this.artistPricingModel.findOne({
        artistProfileId: artistProfileId as any,
      });
    }

    if (!pricing || pricing.pricingMode !== 'timeslot') {
      return [];
    }

    switch (performanceType) {
      case PerformancePreference.PRIVATE:
        return pricing.privateTimeSlotPricing || [];
      case PerformancePreference.PUBLIC:
        return pricing.publicTimeSlotPricing || [];
      case PerformancePreference.WORKSHOP:
        return pricing.workshopTimeSlotPricing || [];
      case PerformancePreference.INTERNATIONAL:
        return pricing.internationalTimeSlotPricing || [];
      default:
        return [];
    }
  }

  /**
   * Get base rate for performance type when no specific time slot pricing
   */
  async getBaseRate(
    artistProfileId: string,
    performanceType: PerformancePreference,
  ): Promise<number> {
    const artistObjectId = new Types.ObjectId(artistProfileId);
    let pricing = await this.artistPricingModel.findOne({
      artistProfileId: artistObjectId,
    });
    
    if (!pricing) {
      pricing = await this.artistPricingModel.findOne({
        artistProfileId: artistProfileId as any,
      });
    }

    if (!pricing) return 0;

    switch (performanceType) {
      case PerformancePreference.PRIVATE:
        return pricing.basePrivateRate || 0;
      case PerformancePreference.PUBLIC:
        return pricing.basePublicRate || 0;
      case PerformancePreference.WORKSHOP:
        return pricing.baseWorkshopRate || 0;
      case PerformancePreference.INTERNATIONAL:
        return pricing.baseInternationalRate || 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate price for a specific time slot
   */
  async getTimeSlotPrice(
    artistProfileId: string,
    performanceType: PerformancePreference,
    hour: number,
  ): Promise<number> {
    const timeSlotPricing = await this.getTimeSlotPricing(
      artistProfileId,
      performanceType,
    );

    // Find specific time slot pricing
    const slotPricing = timeSlotPricing.find((slot) => slot.hour === hour);
    if (slotPricing) {
      return slotPricing.rate;
    }

    // Fall back to base rate
    return await this.getBaseRate(artistProfileId, performanceType);
  }

  /**
   * Check if consecutive time slots are available considering cooldown and max performance hours
   */
  async checkConsecutiveAvailability(
    artistProfileId: string,
    date: Date,
    startHour: number,
    duration: number,
  ): Promise<{ isAvailable: boolean; reason?: string }> {
    const artist = await this.artistProfileModel.findById(artistProfileId);
    if (!artist) {
      return { isAvailable: false, reason: 'Artist not found' };
    }

    // Check if duration exceeds maximum performance hours
    if (duration > artist.maximumPerformanceHours) {
      return {
        isAvailable: false,
        reason: `Maximum performance duration is ${artist.maximumPerformanceHours} hours`,
      };
    }

    // Check existing bookings for the date
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const existingBookings = await this.artistBookingModel.find({
      artistId: artistProfileId,
      date: date.toISOString().split('T')[0],
      status: { $in: ['pending', 'confirmed'] },
    });

    // Check for conflicts with existing bookings and cooldown periods
    for (let i = 0; i < duration; i++) {
      const currentHour = startHour + i;
      
      // Check direct booking conflicts
      const hasConflict = existingBookings.some((booking) => {
        const bookingStartHour = parseInt(booking.startTime.split(':')[0]);
        const bookingEndHour = parseInt(booking.endTime.split(':')[0]);
        
        return currentHour >= bookingStartHour && currentHour < bookingEndHour;
      });

      if (hasConflict) {
        return {
          isAvailable: false,
          reason: `Time slot ${currentHour}:00 conflicts with existing booking`,
        };
      }

      // Check cooldown period conflicts
      const cooldownConflict = existingBookings.some((booking) => {
        const bookingEndHour = parseInt(booking.endTime.split(':')[0]);
        const cooldownEndHour = bookingEndHour + artist.cooldownPeriodHours;
        
        return currentHour < cooldownEndHour && currentHour >= bookingEndHour;
      });

      if (cooldownConflict) {
        return {
          isAvailable: false,
          reason: `Time slot ${currentHour}:00 is within cooldown period`,
        };
      }
    }

    const dateString = date.toISOString().split('T')[0];
    
    const artistObjectId = new Types.ObjectId(artistProfileId);
    
    const unavailableRecord = await this.artistUnavailableModel.findOne({
      artistProfile: artistObjectId,
      date: {
        $gte: dayStart,
        $lte: dayEnd,
      },
    });

    if (unavailableRecord) {
      const requestedHours = Array.from({ length: duration }, (_, i) => startHour + i);
      const conflictingHours = requestedHours.filter(hour => 
        unavailableRecord.hours.includes(hour)
      );

      if (conflictingHours.length > 0) {
        return {
          isAvailable: false,
          reason: `Artist marked as unavailable for hours: ${conflictingHours.join(', ')}`,
        };
      }
    }

    return { isAvailable: true };
  }

  /**
   * Get availability for a specific date with pricing information
   */
  async getDateAvailability(
    artistProfileId: string,
    date: Date,
    performanceType: PerformancePreference,
  ): Promise<DateAvailability> {
    // Get artist profile with pricing info
    const artistObjectId = new Types.ObjectId(artistProfileId);
    const artist = await this.artistProfileModel.findById(artistObjectId);
    
    if (!artist) {
      throw new Error('Artist not found');
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const unavailableRecord = await this.artistUnavailableModel.findOne({
      artistProfile: artistObjectId,
      date: {
        $gte: dayStart,
        $lte: dayEnd,
      },
    });

    const existingBookings = await this.artistBookingModel.find({
      artistId: artistProfileId,
      date: date.toISOString().split('T')[0],
      status: { $in: ['pending', 'confirmed'] },
    });

    let pricingDoc = await this.artistPricingModel.findOne({
      artistProfileId: artistObjectId,
    });
    
    if (!pricingDoc) {
      pricingDoc = await this.artistPricingModel.findOne({
        artistProfileId: artistProfileId as any,
      });
    }

    const timeSlots: TimeSlotAvailability[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const isUnavailable = unavailableRecord?.hours.includes(hour) || false;
      
      const hasBookingConflict = existingBookings.some((booking) => {
        const bookingStartHour = parseInt(booking.startTime.split(':')[0]);
        const bookingEndHour = parseInt(booking.endTime.split(':')[0]);
        return hour >= bookingStartHour && hour < bookingEndHour;
      });

      const hasCooldownConflict = existingBookings.some((booking) => {
        const bookingEndHour = parseInt(booking.endTime.split(':')[0]);
        const cooldownEndHour = bookingEndHour + artist.cooldownPeriodHours;
        return hour < cooldownEndHour && hour >= bookingEndHour;
      });

      let isAvailable = true;
      let reason: string | undefined;

      if (isUnavailable) {
        isAvailable = false;
        reason = 'Artist marked as unavailable';
      } else if (hasBookingConflict) {
        isAvailable = false;
        reason = 'Existing booking conflict';
      } else if (hasCooldownConflict) {
        isAvailable = false;
        reason = 'Within cooldown period';
      }

      const price = this.calculateHourPrice(pricingDoc, performanceType, hour);

      timeSlots.push({
        hour,
        isAvailable,
        price,
        reason,
      });
    }

    return {
      date: date.toISOString().split('T')[0],
      timeSlots,
      maxPerformanceHours: artist.maximumPerformanceHours, 
      cooldownPeriodHours: artist.cooldownPeriodHours,
    };
  }

  /**
   * Validate if a consecutive booking is allowed (called from frontend)
   */
  async validateConsecutiveBooking(
    artistProfileId: string,
    date: Date,
    startHour: number,
    duration: number,
  ): Promise<{ isValid: boolean; reason?: string }> {
    const artistObjectId = new Types.ObjectId(artistProfileId);
    const artist = await this.artistProfileModel.findById(artistObjectId);
    
    if (!artist) {
      return { isValid: false, reason: 'Artist not found' };
    }

    if (duration > artist.maximumPerformanceHours) {
      return {
        isValid: false,
        reason: `Maximum performance duration is ${artist.maximumPerformanceHours} hours`,
      };
    }

    const result = await this.checkConsecutiveAvailability(artistProfileId, date, startHour, duration);
    return {
      isValid: result.isAvailable,
      reason: result.reason,
    };
  }

  /**
   * Helper method to calculate price for a specific hour from pricing document
   */
  private calculateHourPrice(
    pricingDoc: any,
    performanceType: PerformancePreference,
    hour: number,
  ): number {
    if (!pricingDoc) return 0;

    const performanceData = pricingDoc[performanceType];
    if (!performanceData) return 0;

    const timeSlot = performanceData.timeSlotPricing?.find((slot: any) => {
      const slotHour = parseInt(slot.startTime.split(':')[0]);
      return slotHour === hour;
    });

    return timeSlot ? timeSlot.price : performanceData.baseRate || 0;
  }

  /**
   * Calculate total cost for a booking
   */
  async calculateBookingCost(
    artistProfileId: string,
    performanceType: PerformancePreference,
    startHour: number,
    duration: number,
  ): Promise<number> {
    const artistObjectId = new Types.ObjectId(artistProfileId);
    
    // Try both ObjectId and string queries to handle data inconsistencies
    let pricingDoc = await this.artistPricingModel.findOne({
      artistProfileId: artistObjectId,
    });
    
    if (!pricingDoc) {
      pricingDoc = await this.artistPricingModel.findOne({
        artistProfileId: artistProfileId as any,
      });
    }

    if (!pricingDoc) {
      return 0;
    }

    if (pricingDoc.pricingMode === 'duration') {
      let pricingArray: {hours: number, amount: number}[] = [];
      switch (performanceType) {
        case PerformancePreference.PRIVATE:
          pricingArray = pricingDoc.privatePricing || [];
          break;
        case PerformancePreference.PUBLIC:
          pricingArray = pricingDoc.publicPricing || [];
          break;
        case PerformancePreference.WORKSHOP:
          pricingArray = pricingDoc.workshopPricing || [];
          break;
        case PerformancePreference.INTERNATIONAL:
          pricingArray = pricingDoc.internationalPricing || [];
          break;
      }

      // Find exact duration match
      const exactMatch = pricingArray.find(price => price.hours === duration);
      if (exactMatch && exactMatch.amount > 0) {
        return exactMatch.amount;
      }

      const higherDurations = pricingArray
        .filter(price => price.hours > duration && price.amount > 0)
        .sort((a, b) => a.hours - b.hours);

      if (higherDurations.length > 0) {
        const closest = higherDurations[0];
        const proportionalRate = closest.amount / closest.hours;
        const calculatedCost = proportionalRate * duration;
        return parseFloat(calculatedCost.toFixed(2));
      }

      const availablePricing = pricingArray.filter(price => price.amount > 0);
      if (availablePricing.length > 0) {
        const highest = availablePricing.sort((a, b) => b.hours - a.hours)[0];
        const baseRate = highest.amount / highest.hours;
        const calculatedCost = baseRate * duration;
        return parseFloat(calculatedCost.toFixed(2));
      }

      const baseRate = this.getPerformanceBaseRate(pricingDoc, performanceType);
      if (baseRate > 0) {
        const calculatedCost = baseRate * duration;
        return parseFloat(calculatedCost.toFixed(2));
      }
    }

    if (pricingDoc.pricingMode === 'timeslot') {
      let totalCost = 0;

      for (let i = 0; i < duration; i++) {
        const hour = startHour + i;
        const hourlyRate = await this.getTimeSlotPrice(
          artistProfileId,
          performanceType,
          hour,
        );
        totalCost += hourlyRate;
      }

      // Ensure decimal precision is maintained
      return parseFloat(totalCost.toFixed(2));
    }

    return 0;
  }

  /**
   * Helper method to get base rate from pricing document
   */
  private getPerformanceBaseRate(pricingDoc: any, performanceType: PerformancePreference): number {
    switch (performanceType) {
      case PerformancePreference.PRIVATE:
        return pricingDoc.basePrivateRate || 0;
      case PerformancePreference.PUBLIC:
        return pricingDoc.basePublicRate || 0;
      case PerformancePreference.WORKSHOP:
        return pricingDoc.baseWorkshopRate || 0;
      case PerformancePreference.INTERNATIONAL:
        return pricingDoc.baseInternationalRate || 0;
      default:
        return 0;
    }
  }

  /**
   * Update time slot pricing for an artist
   */
  async updateTimeSlotPricing(
    artistProfileId: string,
    performanceType: PerformancePreference,
    timeSlotPricing: TimeSlotPricing[],
  ): Promise<void> {
    const updateData: any = {
      pricingMode: 'timeslot',
    };

    switch (performanceType) {
      case PerformancePreference.PRIVATE:
        updateData.privateTimeSlotPricing = timeSlotPricing;
        break;
      case PerformancePreference.PUBLIC:
        updateData.publicTimeSlotPricing = timeSlotPricing;
        break;
      case PerformancePreference.WORKSHOP:
        updateData.workshopTimeSlotPricing = timeSlotPricing;
        break;
      case PerformancePreference.INTERNATIONAL:
        updateData.internationalTimeSlotPricing = timeSlotPricing;
        break;
    }

    await this.artistPricingModel.findOneAndUpdate(
      { artistProfileId },
      updateData,
      { upsert: true },
    );
  }
}