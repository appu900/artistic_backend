import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/infrastructure/database/schemas';
import {
  ArtistType,
  ArtistTypeDocument,
} from 'src/infrastructure/database/schemas/artist-type.schema';
import { CreateArtistTypeDto } from './dto/Artist-type.dto';
import { EquipmentProviderService, CreateEquipmentProviderRequest } from '../equipment-provider/equipment-provider.service';
import { ArtistService } from '../artist/artist.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(ArtistType.name)
    private artistTypeModel: Model<ArtistTypeDocument>,
    private equipmentProviderService: EquipmentProviderService,
    private artistService: ArtistService,
  ) {}

  async createArtistType(payload: CreateArtistTypeDto) {
    const existing = await this.artistTypeModel.findOne({ name: payload.name });
    if (existing) {
      throw new BadRequestException(
        `Artist type ${payload.name} already exists`,
      );
    }
    return await this.artistTypeModel.create({
      name: payload.name,
      description: payload.description,
    });
  }

  async createEquipmentProvider(data: CreateEquipmentProviderRequest, adminId: string) {
    return this.equipmentProviderService.createEquipmentProvider(data, adminId);
  }

  // Delegate artist-related methods to ArtistService
  async getAllUpdateRequests() {
    return this.artistService.getPendingRequests();
  }

  async reviewProfileUpdateRequest(adminId: string, requestId: string, approve: boolean, comment?: string) {
    return this.artistService.reviewProflileUpdateRequest(adminId, requestId, approve, comment);
  }

  async reviewPortfolioItem(adminId: string, portfolioItemId: string, approve: boolean, reviewComment?: string) {
    return this.artistService.reviewPortfolioItem(adminId, portfolioItemId, approve, reviewComment);
  }
}
