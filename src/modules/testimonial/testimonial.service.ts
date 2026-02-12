import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import {
  Testimonial,
  TestimonialDocument,
} from '../../infrastructure/database/schemas/testimonial.schema';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
  UpdateTestimonialOrderDto,
} from './dto/testimonial.dto';
import { User, UserDocument } from '../../infrastructure/database/schemas';

import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class TestimonialService {
  private readonly CACHE_TTL = 900; // 15 minutes for testimonials
  
  constructor(
    @InjectModel(Testimonial.name)
    private readonly testimonialModel: Model<TestimonialDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly redisService: RedisService,
  ) {}

  async createTestimonial(
    userId: string,
    dto: CreateTestimonialDto,
  ): Promise<Testimonial> {
    // Set order to last if not provided (check for undefined/null, not falsy)
    if (dto.order === undefined || dto.order === null) {
      const lastTestimonial = await this.testimonialModel
        .findOne()
        .sort({ order: -1 });
      dto.order = lastTestimonial ? lastTestimonial.order + 1 : 0;
    }

    const testimonial = await this.testimonialModel.create({
      ...dto,
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    // Invalidate cache to include new testimonial
    this.invalidateTestimonialCache();

    return testimonial;
  }

  async getAllTestimonials(
    page: number = 1,
    limit: number = 10,
    isActive?: boolean,
  ) {
    const query: any = {};
    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    const [testimonials, total] = await Promise.all([
      this.testimonialModel
        .find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.testimonialModel.countDocuments(query),
    ]);

    return {
      testimonials,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getActiveTestimonials(): Promise<Testimonial[]> {
    const cacheKey = 'testimonials:active';
    
    // Try cache first
    const cached = await this.redisService.get<Testimonial[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Cache miss - query database
    const testimonials = await this.testimonialModel
      .find({
        isActive: true,
      })
      .sort({ order: 1 })
      .lean();
    
    // Store in cache
    await this.redisService.set(cacheKey, testimonials, this.CACHE_TTL);

    return testimonials;
  }
  
  // Helper to invalidate cache (call after updates)
  // Non-blocking with error handling to prevent cache failures from affecting responses
  private invalidateTestimonialCache() {
    this.redisService.del('testimonials:active').catch((err) => {
      console.error(`Failed to invalidate testimonial cache: ${err.message}`);
    });
  }

  async getTestimonialById(testimonialId: string): Promise<Testimonial> {
    const testimonial = await this.testimonialModel
      .findById(testimonialId)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!testimonial) {
      throw new NotFoundException('Testimonial not found');
    }

    return testimonial;
  }

  async updateTestimonial(
    testimonialId: string,
    userId: string,
    dto: UpdateTestimonialDto,
  ): Promise<Testimonial> {
    const testimonial = await this.testimonialModel.findById(testimonialId);
    if (!testimonial) {
      throw new NotFoundException('Testimonial not found');
    }

    Object.assign(testimonial, {
      ...dto,
      updatedBy: new mongoose.Types.ObjectId(userId),
    });

    await testimonial.save();

    // Invalidate cache after update
    this.invalidateTestimonialCache();

    return await this.getTestimonialById(testimonialId);
  }

  async deleteTestimonial(testimonialId: string, userId: string): Promise<void> {
    const testimonial = await this.testimonialModel.findById(testimonialId);
    if (!testimonial) {
      throw new NotFoundException('Testimonial not found');
    }

    await this.testimonialModel.findByIdAndDelete(testimonialId);

    // Reorder remaining testimonials
    await this.reorderTestimonialsAfterDeletion(testimonial.order);

    // Invalidate cache after deletion
    this.invalidateTestimonialCache();
  }

  async updateTestimonialOrder(
    userId: string,
    updates: UpdateTestimonialOrderDto[],
  ): Promise<void> {
    const updatePromises = updates.map(({ testimonialId, order }) =>
      this.testimonialModel.findByIdAndUpdate(
        testimonialId,
        { order, updatedBy: new mongoose.Types.ObjectId(userId) },
        { new: true },
      ),
    );

    await Promise.all(updatePromises);

    // Invalidate cache after reordering
    this.invalidateTestimonialCache();
  }

  async toggleTestimonialStatus(testimonialId: string, userId: string): Promise<Testimonial> {
    const testimonial = await this.testimonialModel.findById(testimonialId);
    if (!testimonial) {
      throw new NotFoundException('Testimonial not found');
    }

    testimonial.isActive = !testimonial.isActive;
    testimonial.updatedBy = new mongoose.Types.ObjectId(userId);
    await testimonial.save();

    // Invalidate cache after status toggle
    this.invalidateTestimonialCache();

    return testimonial;
  }

  private async reorderTestimonialsAfterDeletion(deletedOrder: number): Promise<void> {
    await this.testimonialModel.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } },
    );
  }
}
