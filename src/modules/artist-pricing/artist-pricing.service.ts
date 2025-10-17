import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ArtistPricing,
  ArtistPricingDocument,
} from 'src/infrastructure/database/schemas/Artist-pricing.schema';
import { ArtistPricingData } from './types/create-artist.price';

@Injectable()
export class ArtistPricingService {
  constructor(
    @InjectModel(ArtistPricing.name)
    private artistPricingModel: Model<ArtistPricingDocument>,
  ) {}
  async create(artistProfileId: string, pricingData: ArtistPricingData) {
    const existing = await this.artistPricingModel.findById(artistProfileId);
    if (existing) {
      throw new ConflictException('pricing detaills for artist exists');
    }
    return this.artistPricingModel.create({
      artistProfileId,
      ...pricingData,
    });
  }
}
