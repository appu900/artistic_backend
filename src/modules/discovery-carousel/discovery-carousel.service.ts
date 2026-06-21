import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DiscoveryCard,
  DiscoveryCardDocument,
} from '../../infrastructure/database/schemas/discovery-card.schema';
import {
  DISCOVERY_SETTINGS_KEY,
  DiscoverySettings,
  DiscoverySettingsDocument,
} from '../../infrastructure/database/schemas/discovery-settings.schema';
import {
  CreateDiscoveryCardDto,
  UpdateDiscoveryCardDto,
  UpdateDiscoverySettingsDto,
} from './dto/discovery-carousel.dto';

export interface DiscoveryCardResponse {
  id: string;
  category: string;
  title: string;
  caption: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverySettingsResponse {
  eyebrow: string;
  title: string;
  subtitle: string;
}

@Injectable()
export class DiscoveryCarouselService {
  constructor(
    @InjectModel(DiscoveryCard.name)
    private readonly cardModel: Model<DiscoveryCardDocument>,
    @InjectModel(DiscoverySettings.name)
    private readonly settingsModel: Model<DiscoverySettingsDocument>,
  ) {}

  private toCardResponse(doc: DiscoveryCardDocument): DiscoveryCardResponse {
    return {
      id: doc._id.toString(),
      category: doc.category,
      title: doc.title,
      caption: doc.caption ?? '',
      mediaType: doc.mediaType,
      mediaUrl: doc.mediaUrl,
      order: doc.order,
      isActive: doc.isActive,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private async getSettingsDocument(): Promise<DiscoverySettingsDocument> {
    let settings = await this.settingsModel.findOne({ key: DISCOVERY_SETTINGS_KEY });

    if (!settings) {
      settings = await this.settingsModel.create({ key: DISCOVERY_SETTINGS_KEY });
    }

    return settings;
  }

  async getCarouselData(all = false) {
    const settingsDoc = await this.getSettingsDocument();
    const query = all ? {} : { isActive: true };

    const cards = await this.cardModel
      .find(query)
      .sort({ order: 1, createdAt: 1 })
      .exec();

    return {
      settings: {
        eyebrow: settingsDoc.eyebrow,
        title: settingsDoc.title,
        subtitle: settingsDoc.subtitle,
      },
      cards: cards.map((card) => this.toCardResponse(card)),
    };
  }

  async updateSettings(
    dto: UpdateDiscoverySettingsDto,
  ): Promise<DiscoverySettingsResponse> {
    const settingsDoc = await this.getSettingsDocument();

    if (dto.eyebrow?.trim()) settingsDoc.eyebrow = dto.eyebrow.trim();
    if (dto.title?.trim()) settingsDoc.title = dto.title.trim();
    if (dto.subtitle?.trim()) settingsDoc.subtitle = dto.subtitle.trim();

    await settingsDoc.save();

    return {
      eyebrow: settingsDoc.eyebrow,
      title: settingsDoc.title,
      subtitle: settingsDoc.subtitle,
    };
  }

  async createCard(dto: CreateDiscoveryCardDto): Promise<DiscoveryCardResponse> {
    if (!dto.category?.trim() || !dto.title?.trim() || !dto.mediaUrl?.trim()) {
      throw new BadRequestException('category, title, and mediaUrl are required');
    }

    const lastCard = await this.cardModel.findOne().sort({ order: -1 }).exec();
    const order = lastCard ? lastCard.order + 1 : 0;

    const card = await this.cardModel.create({
      category: dto.category.trim(),
      title: dto.title.trim(),
      caption: dto.caption?.trim() ?? '',
      mediaType: dto.mediaType === 'video' ? 'video' : 'image',
      mediaUrl: dto.mediaUrl.trim(),
      order,
      isActive: dto.isActive !== false,
    });

    return this.toCardResponse(card);
  }

  async updateCard(dto: UpdateDiscoveryCardDto): Promise<DiscoveryCardResponse> {
    if (!dto.id || !Types.ObjectId.isValid(dto.id)) {
      throw new BadRequestException('Valid id is required');
    }

    const card = await this.cardModel.findById(dto.id).exec();
    if (!card) {
      throw new NotFoundException('Card not found');
    }

    if (dto.category !== undefined) card.category = dto.category.trim();
    if (dto.title !== undefined) card.title = dto.title.trim();
    if (dto.caption !== undefined) card.caption = dto.caption.trim();
    if (dto.mediaType !== undefined) card.mediaType = dto.mediaType;
    if (dto.mediaUrl !== undefined) {
      const mediaUrl = dto.mediaUrl.trim();
      if (!mediaUrl) {
        throw new BadRequestException('mediaUrl is required');
      }
      card.mediaUrl = mediaUrl;
    }
    if (dto.order !== undefined) card.order = dto.order;
    if (dto.isActive !== undefined) card.isActive = dto.isActive;

    await card.save();
    return this.toCardResponse(card);
  }

  async deleteCard(id: string): Promise<void> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Valid id is required');
    }

    const result = await this.cardModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Card not found');
    }
  }
}
