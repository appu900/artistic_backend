import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SeatLayout, SeatLayoutDocument, SeatStatus } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';

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
    const filter: any = { isDeleted: { $ne: true } };
    
    if (query?.venueOwnerId) {
      filter.venueOwnerId = new Types.ObjectId(query.venueOwnerId);
    }
    
    if (query?.eventId) {
      filter.eventId = new Types.ObjectId(query.eventId);
    }

    return await this.seatLayoutModel
      .find(filter)
      .select('-seats -items') // Don't load seat/item data for list views
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .sort({ createdAt: -1 })
      .lean() // Use lean for better performance
      .exec();
  }

  async findOne(id: string): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const layout = await this.seatLayoutModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    return layout;
  }

  async update(id: string, updateVenueLayoutDto: CreateVenueLayoutDto): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    // Increment version for optimistic locking
    const layout = await this.seatLayoutModel
      .findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { 
          ...updateVenueLayoutDto,
          $inc: { version: 1 }
        },
        { new: true }
      )
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    return layout;
  }

  async remove(id: string): Promise<{ message: string }> {
    // Use soft delete instead of hard delete
    return this.softDelete(id);
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

    // Use the new seats array instead of filtering items
    const seats = layout.seats || [];
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

    let bookedSeats = 0;
    let availableSeats = 0;

    // Count seats by category and status
    seats.forEach((seat: any) => {
      const category = layout.categories.find(c => c.id === seat.catId);
      if (category) {
        categoryCounts[category.name].total++;
        if (seat.status === SeatStatus.AVAILABLE) {
          categoryCounts[category.name].available++;
          availableSeats++;
        } else if (seat.status === SeatStatus.BOOKED) {
          bookedSeats++;
        }
      }
    });

    return {
      totalSeats,
      bookedSeats,
      availableSeats,
      categoryCounts,
    };
  }

  async duplicateLayout(id: string, newName?: string): Promise<SeatLayout> {
    const existingLayout = await this.findOne(id);

    const duplicatedLayout = new this.seatLayoutModel({
      name: newName || `${existingLayout.name} (Copy)`,
      venueOwnerId: existingLayout.venueOwnerId,
      seats: existingLayout.seats,
      items: existingLayout.items,
      categories: existingLayout.categories,
      canvasW: existingLayout.canvasW,
      canvasH: existingLayout.canvasH,
      isActive: false,
    });

    return await duplicatedLayout.save();
  }

  // Enhanced methods for large venue support
  async findByViewport(
    id: string,
    viewport: { x: number; y: number; width: number; height: number }
  ): Promise<Partial<SeatLayout>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const result = await (this.seatLayoutModel as any).findByViewport(id, viewport);
    
    if (!result || result.length === 0) {
      throw new NotFoundException('Venue layout not found');
    }

    return result[0];
  }

  async updateSeatStatuses(
    layoutId: string,
    seatUpdates: Array<{ seatId: string; status: SeatStatus }>
  ): Promise<{ success: boolean; updatedCount: number }> {
    if (!Types.ObjectId.isValid(layoutId)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const result = await (this.seatLayoutModel as any).updateSeatStatuses(layoutId, seatUpdates);
    
    return {
      success: result.acknowledged,
      updatedCount: result.modifiedCount
    };
  }

  async bulkUpdateSeats(
    layoutId: string,
    seatIds: string[],
    updates: any
  ): Promise<{ success: boolean; updatedCount: number }> {
    if (!Types.ObjectId.isValid(layoutId)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const bulkOps = seatIds.map(seatId => ({
      updateOne: {
        filter: { 
          _id: new Types.ObjectId(layoutId), 
          'seats.id': seatId 
        },
        update: { 
          $set: Object.entries(updates).reduce((acc, [key, value]) => {
            acc[`seats.$.${key}`] = value;
            return acc;
          }, {} as any)
        }
      }
    }));

    const result = await this.seatLayoutModel.bulkWrite(bulkOps);

    return {
      success: result.ok === 1,
      updatedCount: result.modifiedCount
    };
  }

  async getLayoutStats(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const layout = await this.seatLayoutModel
      .findOne({ _id: id, isDeleted: false })
      .select('stats categories')
      .lean()
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    return layout.stats;
  }

  async softDelete(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    const result = await this.seatLayoutModel
      .findByIdAndUpdate(
        id,
        { 
          isDeleted: true,
          deletedAt: new Date()
        },
        { new: true }
      )
      .exec();

    if (!result) {
      throw new NotFoundException('Venue layout not found');
    }

    return { message: 'Venue layout deleted successfully' };
  }
}
