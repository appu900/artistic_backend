import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ArtistPricing,
  ArtistPricingDocument,
  TimeSlotPricing,
} from 'src/infrastructure/database/schemas/Artist-pricing.schema';
import { ArtistPricingData } from './types/create-artist.price';
import { PerformancePreference } from 'src/infrastructure/database/schemas/artist-profile.schema';

export interface TimeSlotPricingData {
  performanceType: PerformancePreference;
  timeSlotPricing: TimeSlotPricing[];
  baseRate?: number;
  pricingMode: 'duration' | 'timeslot';
}

@Injectable()
export class ArtistPricingService {
  constructor(
    @InjectModel(ArtistPricing.name)
    private artistPricingModel: Model<ArtistPricingDocument>,
  ) {}

  async create(artistProfileId: string, pricingData: ArtistPricingData) {
    const existing = await this.artistPricingModel.findOne({ 
      artistProfileId 
    });
    if (existing) {
      throw new ConflictException('Pricing details for artist already exist');
    }
    const res = await this.artistPricingModel.create({
      artistProfileId,
      ...pricingData,
    });
    return res;
  }

  async findByArtistProfileId(artistProfileId: string) {
    return await this.artistPricingModel.findOne({ artistProfileId });
  }

  async updateTimeSlotPricing(
    artistProfileId: string,
    pricingData: TimeSlotPricingData,
  ) {
    const updateData: any = {
      pricingMode: pricingData.pricingMode,
    };

    // Set base rates
    switch (pricingData.performanceType) {
      case PerformancePreference.PRIVATE:
        updateData.privateTimeSlotPricing = pricingData.timeSlotPricing;
        if (pricingData.baseRate !== undefined) {
          updateData.basePrivateRate = pricingData.baseRate;
        }
        break;
      case PerformancePreference.PUBLIC:
        updateData.publicTimeSlotPricing = pricingData.timeSlotPricing;
        if (pricingData.baseRate !== undefined) {
          updateData.basePublicRate = pricingData.baseRate;
        }
        break;
      case PerformancePreference.WORKSHOP:
        updateData.workshopTimeSlotPricing = pricingData.timeSlotPricing;
        if (pricingData.baseRate !== undefined) {
          updateData.baseWorkshopRate = pricingData.baseRate;
        }
        break;
      case PerformancePreference.INTERNATIONAL:
        updateData.internationalTimeSlotPricing = pricingData.timeSlotPricing;
        if (pricingData.baseRate !== undefined) {
          updateData.baseInternationalRate = pricingData.baseRate;
        }
        break;
    }

    const result = await this.artistPricingModel.findOneAndUpdate(
      { artistProfileId },
      updateData,
      { upsert: true, new: true },
    );

    return result;
  }

  async updateBasicPricing(
    artistProfileId: string,
    pricingData: ArtistPricingData,
  ) {
    const result = await this.artistPricingModel.findOneAndUpdate(
      { artistProfileId },
      { ...pricingData, pricingMode: 'duration' },
      { upsert: true, new: true },
    );

    return result;
  }

  async delete(artistProfileId: string) {
    const result = await this.artistPricingModel.findOneAndDelete({
      artistProfileId,
    });

    if (!result) {
      throw new NotFoundException('Pricing information not found');
    }

    return result;
  }

  async getAllTimeSlotPricing(artistProfileId: string) {
    const pricing = await this.artistPricingModel.findOne({ artistProfileId });
    
    if (!pricing) {
      return null;
    }

    return {
      pricingMode: pricing.pricingMode,
      private: {
        timeSlotPricing: pricing.privateTimeSlotPricing || [],
        baseRate: pricing.basePrivateRate || 0,
      },
      public: {
        timeSlotPricing: pricing.publicTimeSlotPricing || [],
        baseRate: pricing.basePublicRate || 0,
      },
      workshop: {
        timeSlotPricing: pricing.workshopTimeSlotPricing || [],
        baseRate: pricing.baseWorkshopRate || 0,
      },
      international: {
        timeSlotPricing: pricing.internationalTimeSlotPricing || [],
        baseRate: pricing.baseInternationalRate || 0,
      },
    };
  }
}
