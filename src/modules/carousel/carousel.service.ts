import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CarouselSlide,
  CarouselSlideDocument,
} from '../../infrastructure/database/schemas/carousel-slide.schema';
import {
  CreateCarouselSlideDto,
  UpdateCarouselSlideDto,
  UpdateSlideOrderDto,
} from './dto/carousel-slide.dto';
import { User, UserDocument } from '../../infrastructure/database/schemas';

@Injectable()
export class CarouselService {
  constructor(
    @InjectModel(CarouselSlide.name)
    private readonly carouselSlideModel: Model<CarouselSlideDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createSlide(
    userId: string,
    dto: CreateCarouselSlideDto,
  ): Promise<CarouselSlide> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    // Set order to last if not provided
    if (!dto.order) {
      const lastSlide = await this.carouselSlideModel
        .findOne()
        .sort({ order: -1 });
      dto.order = lastSlide ? lastSlide.order + 1 : 1;
    }

    const slide = await this.carouselSlideModel.create({
      ...dto,
      createdBy: userId,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    return slide;
  }

  async getAllSlides(
    page: number = 1,
    limit: number = 10,
    isActive?: boolean,
  ) {
    const query: any = {};
    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    // Add date filtering for active slides
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

    const [slides, total] = await Promise.all([
      this.carouselSlideModel
        .find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.carouselSlideModel.countDocuments(query),
    ]);

    return {
      slides,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getActiveSlides(): Promise<CarouselSlide[]> {
    const now = new Date();
    
    const slides = await this.carouselSlideModel
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

    return slides;
  }

  async getSlideById(slideId: string): Promise<CarouselSlide> {
    const slide = await this.carouselSlideModel
      .findById(slideId)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!slide) {
      throw new NotFoundException('Carousel slide not found');
    }

    return slide;
  }

  async updateSlide(
    slideId: string,
    userId: string,
    dto: UpdateCarouselSlideDto,
  ): Promise<CarouselSlide> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const slide = await this.carouselSlideModel.findById(slideId);
    if (!slide) {
      throw new NotFoundException('Carousel slide not found');
    }

    // Update the slide
    Object.assign(slide, {
      ...dto,
      updatedBy: userId,
      startDate: dto.startDate ? new Date(dto.startDate) : slide.startDate,
      endDate: dto.endDate ? new Date(dto.endDate) : slide.endDate,
    });

    await slide.save();

    return await this.getSlideById(slideId);
  }

  async deleteSlide(slideId: string, userId: string): Promise<void> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const slide = await this.carouselSlideModel.findById(slideId);
    if (!slide) {
      throw new NotFoundException('Carousel slide not found');
    }

    await this.carouselSlideModel.findByIdAndDelete(slideId);

    // Reorder remaining slides
    await this.reorderSlidesAfterDeletion(slide.order);
  }

  async updateSlideOrder(
    userId: string,
    updates: UpdateSlideOrderDto[],
  ): Promise<void> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    // Update order for each slide
    const updatePromises = updates.map(({ slideId, order }) =>
      this.carouselSlideModel.findByIdAndUpdate(
        slideId,
        { order, updatedBy: userId },
        { new: true },
      ),
    );

    await Promise.all(updatePromises);
  }

  async toggleSlideStatus(
    slideId: string,
    userId: string,
  ): Promise<CarouselSlide> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const slide = await this.carouselSlideModel.findById(slideId);
    if (!slide) {
      throw new NotFoundException('Carousel slide not found');
    }

    slide.isActive = !slide.isActive;
    slide.updatedBy = userId;
    await slide.save();

    return await this.getSlideById(slideId);
  }

  private async reorderSlidesAfterDeletion(deletedOrder: number): Promise<void> {
    // Move all slides with order greater than deleted slide's order down by 1
    await this.carouselSlideModel.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } },
    );
  }

  async duplicateSlide(
    slideId: string,
    userId: string,
  ): Promise<CarouselSlide> {
    // For now, skip user verification - TODO: implement proper auth
    // const user = await this.userModel.findById(userId);
    // if (!user || !['admin', 'super_admin'].includes(user.role)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    const originalSlide = await this.carouselSlideModel.findById(slideId);
    if (!originalSlide) {
      throw new NotFoundException('Carousel slide not found');
    }

    // Get the last order number
    const lastSlide = await this.carouselSlideModel
      .findOne()
      .sort({ order: -1 });

    const newOrder = lastSlide ? lastSlide.order + 1 : 1;

    // Create duplicate
    const duplicatedSlide = await this.carouselSlideModel.create({
      title: `${originalSlide.title} (Copy)`,
      titleHighlight: originalSlide.titleHighlight,
      subtitle: originalSlide.subtitle,
      image: originalSlide.image,
      ctaText: originalSlide.ctaText,
      ctaLink: originalSlide.ctaLink,
      category: originalSlide.category,
      order: newOrder,
      isActive: false, // Set as inactive by default
      isFeatured: false,
      altText: originalSlide.altText,
      description: originalSlide.description,
      startDate: new Date(),
      createdBy: userId,
    });

    return duplicatedSlide;
  }
}