import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import {
  Sponsor,
  SponsorDocument,
} from '../../infrastructure/database/schemas/sponsor.schema';
import {
  CreateSponsorDto,
  UpdateSponsorDto,
  UpdateSponsorOrderDto,
} from './dto/sponsor.dto';
import { User, UserDocument } from '../../infrastructure/database/schemas';

@Injectable()
export class SponsorService {
  constructor(
    @InjectModel(Sponsor.name)
    private readonly sponsorModel: Model<SponsorDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createSponsor(
    userId: string,
    dto: CreateSponsorDto,
  ): Promise<Sponsor> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    // Set order to last if not provided (check for undefined/null, not falsy)
    if (dto.order === undefined || dto.order === null) {
      const lastSponsor = await this.sponsorModel
        .findOne()
        .sort({ order: -1 });
      dto.order = lastSponsor ? lastSponsor.order + 1 : 0;
    }

    const sponsor = await this.sponsorModel.create({
      ...dto,
      createdBy: new mongoose.Types.ObjectId(userId),
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    return sponsor;
  }

  async getAllSponsors(
    page: number = 1,
    limit: number = 10,
    isActive?: boolean,
    tier?: string,
  ) {
    const query: any = {};
    if (isActive !== undefined) {
      query.isActive = isActive;
    }
    if (tier) {
      query.tier = tier;
    }

    // Add date filtering for active sponsors
    if (isActive === true) {
      const now = new Date();
      query.$and = [
        { startDate: { $lte: now } },
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: now } },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [sponsors, total] = await Promise.all([
      this.sponsorModel
        .find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.sponsorModel.countDocuments(query),
    ]);

    return {
      sponsors,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getActiveSponsors(): Promise<Sponsor[]> {
    const now = new Date();
    
    const sponsors = await this.sponsorModel
      .find({
        isActive: true,
        startDate: { $lte: now },
        $or: [
          { endDate: { $exists: false } },
          { endDate: null },
          { endDate: { $gte: now } },
        ],
      })
      .sort({ order: 1 })
      .lean();

    return sponsors;
  }

  async getSponsorById(sponsorId: string): Promise<Sponsor> {
    const sponsor = await this.sponsorModel
      .findById(sponsorId)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!sponsor) {
      throw new NotFoundException('Sponsor not found');
    }

    return sponsor;
  }

  async updateSponsor(
    sponsorId: string,
    userId: string,
    dto: UpdateSponsorDto,
  ): Promise<Sponsor> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const sponsor = await this.sponsorModel.findById(sponsorId);
    if (!sponsor) {
      throw new NotFoundException('Sponsor not found');
    }

    // Update the sponsor
    Object.assign(sponsor, {
      ...dto,
      updatedBy: new mongoose.Types.ObjectId(userId),
      startDate: dto.startDate ? new Date(dto.startDate) : sponsor.startDate,
      endDate: dto.endDate ? new Date(dto.endDate) : sponsor.endDate,
    });

    await sponsor.save();

    return await this.getSponsorById(sponsorId);
  }

  async deleteSponsor(sponsorId: string, userId: string): Promise<void> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const sponsor = await this.sponsorModel.findById(sponsorId);
    if (!sponsor) {
      throw new NotFoundException('Sponsor not found');
    }

    await this.sponsorModel.findByIdAndDelete(sponsorId);

    // Reorder remaining sponsors
    await this.reorderSponsorsAfterDeletion(sponsor.order);
  }

  async updateSponsorOrder(
    userId: string,
    updates: UpdateSponsorOrderDto[],
  ): Promise<void> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    // Update order for each sponsor
    const updatePromises = updates.map(({ sponsorId, order }) =>
      this.sponsorModel.findByIdAndUpdate(
        sponsorId,
        { order, updatedBy: new mongoose.Types.ObjectId(userId) },
        { new: true },
      ),
    );

    await Promise.all(updatePromises);
  }

  async toggleSponsorStatus(sponsorId: string, userId: string): Promise<Sponsor> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const sponsor = await this.sponsorModel.findById(sponsorId);
    if (!sponsor) {
      throw new NotFoundException('Sponsor not found');
    }

    sponsor.isActive = !sponsor.isActive;
    sponsor.updatedBy = new mongoose.Types.ObjectId(userId);
    await sponsor.save();

    return sponsor;
  }

  private async reorderSponsorsAfterDeletion(deletedOrder: number): Promise<void> {
    await this.sponsorModel.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } },
    );
  }
}
