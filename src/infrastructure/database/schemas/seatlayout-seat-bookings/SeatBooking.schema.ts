import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatBookingDocument = SeatBooking & Document;

@Schema({ timestamps: true })
export class SeatBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({})
  eventAddress?: string;

  @Prop({})
  seatNumber: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Seat' }], required: true })
  seatIds: Types.ObjectId[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop({
    required: true,
    enum: ['pending', 'confirmed', 'cancelled', 'expired'],
    default: 'pending',
  })
  status: string;

  @Prop()
  paymentId?: string;

  @Prop({
    enum: ['confirmed', 'cancelled', 'pending'],
  })
  paymentStatus?: string;

  @Prop()
  bookedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;


  @Prop()
  holdId?:string

  // Set when a payment is captured but seats could not be secured (e.g. hold
  // expired before the gateway callback). Flags the booking for a manual/automatic refund.
  @Prop({ default: false })
  needsRefund?: boolean;

  @Prop()
  refundReason?: string;

  @Prop({
    type: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
    },
  })
  customerDetails?: {
    name?: string;
    email?: string;
    phone?: string;
  };

  @Prop({
    enum: ['pending', 'validated'],
    default: 'pending',
  })
  attendanceStatus?: string;

  @Prop()
  validatedAt?: Date;

  @Prop()
  validatedBy?: string;

  @Prop()
  validatedViaPortal?: string;
}

export const SeatBookingSchema = SchemaFactory.createForClass(SeatBooking);
SeatBookingSchema.index({ userId: 1, eventId: 1 });
SeatBookingSchema.index({ status: 1, expiresAt: 1 });
// Fast lookup for the ops/refund dashboard.
SeatBookingSchema.index({ needsRefund: 1 });
// Removed TTL index to prevent automatic deletion - Bull queue handles expiry instead
// SeatBookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
