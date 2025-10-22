import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatBookingDocument = SeatBooking & Document;

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

// Individual seat booking details
@Schema({ _id: false })
export class BookedSeat {
  @Prop({ required: true })
  seatId: string;

  @Prop({ required: true })
  categoryId: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop()
  rowLabel?: string;

  @Prop()
  seatNumber?: number;

  @Prop()
  tableId?: string; // If this seat is part of a table booking
}

// Table booking details (when booking entire tables)
@Schema({ _id: false })
export class BookedTable {
  @Prop({ required: true })
  tableId: string;

  @Prop({ required: true })
  tableName: string;

  @Prop({ required: true, min: 1 })
  seatCount: number;

  @Prop({ type: [String], required: true })
  associatedSeatIds: string[]; // All seat IDs that belong to this table

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({ required: true, min: 0 })
  pricePerSeat: number;
}

// Payment information
@Schema({ _id: false })
export class PaymentInfo {
  @Prop({ enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop()
  currency?: string;

  @Prop()
  paymentMethod?: string; // 'card', 'paypal', 'bank_transfer', etc.

  @Prop()
  transactionId?: string;

  @Prop()
  paymentGateway?: string; // 'stripe', 'paypal', 'razorpay', etc.

  @Prop()
  paidAt?: Date;

  @Prop()
  failureReason?: string;
}

// Contact information for the booking
@Schema({ _id: false })
export class ContactInfo {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;
}

/**
 * SeatBooking Schema - For confirmed seat/table bookings
 * 
 * This schema handles both individual seat bookings and table bookings.
 * When a table is booked, all associated seats are automatically locked.
 * 
 * Design rationale:
 * - Separate from SeatState for clear separation of concerns
 * - SeatState = runtime status tracking
 * - SeatBooking = confirmed booking records with payment info
 * - Supports both individual seats and table bookings
 * - Includes comprehensive payment tracking
 */
@Schema({ 
  timestamps: true,
  collection: 'seatbookings'
})
export class SeatBooking {
  @Prop({ type: Types.ObjectId, ref: 'SeatLayout', required: true, index: true })
  layoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  // Booking type identification
  @Prop({ required: true })
  bookingType: 'individual_seats' | 'table_booking' | 'mixed';

  // Individual seat bookings
  @Prop({ type: [BookedSeat], default: [] })
  bookedSeats: BookedSeat[];

  // Table bookings (entire tables)
  @Prop({ type: [BookedTable], default: [] })
  bookedTables: BookedTable[];

  // All seat IDs involved in this booking (for quick lookups)
  @Prop({ type: [String], required: true, index: true })
  allSeatIds: string[];

  // Total booking information
  @Prop({ required: true, min: 1 })
  totalSeats: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ enum: Object.values(BookingStatus), default: BookingStatus.PENDING, index: true })
  status: BookingStatus;

  // Payment information
  @Prop({ type: PaymentInfo, required: true })
  payment: PaymentInfo;

  // Contact information
  @Prop({ type: ContactInfo, required: true })
  contact: ContactInfo;

  // Booking metadata
  @Prop()
  notes?: string;

  @Prop()
  specialRequests?: string;

  // Timing information
  @Prop()
  bookedAt: Date;

  @Prop()
  expiresAt?: Date; // For pending bookings

  @Prop()
  confirmedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  // Reference to original hold (for audit trail)
  @Prop()
  originalHoldId?: string;

  // Version for optimistic locking
  @Prop({ default: 1 })
  version: number;
}

export const SeatBookingSchema = SchemaFactory.createForClass(SeatBooking);

// Indexes for optimal query performance
SeatBookingSchema.index({ eventId: 1, status: 1 });
SeatBookingSchema.index({ userId: 1, createdAt: -1 });
SeatBookingSchema.index({ layoutId: 1, eventId: 1 });
SeatBookingSchema.index({ allSeatIds: 1 }); // For checking seat conflicts
SeatBookingSchema.index({ 'payment.status': 1, createdAt: -1 });
SeatBookingSchema.index({ expiresAt: 1 }, { sparse: true }); // For cleaning up expired bookings

// Static methods for booking operations
SeatBookingSchema.statics.findConflictingBookings = async function(
  eventId: string,
  seatIds: string[]
) {
  return this.find({
    eventId: new Types.ObjectId(eventId),
    allSeatIds: { $in: seatIds },
    status: { $nin: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] }
  });
};

SeatBookingSchema.statics.getUserBookings = async function(
  userId: string,
  options: { limit?: number; skip?: number } = {}
) {
  return this.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .populate('layoutId', 'name')
    .populate('eventId', 'name date');
};

SeatBookingSchema.statics.getEventBookingStats = async function(eventId: string) {
  return this.aggregate([
    { $match: { eventId: new Types.ObjectId(eventId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSeats: { $sum: '$totalSeats' },
        totalRevenue: { 
          $sum: { 
            $cond: [
              { $in: ['$status', [BookingStatus.CONFIRMED, BookingStatus.PAID]] },
              '$totalAmount',
              0
            ]
          }
        }
      }
    }
  ]);
};

// Instance methods
SeatBookingSchema.methods.canBeCancelled = function() {
  return this.status === BookingStatus.PENDING || 
         this.status === BookingStatus.CONFIRMED;
};

SeatBookingSchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

SeatBookingSchema.methods.markAsPaid = function(paymentDetails: any) {
  this.status = BookingStatus.PAID;
  this.payment.status = PaymentStatus.COMPLETED;
  this.payment.paidAt = new Date();
  this.confirmedAt = new Date();
  
  if (paymentDetails.transactionId) {
    this.payment.transactionId = paymentDetails.transactionId;
  }
  
  this.version += 1;
  return this.save();
};

SeatBookingSchema.methods.cancel = function(reason?: string) {
  this.status = BookingStatus.CANCELLED;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.version += 1;
  return this.save();
};