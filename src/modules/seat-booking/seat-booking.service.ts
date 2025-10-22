import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { SeatLayout, SeatLayoutDocument } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { SeatState, SeatStateDocument, SeatStatus, SeatHoldReason } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';
import { SeatBooking, SeatBookingDocument, BookingStatus, PaymentStatus } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { LUA_SCRIPTS } from '../../infrastructure/redis/lua-scripts/seat-booking.scripts';

export interface HoldSeatsRequest {
  eventId: string;
  seatIds: string[];
  userId: string;
  holdDurationMinutes?: number;
  reason?: SeatHoldReason;
}

export interface HoldTableRequest {
  eventId: string;
  tableId: string;
  userId: string;
  holdDurationMinutes?: number;
  reason?: SeatHoldReason;
}

export interface ConfirmBookingRequest {
  eventId: string;
  userId: string;
  seatIds?: string[];
  tableIds?: string[];
  contactInfo: {
    name: string;
    email: string;
    phone?: string;
  };
  paymentInfo?: {
    method: string;
    transactionId?: string;
    gateway?: string;
  };
  notes?: string;
  specialRequests?: string;
}

export interface BookingResponse {
  success: boolean;
  bookingId?: string;
  message: string;
  heldSeats?: string[];
  conflictingSeats?: string[];
  totalAmount?: number;
}

/**
 * Real-time Seat Booking Service
 * 
 * Provides atomic seat booking operations using Redis for locking
 * and MongoDB for persistent state. Prevents race conditions and
 * ensures data consistency across high-concurrency scenarios.
 * 
 * Key Features:
 * - Atomic multi-seat locking with Redis Lua scripts
 * - Table booking with automatic seat association
 * - Automatic lock expiration with TTL
 * - Optimistic concurrency control
 * - Comprehensive error handling
 */
@Injectable()
export class SeatBookingService {
  private readonly logger = new Logger(SeatBookingService.name);
  private readonly DEFAULT_HOLD_DURATION = 10; // minutes
  private readonly CONFIRMED_BOOKING_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly MAX_SEATS_PER_BOOKING = 50; // Prevent abuse

  constructor(
    @InjectModel(SeatLayout.name) 
    private seatLayoutModel: Model<SeatLayoutDocument>,
    
    @InjectModel(SeatState.name) 
    private seatStateModel: Model<SeatStateDocument>,
    
    @InjectModel(SeatBooking.name) 
    private seatBookingModel: Model<SeatBookingDocument>,
    
    private redisService: RedisService,
  ) {}

