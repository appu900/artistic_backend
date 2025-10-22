import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatStateDocument = SeatState & Document;

export enum SeatStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked',
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
  HELD = 'held', // Temporary hold during booking process
}

export enum SeatHoldReason {
  PAYMENT_PROCESSING = 'payment_processing',
  ADMIN_HOLD = 'admin_hold',
  MAINTENANCE = 'maintenance',
}

// High-performance seat state tracking for live booking
@Schema({ 
  timestamps: true,
  collection: 'seatstates', // Explicit collection name for sharding
  // Optimize for high-frequency writes
  writeConcern: { w: 1, j: false }, // Fast writes, eventual consistency
})
export class SeatState {
  @Prop({ type: Types.ObjectId, ref: 'SeatLayout', required: true, index: true })
  layoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ required: true, index: true })
  seatId: string;

  @Prop({ enum: Object.values(SeatStatus), default: SeatStatus.AVAILABLE, index: true })
  status: SeatStatus;

  // Booking information
  @Prop({ type: Types.ObjectId, ref: 'User' })
  bookedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Booking' })
  bookingId?: Types.ObjectId;

  @Prop()
  bookedAt?: Date;

  // Temporary hold information (Redis backup)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  heldBy?: Types.ObjectId;

  @Prop()
  holdExpiresAt?: Date;

  @Prop({ enum: Object.values(SeatHoldReason) })
  holdReason?: SeatHoldReason;

  // Pricing at time of booking (for historical accuracy)
  @Prop({ min: 0 })
  bookedPrice?: number;

  // Admin notes
  @Prop()
  notes?: string;

  // Version for optimistic locking on this specific seat
  @Prop({ default: 1 })
  version: number;
}

export const SeatStateSchema = SchemaFactory.createForClass(SeatState);

// Critical indexes for performance
SeatStateSchema.index({ layoutId: 1, eventId: 1, seatId: 1 }, { unique: true });
SeatStateSchema.index({ eventId: 1, status: 1 }); // Fast availability queries
SeatStateSchema.index({ heldBy: 1, holdExpiresAt: 1 }); // Hold management
SeatStateSchema.index({ bookedBy: 1, bookedAt: -1 }); // User booking history
SeatStateSchema.index({ holdExpiresAt: 1 }, { sparse: true }); // TTL for expired holds

// TTL index for auto-expiring holds
SeatStateSchema.index({ holdExpiresAt: 1 }, { 
  expireAfterSeconds: 0, // Use the date in holdExpiresAt field
  sparse: true // Only applies to documents with holdExpiresAt
});

// Static methods for bulk operations
SeatStateSchema.statics.initializeEventSeats = async function(
  layoutId: string, 
  eventId: string, 
  seats: Array<{ id: string }>
) {
  const seatStates = seats.map(seat => ({
    layoutId: new Types.ObjectId(layoutId),
    eventId: new Types.ObjectId(eventId),
    seatId: seat.id,
    status: SeatStatus.AVAILABLE,
    version: 1
  }));

  return this.insertMany(seatStates, { 
    ordered: false // Continue on duplicates
  });
};

SeatStateSchema.statics.getAvailabilityStats = async function(eventId: string) {
  return this.aggregate([
    { $match: { eventId: new Types.ObjectId(eventId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

SeatStateSchema.statics.bulkUpdateStatus = async function(
  eventId: string,
  seatUpdates: Array<{ seatId: string; status: SeatStatus; bookedBy?: string; bookingId?: string }>
) {
  const bulkOps = seatUpdates.map(update => {
    const updateDoc: any = { 
      status: update.status,
      $inc: { version: 1 },
      updatedAt: new Date()
    };

    if (update.status === SeatStatus.BOOKED) {
      updateDoc.bookedBy = update.bookedBy ? new Types.ObjectId(update.bookedBy) : null;
      updateDoc.bookingId = update.bookingId ? new Types.ObjectId(update.bookingId) : null;
      updateDoc.bookedAt = new Date();
      // Clear hold data
      updateDoc.$unset = { heldBy: 1, holdExpiresAt: 1, holdReason: 1 };
    } else if (update.status === SeatStatus.AVAILABLE) {
      // Clear all booking/hold data
      updateDoc.$unset = { 
        bookedBy: 1, 
        bookingId: 1, 
        bookedAt: 1,
        heldBy: 1, 
        holdExpiresAt: 1, 
        holdReason: 1,
        bookedPrice: 1
      };
    }

    return {
      updateOne: {
        filter: { 
          eventId: new Types.ObjectId(eventId),
          seatId: update.seatId
        },
        update: updateDoc,
        upsert: false
      }
    };
  });

  return this.bulkWrite(bulkOps, { ordered: false });
};

SeatStateSchema.statics.holdSeats = async function(
  eventId: string,
  seatIds: string[],
  userId: string,
  holdDurationMinutes: number = 10,
  reason: SeatHoldReason = SeatHoldReason.PAYMENT_PROCESSING
) {
  const holdExpiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);
  
  const result = await this.updateMany(
    {
      eventId: new Types.ObjectId(eventId),
      seatId: { $in: seatIds },
      status: SeatStatus.AVAILABLE // Only hold available seats
    },
    {
      $set: {
        status: SeatStatus.HELD,
        heldBy: new Types.ObjectId(userId),
        holdExpiresAt,
        holdReason: reason
      },
      $inc: { version: 1 }
    }
  );

  return {
    success: result.modifiedCount === seatIds.length,
    heldCount: result.modifiedCount,
    requestedCount: seatIds.length
  };
};

SeatStateSchema.statics.releaseHolds = async function(
  eventId: string,
  seatIds?: string[],
  userId?: string
) {
  const filter: any = {
    eventId: new Types.ObjectId(eventId),
    status: SeatStatus.HELD
  };

  if (seatIds) {
    filter.seatId = { $in: seatIds };
  }

  if (userId) {
    filter.heldBy = new Types.ObjectId(userId);
  }

  return this.updateMany(filter, {
    $set: { status: SeatStatus.AVAILABLE },
    $unset: { heldBy: 1, holdExpiresAt: 1, holdReason: 1 },
    $inc: { version: 1 }
  });
};

// Instance methods
SeatStateSchema.methods.isAvailableForBooking = function() {
  return this.status === SeatStatus.AVAILABLE || 
         (this.status === SeatStatus.HELD && this.holdExpiresAt && this.holdExpiresAt < new Date());
};

SeatStateSchema.methods.canBeHeldBy = function(userId: string) {
  return this.status === SeatStatus.AVAILABLE || 
         (this.status === SeatStatus.HELD && this.heldBy?.toString() === userId);
};