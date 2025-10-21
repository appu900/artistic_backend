import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SeatLayout, SeatLayoutDocument } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { UpdateVenueLayoutDto } from './dto/update-venue-layout.dto';

@Injectable()
export class VenueLayoutService {
  constructor(
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
  ) {}

  async create(createVenueLayoutDto: CreateVenueLayoutDto): Promise<SeatLayout> {
    const layout = new this.seatLayoutModel(createVenueLayoutDto);
    return await layout.save();
  }

  async findAll(query?: { venueOwnerId?: string; eventId?: string }): Promise<SeatLayout[]> {
    const filter: any = {};
    
    if (query?.venueOwnerId) {
      filter.venueOwnerId = new Types.ObjectId(query.venueOwnerId);
    }
    
    if (query?.eventId) {
      filter.eventId = new Types.ObjectId(query.eventId);
    }

    return await this.seatLayoutModel
      .find(filter)
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const layout = await this.seatLayoutModel
      .findById(id)
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    return layout;
  }

  async update(id: string, updateVenueLayoutDto: UpdateVenueLayoutDto): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const layout = await this.seatLayoutModel
      .findByIdAndUpdate(id, updateVenueLayoutDto, { new: true })
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    return layout;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const result = await this.seatLayoutModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException('Venue layout not found');
    }

    return { message: 'Venue layout deleted successfully' };
  }

  async toggleActive(id: string): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const layout = await this.seatLayoutModel.findById(id).exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    layout.isActive = !layout.isActive;
    return await layout.save();
  }

  async getSeatAvailability(layoutId: string): Promise<{
    totalSeats: number;
    bookedSeats: number;
    availableSeats: number;
    categoryCounts: { [categoryName: string]: { total: number; available: number; price: number } };
  }> {
    const layout = await this.findOne(layoutId);

    const seats = layout.items.filter(item => item.type === 'seat');
    const totalSeats = seats.length;

    // Initialize category counts
    const categoryCounts: { [categoryName: string]: { total: number; available: number; price: number } } = {};
    
    layout.categories.forEach(cat => {
      categoryCounts[cat.name] = {
        total: 0,
        available: 0,
        price: cat.price,
      };
    });

    // Count seats by category
    seats.forEach(seat => {
      const category = layout.categories.find(c => c.id === seat.categoryId);
      if (category) {
        categoryCounts[category.name].total++;
        categoryCounts[category.name].available++; // For now, all are available. Will be updated with booking logic
      }
    });

    return {
      totalSeats,
      bookedSeats: 0, // Will be updated with booking logic
      availableSeats: totalSeats,
      categoryCounts,
    };
  }

  async duplicateLayout(id: string, newName?: string): Promise<SeatLayout> {
    const existingLayout = await this.findOne(id);

    const duplicatedLayout = new this.seatLayoutModel({
      name: newName || `${existingLayout.name} (Copy)`,
      venueOwnerId: existingLayout.venueOwnerId,
      items: existingLayout.items,
      categories: existingLayout.categories,
      canvasW: existingLayout.canvasW,
      canvasH: existingLayout.canvasH,
      isActive: false,
    });

    return await duplicatedLayout.save();
  }
}
