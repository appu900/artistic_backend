import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SeatState, SeatStateDocument, SeatStatus, SeatHoldReason } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';
import { SeatLayout, SeatLayoutDocument } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { SeatLockService } from '../../infrastructure/redis/seat-lock.service';

export interface BookingSeatRequest {
  eventId: string;
  layoutId: string;
  seatIds: string[];
  userId: string;
  lockDurationMinutes?: number;
}

export interface ConfirmBookingRequest {
  eventId: string;
  seatIds: string[];
  userId: string;
  bookingId: string;
  paymentId?: string;
  finalPrices: Record<string, number>; // seatId -> final price paid
  customerInfo?: {
    name: string;
    email: string;
    phone?: string;
  };
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  lockedSeats: string[];
  failedSeats: string[];
  errors: string[];
  lockExpiresAt?: Date;
  totalPrice?: number;
}

@Injectable()
export class SeatBookingService {
  private readonly logger = new Logger(SeatBookingService.name);

  constructor(
    @InjectModel(SeatState.name)
    private seatStateModel: Model<SeatStateDocument>,
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    private seatLockService: SeatLockService,
  ) {}

  /**
   * Step 1: Lock seats for booking (with price calculation)
   * This is the first step when user selects seats
   */
  async initiateBooking(request: BookingSeatRequest): Promise<BookingResult> {
    const { eventId, layoutId, seatIds, userId, lockDurationMinutes = 10 } = request;

    try {
      // Validate inputs
      if (!seatIds || seatIds.length === 0) {
        return {
          success: false,
          lockedSeats: [],
          failedSeats: [],
          errors: ['No seats selected']
        };
      }

      // Get layout and pricing information
      const layout = await this.seatLayoutModel.findById(layoutId).lean();
      if (!layout) {
        return {
          success: false,
          lockedSeats: [],
          failedSeats: seatIds,
          errors: ['Layout not found']
        };
      }

      // Validate seat IDs exist in layout
      const validSeatIds = layout.seats.map(seat => seat.id);
      const invalidSeats = seatIds.filter(id => !validSeatIds.includes(id));
      if (invalidSeats.length > 0) {
        return {
          success: false,
          lockedSeats: [],
          failedSeats: seatIds,
          errors: [`Invalid seat IDs: ${invalidSeats.join(', ')}`]
        };
      }

      // Check current availability in MongoDB (hard blocks)
      const unavailableStates = await this.seatStateModel.find({
        eventId: new Types.ObjectId(eventId),
        seatId: { $in: seatIds },
        status: { $in: [SeatStatus.BOOKED, SeatStatus.RESERVED, SeatStatus.BLOCKED] }
      }).select('seatId status').lean();

      const hardBlockedSeats = unavailableStates.map(state => state.seatId);
      const availableForLocking = seatIds.filter(id => !hardBlockedSeats.includes(id));

      if (availableForLocking.length === 0) {
        return {
          success: false,
          lockedSeats: [],
          failedSeats: seatIds,
          errors: ['All selected seats are unavailable']
        };
      }

      // Attempt Redis locks (soft locks)
      const lockResult = await this.seatLockService.lockSeats(
        eventId,
        availableForLocking,
        userId,
        lockDurationMinutes
      );

      if (lockResult.lockedSeats.length === 0) {
        return {
          success: false,
          lockedSeats: [],
          failedSeats: seatIds,
          errors: ['Could not lock any seats - they may be held by other users']
        };
      }

      // Update MongoDB with held status for successfully locked seats
      const holdExpiresAt = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
      
      await this.seatStateModel.bulkWrite(
        lockResult.lockedSeats.map(seatId => ({
          updateOne: {
            filter: { 
              eventId: new Types.ObjectId(eventId),
              seatId: seatId
            },
            update: {
              $set: {
                status: SeatStatus.HELD,
                heldBy: new Types.ObjectId(userId),
                holdExpiresAt,
                holdReason: SeatHoldReason.PAYMENT_PROCESSING
              }
            },
            upsert: true
          }
        }))
      );

      // Calculate total price
      const seatPriceMap = this.calculateSeatPrices(layout, lockResult.lockedSeats);
      const totalPrice = Object.values(seatPriceMap).reduce((sum, price) => sum + price, 0);

      const allFailedSeats = [...hardBlockedSeats, ...lockResult.failedSeats];

      this.logger.log(
        `Booking initiated for user ${userId} in event ${eventId}. ` +
        `Locked: ${lockResult.lockedSeats.length}, Failed: ${allFailedSeats.length}`
      );

      return {
        success: lockResult.lockedSeats.length > 0,
        lockedSeats: lockResult.lockedSeats,
        failedSeats: allFailedSeats,
        errors: allFailedSeats.length > 0 ? ['Some seats could not be locked'] : [],
        lockExpiresAt: holdExpiresAt,
        totalPrice
      };

    } catch (error) {
      this.logger.error('Failed to initiate booking', error);
      return {
        success: false,
        lockedSeats: [],
        failedSeats: seatIds,
        errors: [`Booking initiation failed: ${error.message}`]
      };
    }
  }

