import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventTicketBookingDocument = EventTicketBooking & Document;

@Schema({ _id: false })
export class Position {
  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;
}

export enum TicketStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  USED = 'used',
}

export enum TicketType {
  SEAT = 'seat',
  TABLE = 'table',
  BOOTH = 'booth',
}

@Schema({ _id: false })
export class BookedSeat {
  @Prop({ required: true })
  seatId: string;

  @Prop({ required: true })
  categoryId: string;

  @Prop({ required: true })
  categoryName: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop()
  rowLabel?: string;

  @Prop()
  seatNumber?: number;

  @Prop({ type: Position })
  position?: Position;
}

@Schema({ _id: false })
export class BookedTable {
  @Prop({ required: true })
  tableId: string;

  @Prop({ required: true })
  tableName: string;

  @Prop({ required: true })
  categoryId: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 0 })
  seatCount: number;

  @Prop({ type: Position })
  position?: Position;
}

@Schema({ _id: false })
export class BookedBooth {
  @Prop({ required: true })
  boothId: string;

  @Prop({ required: true })
  boothName: string;

  @Prop({ required: true })
  categoryId: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ type: Position })
  position?: Position;
}

@Schema({ _id: false })
export class CustomerInfo {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  address?: string;

  @Prop()
  emergencyContact?: string;

  @Prop()
  specialRequests?: string;
}

@Schema({ _id: false })
export class PaymentInfo {
  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  serviceFee: number;

  @Prop({ default: 0 })
  tax: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ default: 'KWD' })
  currency: string;

  @Prop()
  paymentMethod?: string;

  @Prop()
  transactionId?: string;

  @Prop()
  paymentDate?: Date;
}

@Schema({ timestamps: true })
export class EventTicketBooking {
  @Prop({ required: true, unique: true })
  bookingReference: string;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OpenBookingLayout', required: true, index: true })
  openBookingLayoutId: Types.ObjectId;

  @Prop({ 
    type: String,
    enum: Object.values(TicketStatus),
    default: TicketStatus.PENDING,
    index: true
  })
  status: TicketStatus;

  // Booked items
  @Prop({ type: [BookedSeat], default: [] })
  seats: BookedSeat[];

  @Prop({ type: [BookedTable], default: [] })
  tables: BookedTable[];

  @Prop({ type: [BookedBooth], default: [] })
  booths: BookedBooth[];

  // Customer and payment information
  @Prop({ type: CustomerInfo, required: true })
  customerInfo: CustomerInfo;

  @Prop({ type: PaymentInfo, required: true })
  paymentInfo: PaymentInfo;

  // Booking metadata
  @Prop({ required: true })
  totalTickets: number;

  @Prop()
  notes?: string;

  @Prop()
  qrCode?: string;

  @Prop()
  ticketPdf?: string;

  // Lock information for payment processing
  @Prop()
  lockExpiry?: Date;

  @Prop({ default: false })
  isLocked: boolean;

  @Prop()
  lockedBy?: string;

  // Cancellation information
  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancellationReason?: string;

  // Refund information
  @Prop()
  refundAmount?: number;

  @Prop()
  refundDate?: Date;

  @Prop()
  refundTransactionId?: string;

  // Check-in information
  @Prop()
  checkedInAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  checkedInBy?: Types.ObjectId;

  @Prop({ default: false })
  isCheckedIn: boolean;
}

export const EventTicketBookingSchema = SchemaFactory.createForClass(EventTicketBooking);

// Indexes for optimal query performance
EventTicketBookingSchema.index({ eventId: 1, status: 1 });
EventTicketBookingSchema.index({ userId: 1, status: 1 });
EventTicketBookingSchema.index({ bookingReference: 1 }, { unique: true });
EventTicketBookingSchema.index({ 'customerInfo.email': 1 });
EventTicketBookingSchema.index({ 'customerInfo.phone': 1 });
EventTicketBookingSchema.index({ createdAt: -1 });
EventTicketBookingSchema.index({ lockExpiry: 1 }, { sparse: true });

// Pre-save middleware for booking reference generation
EventTicketBookingSchema.pre('save', function() {
  if (this.isNew && !this.bookingReference) {
    this.bookingReference = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
});

// Instance methods
EventTicketBookingSchema.methods.getTotalItems = function() {
  return this.seats.length + this.tables.length + this.booths.length;
};

EventTicketBookingSchema.methods.canBeCancelled = function() {
  return this.status === TicketStatus.CONFIRMED || this.status === TicketStatus.PENDING;
};

EventTicketBookingSchema.methods.isExpired = function() {
  return this.lockExpiry && new Date() > this.lockExpiry;
};

EventTicketBookingSchema.methods.releaseLock = function() {
  this.isLocked = false;
  this.lockExpiry = undefined;
  this.lockedBy = undefined;
  return this.save();
};

// Static methods
EventTicketBookingSchema.statics.findByEvent = function(eventId: string, status?: TicketStatus) {
  const query: any = { eventId: new Types.ObjectId(eventId) };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

EventTicketBookingSchema.statics.findExpiredLocks = function() {
  return this.find({
    isLocked: true,
    lockExpiry: { $lt: new Date() }
  });
};

EventTicketBookingSchema.statics.getEventBookingStats = function(eventId: string) {
  return this.aggregate([
    { $match: { eventId: new Types.ObjectId(eventId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$paymentInfo.total' },
        totalTickets: { $sum: '$totalTickets' }
      }
    }
  ]);
};
