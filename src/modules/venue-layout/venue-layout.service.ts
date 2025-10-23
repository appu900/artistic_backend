import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SeatLayout, SeatLayoutDocument } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { SeatState, SeatStateDocument, SeatStatus } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';
import { SeatLockService } from '../../infrastructure/redis/seat-lock.service';
import { VenueOwnerProfile, VenueOwnerProfileDocument } from '../../infrastructure/database/schemas/venue-owner-profile.schema';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { 
  CreateSeatStateDto, 
  UpdateSeatStateDto, 
  BulkSeatStateUpdatesDto,
  SeatAvailabilityQueryDto,
  InitializeEventSeatsDto 
} from './dto/seat-state.dto';

@Injectable()
export class VenueLayoutService {
  constructor(
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    @InjectModel(SeatState.name)
    private seatStateModel: Model<SeatStateDocument>,
    @InjectModel(VenueOwnerProfile.name)
    private venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
    private seatLockService: SeatLockService,
  ) {}

  async create(createVenueLayoutDto: CreateVenueLayoutDto): Promise<SeatLayout> {
    // Validate venueOwnerId if provided
    if (createVenueLayoutDto.venueOwnerId) {
      if (!Types.ObjectId.isValid(createVenueLayoutDto.venueOwnerId)) {
        throw new BadRequestException('Invalid venueOwnerId');
      }
      const owner = await this.venueOwnerProfileModel.findById(createVenueLayoutDto.venueOwnerId).select('_id');
      if (!owner) {
        throw new NotFoundException('Venue owner not found');
      }
    }

    // Set default ownerCanEdit to true if not explicitly set (allows venue owners to edit their own layouts by default)
    if (createVenueLayoutDto.ownerCanEdit === undefined) {
      createVenueLayoutDto.ownerCanEdit = true;
    }

    const layout = new this.seatLayoutModel(createVenueLayoutDto);
    const saved = await layout.save();

    // Link to venue owner profile (denormalized reference for fast listing)
    if (saved.venueOwnerId) {
      await this.venueOwnerProfileModel.updateOne(
        { _id: saved.venueOwnerId },
        { $addToSet: { layouts: saved._id } }
      );
    }

    return saved;
  }

  async findAll(query?: { venueOwnerId?: string; eventId?: string }): Promise<SeatLayout[]> {
    const filter: any = { isDeleted: { $ne: true } };
    
    if (query?.venueOwnerId) {
      // Add better validation and logging
      console.log('Received venueOwnerId:', query.venueOwnerId, 'Type:', typeof query.venueOwnerId);
      
      if (!query.venueOwnerId || query.venueOwnerId.trim() === '') {
        throw new BadRequestException('venueOwnerId cannot be empty');
      }
      
      if (!Types.ObjectId.isValid(query.venueOwnerId)) {
        console.error('Invalid venueOwnerId format:', query.venueOwnerId);
        throw new BadRequestException(`Invalid venueOwnerId format: ${query.venueOwnerId}`);
      }
      
      // First check if this ID directly matches a layout's venueOwnerId
      const venueOwnerObjectId = new Types.ObjectId(query.venueOwnerId);
      filter.venueOwnerId = venueOwnerObjectId;
    }
    
    if (query?.eventId) {
      if (!Types.ObjectId.isValid(query.eventId)) {
        throw new BadRequestException('Invalid eventId');
      }
      filter.eventId = new Types.ObjectId(query.eventId);
    }

    console.log('Venue layout filter:', filter);

    const layouts = await this.seatLayoutModel
      .find(filter)
      .select('-seats -items') // Don't load seat/item data for list views
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .sort({ createdAt: -1 })
      .lean() // Use lean for better performance
      .exec();

    console.log(`Found ${layouts.length} layouts matching filter`);

    // If no results and we have a venueOwnerId, try to find layouts where 
    // the venueOwnerId points to a User, but we need the Profile
    if (layouts.length === 0 && query?.venueOwnerId) {
      console.log(`No direct layouts found for venueOwnerId ${query.venueOwnerId}, checking if this is a profile with layouts array...`);
      
      // Check if this is a VenueOwnerProfile with a layouts array
      const profile = await this.venueOwnerProfileModel
        .findById(query.venueOwnerId)
        .populate('layouts')
        .lean();
      
      if (profile && profile.layouts && profile.layouts.length > 0) {
        console.log(`Found ${profile.layouts.length} layouts in profile's layouts array`);
        
        // Get the actual layout documents
        const layoutIds = profile.layouts.map((l: any) => l._id || l);
        const profileLayouts = await this.seatLayoutModel
          .find({ 
            _id: { $in: layoutIds },
            isDeleted: { $ne: true }
          })
          .select('-seats -items')
          .populate('venueOwnerId', 'address category')
          .populate('eventId', 'name')
          .sort({ createdAt: -1 })
          .lean()
          .exec();
          
        return profileLayouts;
      } else {
        console.log('No layouts found in profile array either');
      }
    }

    return layouts;
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

  async checkOwnerEditPermission(layoutId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(layoutId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }

    // Get the layout
    const layout = await this.seatLayoutModel.findById(layoutId).select('venueOwnerId ownerCanEdit').lean();
    if (!layout) {
      return false;
    }

    // If admin explicitly disabled owner editing
    if (layout.ownerCanEdit === false) {
      return false;
    }

    // Check if the user owns this layout by checking if their profile ID matches the layout's venueOwnerId
    const userProfile = await this.venueOwnerProfileModel.findOne({ user: new Types.ObjectId(userId) }).select('_id').lean();
    if (!userProfile) {
      return false;
    }

    // Check if the layout's venueOwnerId matches the user's profile ID
    return layout.venueOwnerId?.toString() === userProfile._id.toString();
  }

  async getVenueOwnerProfileByUserId(userId: string): Promise<any> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }
    