  /**
   * Hold multiple seats atomically
   * Uses Redis Lua script to prevent race conditions
   */
  async holdSeats(request: HoldSeatsRequest): Promise<BookingResponse> {
    const { eventId, seatIds, userId, holdDurationMinutes = this.DEFAULT_HOLD_DURATION, reason } = request;

    try {
      // Validate input
      if (!seatIds || seatIds.length === 0) {
        throw new BadRequestException('At least one seat must be specified');
      }

      if (seatIds.length > this.MAX_SEATS_PER_BOOKING) {
        throw new BadRequestException(`Cannot hold more than ${this.MAX_SEATS_PER_BOOKING} seats at once`);
      }

      // Check if seats exist in the layout and get pricing info
      const layout = await this.seatLayoutModel.findById(eventId).exec();
      if (!layout) {
        throw new BadRequestException('Event layout not found');
      }

      const validSeats = layout.seats.filter(seat => seatIds.includes(seat.id));
      if (validSeats.length !== seatIds.length) {
        const invalidSeats = seatIds.filter(seatId => !validSeats.some(seat => seat.id === seatId));
        throw new BadRequestException(`Invalid seat IDs: ${invalidSeats.join(', ')}`);
      }

      // Create Redis lock keys
      const lockKeys = seatIds.map(seatId => `seat_lock:${eventId}:${seatId}`);
      const holdDurationSeconds = holdDurationMinutes * 60;
      const timestamp = Date.now().toString();

      // Attempt to hold seats atomically using Lua script
      const redis = this.redisService.getClient();
      const result = await redis.eval(
        LUA_SCRIPTS.MULTI_SEAT_HOLD,
        lockKeys.length,
        ...lockKeys,
        userId,
        holdDurationSeconds.toString(),
        timestamp
      ) as number;

      if (result === 1) {
        // Successfully held all seats - update MongoDB state
        await this.updateSeatStatesForHold(eventId, seatIds, userId, holdDurationMinutes, reason);

        // Calculate total amount
        const totalAmount = this.calculateTotalAmount(validSeats, layout.categories);

        this.logger.log(`Successfully held ${seatIds.length} seats for user ${userId} in event ${eventId}`);

        return {
          success: true,
          message: `Successfully held ${seatIds.length} seats`,
          heldSeats: seatIds,
          totalAmount,
        };
      } else if (result === 0) {
        // Some seats were already locked - identify conflicts
        const conflictingSeats = await this.identifyConflictingSeats(eventId, seatIds);
        
        return {
          success: false,
          message: 'Some seats are already held by another user',
          conflictingSeats,
        };
      } else {
        throw new Error('Invalid parameters for seat hold operation');
      }

    } catch (error) {
      this.logger.error(`Failed to hold seats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Hold an entire table and all associated seats
   */
  async holdTable(request: HoldTableRequest): Promise<BookingResponse> {
    const { eventId, tableId, userId, holdDurationMinutes = this.DEFAULT_HOLD_DURATION, reason } = request;

    try {
      // Get table information and associated seats
      const layout = await this.seatLayoutModel.findById(eventId).exec();
      if (!layout) {
        throw new BadRequestException('Event layout not found');
      }

      const table = layout.items.find(item => item.id === tableId && item.type === 'table');
      if (!table) {
        throw new BadRequestException('Table not found');
      }

      // Find all seats associated with this table
      const associatedSeats = layout.seats.filter(seat => 
        seat.id.includes(tableId) || // Seats created with table
        (seat as any).metadata?.tableId === tableId // Seats with table reference
      );

      if (associatedSeats.length === 0) {
        throw new BadRequestException('No seats found for this table');
      }

      const seatIds = associatedSeats.map(seat => seat.id);

      // Create Redis lock keys (table + all seats)
      const tableKey = `table_lock:${eventId}:${tableId}`;
      const seatKeys = seatIds.map(seatId => `seat_lock:${eventId}:${seatId}`);
      const allKeys = [tableKey, ...seatKeys];

      const holdDurationSeconds = holdDurationMinutes * 60;
      const timestamp = Date.now().toString();

      // Attempt to hold table and all seats atomically
      const redis = this.redisService.getClient();
      const result = await redis.eval(
        LUA_SCRIPTS.TABLE_BOOKING,
        allKeys.length,
        ...allKeys,
        userId,
        holdDurationSeconds.toString(),
        timestamp,
        tableId
      ) as number;

      if (result === 1) {
        // Successfully held table and all seats
        await this.updateSeatStatesForHold(eventId, seatIds, userId, holdDurationMinutes, reason);

        const totalAmount = this.calculateTotalAmount(associatedSeats, layout.categories);

        this.logger.log(`Successfully held table ${tableId} with ${seatIds.length} seats for user ${userId}`);

        return {
          success: true,
          message: `Successfully held table ${tableId} with ${seatIds.length} seats`,
          heldSeats: seatIds,
          totalAmount,
        };
      } else {
        const conflictingSeats = await this.identifyConflictingSeats(eventId, seatIds);
        
        return {
          success: false,
          message: 'Table or some of its seats are already held',
          conflictingSeats,
        };
      }

    } catch (error) {
      this.logger.error(`Failed to hold table: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Release held seats for a user
   */
  async releaseSeats(eventId: string, userId: string, seatIds?: string[]): Promise<BookingResponse> {
    try {
      let lockKeys: string[];

      if (seatIds) {
        // Release specific seats
        lockKeys = seatIds.map(seatId => `seat_lock:${eventId}:${seatId}`);
      } else {
        // Release all seats held by user (get from MongoDB)
        const heldSeats = await this.seatStateModel.find({
          eventId,
          heldBy: userId,
          status: SeatStatus.HELD
        }).exec();

        lockKeys = heldSeats.map(seat => `seat_lock:${eventId}:${seat.seatId}`);
        seatIds = heldSeats.map(seat => seat.seatId);
      }

      if (lockKeys.length === 0) {
        return {
          success: true,
          message: 'No seats to release',
        };
      }

      // Release locks atomically
      const redis = this.redisService.getClient();
      const releasedCount = await redis.eval(
        LUA_SCRIPTS.RELEASE_LOCKS,
        lockKeys.length,
        ...lockKeys,
        userId,
        Date.now().toString()
      ) as number;

      // Update MongoDB state
      await this.seatStateModel.updateMany(
        {
          eventId,
          seatId: { $in: seatIds },
          heldBy: userId,
          status: SeatStatus.HELD
        },
        {
          $set: { status: SeatStatus.AVAILABLE },
          $unset: { heldBy: 1, holdExpiresAt: 1, holdReason: 1 },
          $inc: { version: 1 }
        }
      ).exec();

      this.logger.log(`Released ${releasedCount} seats for user ${userId} in event ${eventId}`);

      return {
        success: true,
        message: `Released ${releasedCount} seats`,
      };

    } catch (error) {
      this.logger.error(`Failed to release seats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Confirm booking from held seats
   */
  async confirmBooking(request: ConfirmBookingRequest): Promise<BookingResponse> {
    const { eventId, userId, seatIds, tableIds, contactInfo, paymentInfo, notes, specialRequests } = request;

    try {
      // Get all seats involved in this booking
      const allSeatIds = await this.resolveAllSeatIds(eventId, seatIds, tableIds);
      
      if (allSeatIds.length === 0) {
        throw new BadRequestException('No seats specified for booking');
      }

      // Check if user holds all the seats
      const heldSeats = await this.seatStateModel.find({
        eventId,
        seatId: { $in: allSeatIds },
        heldBy: userId,
        status: SeatStatus.HELD
      }).exec();

      if (heldSeats.length !== allSeatIds.length) {
        const missingSeats = allSeatIds.filter(seatId => 
          !heldSeats.some(held => held.seatId === seatId)
        );
        throw new ConflictException(`User does not hold all required seats: ${missingSeats.join(', ')}`);
      }

      // Get layout for pricing calculation
      const layout = await this.seatLayoutModel.findById(eventId).exec();
      if (!layout) {
        throw new BadRequestException('Event layout not found');
      }

      // Calculate booking details
      const bookingDetails = await this.calculateBookingDetails(layout, allSeatIds, tableIds);

      // Create the booking record
      const booking = new this.seatBookingModel({
        layoutId: eventId,
        eventId,
        userId,
        bookingType: this.determineBookingType(seatIds, tableIds),
        bookedSeats: bookingDetails.bookedSeats,
        bookedTables: bookingDetails.bookedTables,
        allSeatIds,
        totalSeats: allSeatIds.length,
        totalAmount: bookingDetails.totalAmount,
        status: BookingStatus.CONFIRMED,
        payment: {
          status: paymentInfo ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          amount: bookingDetails.totalAmount,
          ...paymentInfo,
        },
        contact: contactInfo,
        notes,
        specialRequests,
        bookedAt: new Date(),
        confirmedAt: new Date(),
      });

      await booking.save();

      // Transfer Redis locks to confirmed booking state
      const lockKeys = allSeatIds.map(seatId => `seat_lock:${eventId}:${seatId}`);
      const bookingLockValue = `booking:${booking._id}:${userId}`;
      
      const redis = this.redisService.getClient();
      const transferResult = await redis.eval(
        LUA_SCRIPTS.ATOMIC_TRANSFER,
        lockKeys.length,
        ...lockKeys,
        userId,
        bookingLockValue,
        this.CONFIRMED_BOOKING_TTL.toString()
      ) as number;

      if (transferResult !== 1) {
        // Rollback booking if transfer failed
        await booking.deleteOne();
        throw new ConflictException('Failed to confirm booking - seats may have been released');
      }

      // Update seat states to booked
      await this.seatStateModel.updateMany(
        {
          eventId,
          seatId: { $in: allSeatIds },
          heldBy: userId
        },
        {
          $set: {
            status: SeatStatus.BOOKED,
            bookedBy: userId,
            bookingId: booking._id,
            bookedAt: new Date(),
            bookedPrice: bookingDetails.totalAmount / allSeatIds.length
          },
          $unset: { heldBy: 1, holdExpiresAt: 1, holdReason: 1 },
          $inc: { version: 1 }
        }
      ).exec();

      this.logger.log(`Successfully confirmed booking ${booking._id} for user ${userId}`);

      return {
        success: true,
        bookingId: (booking._id as any).toString(),
        message: `Successfully booked ${allSeatIds.length} seats`,
        totalAmount: bookingDetails.totalAmount,
      };

    } catch (error) {
      this.logger.error(`Failed to confirm booking: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get combined layout with runtime seat states
   * This is the key method for frontend rendering
   */
  async getLayoutWithStates(eventId: string, viewport?: { x: number; y: number; width: number; height: number }) {
    try {
      // Get layout geometry (static data)
      let layoutQuery = this.seatLayoutModel.findById(eventId);
      
      // Apply viewport filtering if provided for performance
      if (viewport) {
        // Use aggregation for viewport filtering
        const layout = await this.seatLayoutModel.aggregate([
          { $match: { _id: eventId } },
          {
            $project: {
              name: 1,
              categories: 1,
              canvasW: 1,
              canvasH: 1,
              seats: {
                $filter: {
                  input: '$seats',
                  cond: {
                    $and: [
                      { $gte: ['$$this.pos.x', viewport.x - 50] },
                      { $lte: ['$$this.pos.x', viewport.x + viewport.width + 50] },
                      { $gte: ['$$this.pos.y', viewport.y - 50] },
                      { $lte: ['$$this.pos.y', viewport.y + viewport.height + 50] }
                    ]
                  }
                }
              },
              items: {
                $filter: {
                  input: '$items',
                  cond: {
                    $and: [
                      { $gte: ['$$this.pos.x', viewport.x - 50] },
                      { $lte: ['$$this.pos.x', viewport.x + viewport.width + 50] },
                      { $gte: ['$$this.pos.y', viewport.y - 50] },
                      { $lte: ['$$this.pos.y', viewport.y + viewport.height + 50] }
                    ]
                  }
                }
              }
            }
          }
        ]).exec();
        
        if (!layout || layout.length === 0) {
          throw new BadRequestException('Layout not found');
        }
        
        const layoutData = layout[0];
        
        // Get runtime seat states
        const seatIds = layoutData.seats.map(seat => seat.id);
        const seatStates = await this.seatStateModel.find({
          eventId,
          seatId: { $in: seatIds }
        }).exec();

        // Create state lookup map
        const stateMap = new Map(seatStates.map(state => [state.seatId, state]));

        // Merge geometry with runtime state
        const seatsWithStates = layoutData.seats.map(seat => {
          const state = stateMap.get(seat.id);
          return {
            // Geometry (from SeatLayout)
            id: seat.id,
            position: seat.pos,
            size: seat.size,
            categoryId: seat.catId,
            rotation: seat.rot || 0,
            rowLabel: seat.rl,
            seatNumber: seat.sn,
            
            // Runtime state (from SeatState)
            status: state?.status || SeatStatus.AVAILABLE,
            bookedBy: state?.bookedBy,
            heldBy: state?.heldBy,
            holdExpiresAt: state?.holdExpiresAt,
            bookedAt: state?.bookedAt,
            bookedPrice: state?.bookedPrice,
          };
        });

        return {
          layout: {
            id: layoutData._id,
            name: layoutData.name,
            canvasW: layoutData.canvasW,
            canvasH: layoutData.canvasH,
            categories: layoutData.categories,
          },
          seats: seatsWithStates,
          items: layoutData.items,
          stats: await this.getEventStats(eventId),
        };
      }

      const layout = await layoutQuery.exec();
      if (!layout) {
        throw new BadRequestException('Layout not found');
      }

      // Get runtime seat states
      const seatIds = layout.seats.map(seat => seat.id);
      const seatStates = await this.seatStateModel.find({
        eventId,
        seatId: { $in: seatIds }
      }).exec();

      // Create state lookup map
      const stateMap = new Map(seatStates.map(state => [state.seatId, state]));

      // Merge geometry with runtime state
      const seatsWithStates = layout.seats.map(seat => {
        const state = stateMap.get(seat.id);
        return {
          // Geometry (from SeatLayout)
          id: seat.id,
          position: seat.pos,
          size: seat.size,
          categoryId: seat.catId,
          rotation: seat.rot || 0,
          rowLabel: seat.rl,
          seatNumber: seat.sn,
          
          // Runtime state (from SeatState)
          status: state?.status || SeatStatus.AVAILABLE,
          bookedBy: state?.bookedBy,
          heldBy: state?.heldBy,
          holdExpiresAt: state?.holdExpiresAt,
          bookedAt: state?.bookedAt,
          bookedPrice: state?.bookedPrice,
        };
      });

      return {
        layout: {
          id: layout._id,
          name: layout.name,
          canvasW: layout.canvasW,
          canvasH: layout.canvasH,
          categories: layout.categories,
        },
        seats: seatsWithStates,
        items: layout.items,
        stats: await this.getEventStats(eventId),
      };

    } catch (error) {
      this.logger.error(`Failed to get layout with states: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Helper Methods
   */

  private async updateSeatStatesForHold(
    eventId: string, 
    seatIds: string[], 
    userId: string, 
    holdDurationMinutes: number,
    reason?: SeatHoldReason
  ): Promise<void> {
    const holdExpiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);

    await this.seatStateModel.updateMany(
      { eventId, seatId: { $in: seatIds } },
      {
        $set: {
          status: SeatStatus.HELD,
          heldBy: userId,
          holdExpiresAt,
          holdReason: reason || SeatHoldReason.PAYMENT_PROCESSING
        },
        $inc: { version: 1 }
      },
      { upsert: true }
    ).exec();
  }

  private async identifyConflictingSeats(eventId: string, seatIds: string[]): Promise<string[]> {
    const lockKeys = seatIds.map(seatId => `seat_lock:${eventId}:${seatId}`);
    
    const redis = this.redisService.getClient();
    const availability = await redis.eval(
      LUA_SCRIPTS.CHECK_AVAILABILITY,
      lockKeys.length,
      ...lockKeys
    ) as number[];

    return seatIds.filter((_, index) => availability[index] === 0);
  }

  private calculateTotalAmount(seats: any[], categories: any[]): number {
    const categoryMap = new Map(categories.map(cat => [cat.id, cat.price]));
    
    return seats.reduce((total, seat) => {
      const price = categoryMap.get(seat.catId) || 0;
      return total + price;
    }, 0);
  }

  private async resolveAllSeatIds(eventId: string, seatIds?: string[], tableIds?: string[]): Promise<string[]> {
    const allSeatIds: string[] = [...(seatIds || [])];

    if (tableIds && tableIds.length > 0) {
      const layout = await this.seatLayoutModel.findById(eventId).exec();
      if (layout) {
        for (const tableId of tableIds) {
          const tableSeats = layout.seats.filter(seat => 
            seat.id.includes(tableId) || (seat as any).metadata?.tableId === tableId
          );
          allSeatIds.push(...tableSeats.map(seat => seat.id));
        }
      }
    }

    return [...new Set(allSeatIds)]; // Remove duplicates
  }

  private async calculateBookingDetails(layout: any, seatIds: string[], tableIds?: string[]) {
    const bookedSeats: any[] = [];
    const bookedTables: any[] = [];
    let totalAmount = 0;

    const categoryMap = new Map(layout.categories.map((cat: any) => [cat.id, cat.price]));

    // Process individual seats
    for (const seatId of seatIds) {
      const seat = layout.seats.find((s: any) => s.id === seatId);
      if (seat) {
        const price = categoryMap.get(seat.catId) || 0;
        bookedSeats.push({
          seatId: seat.id,
          categoryId: seat.catId,
          price: price as number,
          rowLabel: seat.rl,
          seatNumber: seat.sn,
        });
        totalAmount += price as number;
      }
    }

    // Process tables
    if (tableIds) {
      for (const tableId of tableIds) {
        const table = layout.items.find((item: any) => item.id === tableId);
        const tableSeats = layout.seats.filter((seat: any) => 
          seat.id.includes(tableId) || (seat as any).metadata?.tableId === tableId
        );

        if (table && tableSeats.length > 0) {
          const pricePerSeat = categoryMap.get(tableSeats[0].catId) || 0;
          const tableTotal = (pricePerSeat as number) * tableSeats.length;

          bookedTables.push({
            tableId,
            tableName: table.lbl || `Table ${tableId}`,
            seatCount: tableSeats.length,
            associatedSeatIds: tableSeats.map((seat: any) => seat.id),
            totalPrice: tableTotal,
            pricePerSeat: pricePerSeat as number,
          });

          totalAmount += tableTotal;
        }
      }
    }

    return { bookedSeats, bookedTables, totalAmount };
  }

  private determineBookingType(seatIds?: string[], tableIds?: string[]): string {
    if (tableIds && tableIds.length > 0 && seatIds && seatIds.length > 0) {
      return 'mixed';
    } else if (tableIds && tableIds.length > 0) {
      return 'table_booking';
    } else {
      return 'individual_seats';
    }
  }

  private async getEventStats(eventId: string) {
    return await this.seatStateModel.aggregate([
      { $match: { eventId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).exec();
  }
}