  /**
   * Step 2: Confirm booking after successful payment
   * This converts held seats to booked status
   */
  async confirmBooking(request: ConfirmBookingRequest): Promise<BookingResult> {
    const { eventId, seatIds, userId, bookingId, finalPrices } = request;

    try {
      // Verify all seats are still held by this user
      const heldSeats = await this.seatStateModel.find({
        eventId: new Types.ObjectId(eventId),
        seatId: { $in: seatIds },
        heldBy: new Types.ObjectId(userId),
        status: SeatStatus.HELD,
        holdExpiresAt: { $gt: new Date() } // Not expired
      }).select('seatId').lean();

      const validSeatIds = heldSeats.map(seat => seat.seatId);
      const invalidSeatIds = seatIds.filter(id => !validSeatIds.includes(id));

      if (validSeatIds.length === 0) {
        // Release any remaining locks
        await this.seatLockService.releaseSeats(eventId, seatIds, userId);
        
        return {
          success: false,
          lockedSeats: [],
          failedSeats: seatIds,
          errors: ['No valid held seats found - locks may have expired']
        };
      }

      // Release Redis locks first (we're moving to permanent booking)
      await this.seatLockService.releaseSeats(eventId, validSeatIds, userId);

      // Update seats to BOOKED status with booking details
      const bookedAt = new Date();
      const bulkOps = validSeatIds.map(seatId => ({
        updateOne: {
          filter: {
            eventId: new Types.ObjectId(eventId),
            seatId: seatId,
            heldBy: new Types.ObjectId(userId),
            status: SeatStatus.HELD
          },
          update: {
            $set: {
              status: SeatStatus.BOOKED,
              bookedBy: new Types.ObjectId(userId),
              bookingId: new Types.ObjectId(bookingId),
              bookedAt: bookedAt,
              bookedPrice: finalPrices[seatId] || 0
            },
            $unset: {
              heldBy: 1,
              holdExpiresAt: 1,
              holdReason: 1
            }
          }
        }
      }));

      const bulkResult = await this.seatStateModel.bulkWrite(bulkOps);
      const successfulBookings = bulkResult.modifiedCount;

      if (successfulBookings !== validSeatIds.length) {
        this.logger.warn(
          `Partial booking confirmation for user ${userId}. ` +
          `Expected: ${validSeatIds.length}, Actual: ${successfulBookings}`
        );
      }

      const totalPrice = validSeatIds.reduce((sum, seatId) => sum + (finalPrices[seatId] || 0), 0);

      this.logger.log(
        `Booking confirmed for user ${userId} in event ${eventId}. ` +
        `Booked seats: ${successfulBookings}, Total: $${totalPrice}`
      );

      return {
        success: successfulBookings > 0,
        bookingId,
        lockedSeats: validSeatIds.slice(0, successfulBookings),
        failedSeats: [...invalidSeatIds, ...validSeatIds.slice(successfulBookings)],
        errors: invalidSeatIds.length > 0 ? ['Some seats were no longer available'] : [],
        totalPrice
      };

    } catch (error) {
      this.logger.error('Failed to confirm booking', error);
      
      // Try to release locks on error
      try {
        await this.seatLockService.releaseSeats(eventId, seatIds, userId);
      } catch (releaseError) {
        this.logger.error('Failed to release locks after booking error', releaseError);
      }

      return {
        success: false,
        lockedSeats: [],
        failedSeats: seatIds,
        errors: [`Booking confirmation failed: ${error.message}`]
      };
    }
  }