    return this.venueOwnerProfileModel.findOne({ user: new Types.ObjectId(userId) }).lean();
  }

  async update(id: string, updateVenueLayoutDto: CreateVenueLayoutDto): Promise<SeatLayout> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid layout ID');
    }

    // Validate target venue owner if provided
    if (updateVenueLayoutDto.venueOwnerId && !Types.ObjectId.isValid(updateVenueLayoutDto.venueOwnerId)) {
      throw new BadRequestException('Invalid venueOwnerId');
    }

    const existing = await this.seatLayoutModel.findById(id).select('venueOwnerId');

    const layout = await this.seatLayoutModel
      .findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { 
          ...updateVenueLayoutDto
        },
        { new: true }
      )
      .populate('venueOwnerId', 'address category')
      .populate('eventId', 'name')
      .exec();

    if (!layout) {
      throw new NotFoundException('Venue layout not found');
    }

    // If venue owner changed, update linkage arrays
    const prevOwnerId = existing?.venueOwnerId as any as Types.ObjectId | undefined;
    const newOwnerId = (layout.venueOwnerId as any) as Types.ObjectId | undefined;
    if ((prevOwnerId?.toString() || null) !== (newOwnerId?.toString() || null)) {
      if (prevOwnerId) {
        await this.venueOwnerProfileModel.updateOne(
          { _id: prevOwnerId },
          { $pull: { layouts: layout._id } }
        );
      }
      if (newOwnerId) {
        await this.venueOwnerProfileModel.updateOne(
          { _id: newOwnerId },
          { $addToSet: { layouts: layout._id } }
        );
      }
    }

    return layout;
  }

  async remove(id: string): Promise<{ message: string }> {
    // Use soft delete instead of hard delete
    return this.softDelete(id);
  }

  // toggleActive removed - isActive is now event-specific, not layout-specific

  async getSeatAvailability(layoutId: string, eventId?: string): Promise<{
    totalSeats: number;
    bookedSeats: number;
    availableSeats: number;
    heldSeats: number;
    categoryCounts: { [categoryName: string]: { total: number; available: number; booked: number; held: number; price: number } };
  }> {
    const layout = await this.findOne(layoutId);

    // Get seat counts from layout (static)
    const seats = layout.seats || [];
    const totalSeats = seats.length;

    // Initialize category counts from layout
    const categoryCounts: { [categoryName: string]: { 
      total: number; 
      available: number; 
      booked: number; 
      held: number; 
      price: number 
    } } = {};
    
    layout.categories.forEach(cat => {
      categoryCounts[cat.name] = {
        total: 0,
        available: 0,
        booked: 0,
        held: 0,
        price: cat.price
      };
    });

    // Count total seats by category from layout
    seats.forEach((seat: any) => {
      const category = layout.categories.find(c => c.id === seat.catId);
      if (category) {
        categoryCounts[category.name].total++;
      }
    });

    let bookedSeats = 0;
    let heldSeats = 0;
    let availableSeats = totalSeats; // Start with all seats available

    // If eventId provided, get actual seat states
    if (eventId) {
      const seatStates = await this.seatStateModel.find({
        layoutId: new Types.ObjectId(layoutId),
        eventId: new Types.ObjectId(eventId)
      }).lean();

      // Reset available count since we're getting real data
      availableSeats = 0;

      // Map of seatId to current status
      const seatStatusMap = new Map<string, SeatStatus>();
      seatStates.forEach(state => {
        seatStatusMap.set(state.seatId, state.status);
      });

      // Count by actual status
      seats.forEach((seat: any) => {
        const category = layout.categories.find(c => c.id === seat.catId);
        if (category) {
          const status = seatStatusMap.get(seat.id) || SeatStatus.AVAILABLE;
          
          switch (status) {
            case SeatStatus.AVAILABLE:
              categoryCounts[category.name].available++;
              availableSeats++;
              break;
            case SeatStatus.BOOKED:
              categoryCounts[category.name].booked++;
              bookedSeats++;
              break;
            case SeatStatus.HELD:
              categoryCounts[category.name].held++;
              heldSeats++;
              break;
          }
        }
      });
    } else {
      // No event specified, all seats are available by default
      layout.categories.forEach(cat => {
        categoryCounts[cat.name].available = categoryCounts[cat.name].total;
      });
    }

    return {
      totalSeats,
      bookedSeats,
      availableSeats,
      heldSeats,
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
      ownerCanEdit: existingLayout.ownerCanEdit, // Preserve the owner edit permission
    });

    const saved = await duplicatedLayout.save();

    if (saved.venueOwnerId) {
      await this.venueOwnerProfileModel.updateOne(
        { _id: saved.venueOwnerId },
        { $addToSet: { layouts: saved._id } }
      );
    }

    return saved;
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

  // getLayoutStats replaced by getSeatAvailability with eventId parameter

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

    // Unlink from venue owner profile if present
    if (result.venueOwnerId) {
      await this.venueOwnerProfileModel.updateOne(
        { _id: result.venueOwnerId },
        { $pull: { layouts: result._id } }
      );
    }

    return { message: 'Venue layout deleted successfully' };
  }


  // Seat State Management Methods


  /**
   * Initialize seat states for an event based on a layout
   * This creates SeatState records for all seats in the layout
   */
  async initializeEventSeats(dto: InitializeEventSeatsDto): Promise<{
    success: boolean;
    initializedCount: number;
    totalSeats: number;
  }> {
    const layout = await this.findOne(dto.layoutId);
    
    let seatsToInitialize = layout.seats;
    if (dto.seatIds && dto.seatIds.length > 0) {
      seatsToInitialize = layout.seats.filter(seat => dto.seatIds!.includes(seat.id));
    }

    try {
      const result = await (this.seatStateModel as any).initializeEventSeats(
        dto.layoutId,
        dto.eventId,
        seatsToInitialize
      );

      return {
        success: true,
        initializedCount: result.length || seatsToInitialize.length,
        totalSeats: layout.seats.length
      };
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
        return {
          success: true,
          initializedCount: 0, // Already initialized
          totalSeats: layout.seats.length
        };
      }
      throw error;
    }
  }

  /**
   * Get seat availability for an event with filtering options
   */
  async getSeatAvailabilityForEvent(query: SeatAvailabilityQueryDto): Promise<{
    eventId: string;
    totalSeats: number;
    availableSeats: SeatState[];
    bookedSeats: SeatState[];
    heldSeats: SeatState[];
    stats: { available: number; booked: number; held: number; reserved: number; blocked: number };
  }> {
    const filter: any = { eventId: new Types.ObjectId(query.eventId) };
    
    if (query.seatIds && query.seatIds.length > 0) {
      filter.seatId = { $in: query.seatIds };
    }
    
    if (query.status) {
      filter.status = query.status;
    }

    const seatStates = await this.seatStateModel.find(filter).lean();
    
    // Group by status
    const availableSeats = seatStates.filter(s => s.status === SeatStatus.AVAILABLE);
    const bookedSeats = seatStates.filter(s => s.status === SeatStatus.BOOKED);
    const heldSeats = seatStates.filter(s => s.status === SeatStatus.HELD);
    const reservedSeats = seatStates.filter(s => s.status === SeatStatus.RESERVED);
    const blockedSeats = seatStates.filter(s => s.status === SeatStatus.BLOCKED);

    return {
      eventId: query.eventId,
      totalSeats: seatStates.length,
      availableSeats,
      bookedSeats,
      heldSeats,
      stats: {
        available: availableSeats.length,
        booked: bookedSeats.length,
        held: heldSeats.length,
        reserved: reservedSeats.length,
        blocked: blockedSeats.length
      }
    };
  }

  /**
   * Bulk update seat statuses for an event
   * Works with SeatState collection for better performance
   */
  async bulkUpdateSeatStates(
    eventId: string,
    updates: BulkSeatStateUpdatesDto
  ): Promise<{ success: boolean; updatedCount: number; errors: string[] }> {
    try {
      const result = await (this.seatStateModel as any).bulkUpdateStatus(
        eventId,
        updates.updates
      );

      return {
        success: result.ok === 1,
        updatedCount: result.modifiedCount,
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        updatedCount: 0,
        errors: [error.message]
      };
    }
  }

  // Redis Seat Locking Integration


  /**
   * Lock seats for a user during booking process
   * Uses Redis for atomic operations and fast response times
   */
  async lockSeatsForBooking(
    eventId: string,
    seatIds: string[],
    userId: string,
    lockDurationMinutes: number = 10
  ): Promise<{
    success: boolean;
    lockedSeats: string[];
    failedSeats: string[];
    alreadyHeldByUser: string[];
    lockDuration: number;
  }> {
    // First check if seats are available in MongoDB
    const unavailableSeats = await this.seatStateModel.find({
      eventId: new Types.ObjectId(eventId),
      seatId: { $in: seatIds },
      status: { $in: [SeatStatus.BOOKED, SeatStatus.RESERVED, SeatStatus.BLOCKED] }
    }).distinct('seatId');

    const availableForLocking = seatIds.filter(id => !unavailableSeats.includes(id));
    
    if (availableForLocking.length === 0) {
      return {
        success: false,
        lockedSeats: [],
        failedSeats: seatIds,
        alreadyHeldByUser: [],
        lockDuration: 0
      };
    }

    // Try to lock available seats in Redis
    const lockResult = await this.seatLockService.lockSeats(
      eventId,
      availableForLocking,
      userId,
      lockDurationMinutes
    );

    // Update seat states to HELD for successfully locked seats
    if (lockResult.lockedSeats.length > 0) {
      await this.seatStateModel.updateMany(
        {
          eventId: new Types.ObjectId(eventId),
          seatId: { $in: lockResult.lockedSeats },
          status: SeatStatus.AVAILABLE
        },
        {
          $set: {
            status: SeatStatus.HELD,
            heldBy: new Types.ObjectId(userId),
            holdExpiresAt: new Date(Date.now() + lockDurationMinutes * 60 * 1000)
          }
        }
      );
    }

    // Add permanently unavailable seats to failed list
    const allFailedSeats = [...lockResult.failedSeats, ...unavailableSeats];

    return {
      ...lockResult,
      failedSeats: allFailedSeats
    };
  }

  /**
   * Release seat locks (both Redis and MongoDB)
   */
  async releaseSeatsFromBooking(
    eventId: string,
    seatIds: string[],
    userId: string
  ): Promise<{ success: boolean; releasedCount: number }> {
    // Release Redis locks
    const redisResult = await this.seatLockService.releaseSeats(eventId, seatIds, userId);
    
    // Update MongoDB seat states back to AVAILABLE
    const mongoResult = await this.seatStateModel.updateMany(
      {
        eventId: new Types.ObjectId(eventId),
        seatId: { $in: seatIds },
        heldBy: new Types.ObjectId(userId),
        status: SeatStatus.HELD
      },
      {
        $set: { status: SeatStatus.AVAILABLE },
        $unset: { heldBy: 1, holdExpiresAt: 1 }
      }
    );

    return {
      success: redisResult.success && mongoResult.modifiedCount >= 0,
      releasedCount: Math.max(redisResult.releasedCount, mongoResult.modifiedCount)
    };
  }

  /**
   * Confirm booking - convert held seats to booked
   */
  async confirmSeatBooking(
    eventId: string,
    seatIds: string[],
    userId: string,
    bookingId: string,
    bookedPrices?: Record<string, number>
  ): Promise<{ success: boolean; bookedCount: number }> {
    // Release Redis locks first
    await this.seatLockService.releaseSeats(eventId, seatIds, userId);

    // Update seat states to BOOKED
    const updateData: any = {
      status: SeatStatus.BOOKED,
      bookedBy: new Types.ObjectId(userId),
      bookingId: new Types.ObjectId(bookingId),
      bookedAt: new Date()
    };

    // Clear hold data
    const unsetData = {
      heldBy: 1,
      holdExpiresAt: 1,
      holdReason: 1
    };

    let bookedCount = 0;

    // Update each seat individually to set specific prices if provided
    for (const seatId of seatIds) {
      const seatUpdateData = { ...updateData };
      if (bookedPrices && bookedPrices[seatId]) {
        seatUpdateData.bookedPrice = bookedPrices[seatId];
      }

      const result = await this.seatStateModel.updateOne(
        {
          eventId: new Types.ObjectId(eventId),
          seatId: seatId,
          heldBy: new Types.ObjectId(userId),
          status: SeatStatus.HELD
        },
        {
          $set: seatUpdateData,
          $unset: unsetData
        }
      );

      if (result.modifiedCount > 0) {
        bookedCount++;
      }
    }

    return {
      success: bookedCount === seatIds.length,
      bookedCount
    };
  }

  /**
   * Check seat lock status from Redis
   */
  async checkSeatLocks(eventId: string, seatIds: string[]): Promise<any> {
    return this.seatLockService.checkSeatLocks(eventId, seatIds);
  }

  /**
   * Extend seat locks for a user
   */
  async extendSeatLocks(
    eventId: string,
    seatIds: string[],
    userId: string,
    additionalMinutes: number = 5
  ): Promise<any> {
    return this.seatLockService.extendLocks(eventId, seatIds, userId, additionalMinutes);
  }

  /**
   * Get lock statistics for an event
   */
  async getSeatLockStats(eventId: string): Promise<any> {
    return this.seatLockService.getLockStats(eventId);
  }

  /**
   * Debug method to inspect venue owner data relationships
   */
  async debugVenueOwnerData(venueOwnerId: string): Promise<any> {
    if (!Types.ObjectId.isValid(venueOwnerId)) {
      throw new BadRequestException('Invalid venueOwnerId');
    }

    const profile = await this.venueOwnerProfileModel.findById(venueOwnerId).lean();
    const layoutsByVenueOwnerId = await this.seatLayoutModel
      .find({ venueOwnerId: new Types.ObjectId(venueOwnerId) })
      .select('_id name venueOwnerId createdAt')
      .lean();
    
    // Also check if this might be a user ID
    const profileByUser = await this.venueOwnerProfileModel.findOne({ user: new Types.ObjectId(venueOwnerId) }).lean();
    let layoutsByUserAsOwner: any[] = [];
    if (profileByUser) {
      layoutsByUserAsOwner = await this.seatLayoutModel
        .find({ venueOwnerId: new Types.ObjectId(venueOwnerId) })
        .select('_id name venueOwnerId createdAt')
        .lean();
    }

    return {
      query: { venueOwnerId },
      profile,
      profileByUser,
      layoutsByVenueOwnerId,
      layoutsByUserAsOwner,
      summary: {
        profileExists: !!profile,
        profileByUserExists: !!profileByUser,
        directLayoutsCount: layoutsByVenueOwnerId.length,
        userAsOwnerLayoutsCount: layoutsByUserAsOwner.length,
        profileHasLayoutsArray: profile?.layouts?.length || 0
      }
    };
  }
}
