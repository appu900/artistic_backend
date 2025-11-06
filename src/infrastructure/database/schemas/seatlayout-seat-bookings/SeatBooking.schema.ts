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




  
}

export const SeatBookingSchema = SchemaFactory.createForClass(SeatBooking);
SeatBookingSchema.index({ userId: 1, eventId: 1 });
SeatBookingSchema.index({ status: 1, expiresAt: 1 });
// Removed TTL index to prevent automatic deletion - Bull queue handles expiry instead
// SeatBookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