  /**
   * Step 3: Cancel/Release booking (if payment fails or user cancels)
   */
  async cancelBooking(eventId: string, seatIds: string[], userId: string): Promise<{
    success: boolean;
    releasedSeats: string[];
    errors: string[];
  }> {
    try {
      // Release Redis locks
      const redisResult = await this.seatLockService.releaseSeats(eventId, seatIds, userId);

      // Release MongoDB holds
      const mongoResult = await this.seatStateModel.updateMany(
        {
          eventId: new Types.ObjectId(eventId),
          seatId: { $in: seatIds },
          heldBy: new Types.ObjectId(userId),
          status: SeatStatus.HELD
        },
        {
          $set: { status: SeatStatus.AVAILABLE },
          $unset: { heldBy: 1, holdExpiresAt: 1, holdReason: 1 }
        }
      );

      this.logger.log(
        `Booking cancelled for user ${userId} in event ${eventId}. ` +
        `Released ${mongoResult.modifiedCount} seats`
      );

      return {
        success: true,
        releasedSeats: seatIds,
        errors: []
      };

    } catch (error) {
      this.logger.error('Failed to cancel booking', error);
      return {
        success: false,
        releasedSeats: [],
        errors: [`Booking cancellation failed: ${error.message}`]
      };
    }
  }

  /**
   * Extend the lock duration for seats (if user needs more time)
   */
  async extendBookingLock(
    eventId: string,
    seatIds: string[],
    userId: string,
    additionalMinutes: number = 5
  ): Promise<{ success: boolean; extendedSeats: string[]; newExpiryTime: Date }> {
    try {
      // Extend Redis locks
      const redisResult = await this.seatLockService.extendLocks(
        eventId,
        seatIds,
        userId,
        additionalMinutes
      );

      // Update MongoDB expiry times
      const newExpiryTime = new Date(Date.now() + additionalMinutes * 60 * 1000);
      
      await this.seatStateModel.updateMany(
        {
          eventId: new Types.ObjectId(eventId),
          seatId: { $in: seatIds },
          heldBy: new Types.ObjectId(userId),
          status: SeatStatus.HELD
        },
        {
          $set: { holdExpiresAt: newExpiryTime }
        }
      );

      return {
        success: redisResult.extendedCount > 0,
        extendedSeats: seatIds.slice(0, redisResult.extendedCount),
        newExpiryTime
      };

    } catch (error) {
      this.logger.error('Failed to extend booking lock', error);
      return {
        success: false,
        extendedSeats: [],
        newExpiryTime: new Date()
      };
    }
  }

  /**
   * Get user's current bookings/holds for an event
   */
  async getUserBookingStatus(eventId: string, userId: string): Promise<{
    heldSeats: Array<{ seatId: string; expiresAt: Date }>;
    bookedSeats: Array<{ seatId: string; bookingId: string; bookedAt: Date; price: number }>;
  }> {
    const seatStates = await this.seatStateModel.find({
      eventId: new Types.ObjectId(eventId),
      $or: [
        { heldBy: new Types.ObjectId(userId), status: SeatStatus.HELD },
        { bookedBy: new Types.ObjectId(userId), status: SeatStatus.BOOKED }
      ]
    }).lean();

    const heldSeats = seatStates
      .filter(state => state.status === SeatStatus.HELD)
      .map(state => ({
        seatId: state.seatId,
        expiresAt: state.holdExpiresAt!
      }));

    const bookedSeats = seatStates
      .filter(state => state.status === SeatStatus.BOOKED)
      .map(state => ({
        seatId: state.seatId,
        bookingId: state.bookingId!.toString(),
        bookedAt: state.bookedAt!,
        price: state.bookedPrice || 0
      }));

    return { heldSeats, bookedSeats };
  }

  /**
   * Calculate seat prices based on layout categories
   */
  private calculateSeatPrices(layout: any, seatIds: string[]): Record<string, number> {
    const priceMap: Record<string, number> = {};
    
    const categoryPrices = new Map<string, number>();
    layout.categories.forEach((cat: any) => {
      categoryPrices.set(cat.id, cat.price);
    });

    layout.seats.forEach((seat: any) => {
      if (seatIds.includes(seat.id)) {
        priceMap[seat.id] = categoryPrices.get(seat.catId) || 0;
      }
    });

    return priceMap;
  }

  /**
   * Cleanup expired holds (maintenance function)
   */
  async cleanupExpiredHolds(eventId?: string): Promise<{ cleanedCount: number }> {
    try {
      const filter: any = {
        status: SeatStatus.HELD,
        holdExpiresAt: { $lt: new Date() }
      };

      if (eventId) {
        filter.eventId = new Types.ObjectId(eventId);
      }

      const result = await this.seatStateModel.updateMany(filter, {
        $set: { status: SeatStatus.AVAILABLE },
        $unset: { heldBy: 1, holdExpiresAt: 1, holdReason: 1 }
      });

      if (result.modifiedCount > 0) {
        this.logger.log(`Cleaned up ${result.modifiedCount} expired holds`);
      }

      return { cleanedCount: result.modifiedCount };

    } catch (error) {
      this.logger.error('Failed to cleanup expired holds', error);
      return { cleanedCount: 0 };
    }
  }
}