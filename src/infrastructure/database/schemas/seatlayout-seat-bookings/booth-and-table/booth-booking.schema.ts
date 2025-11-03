import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoothBookingDocument = BoothBooking & Document;

@Schema({ timestamps: true })
export class BoothBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Booth' }], required: true })
  boothIds: Types.ObjectId[];

  @Prop({ type: [String] })
  boothNumbers?: string[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop({
    required: true,
    enum: ['pending', 'confirmed', 'cancelled', 'expired'],
    default: 'pending',
  })
  status: string;

  @Prop({ enum: ['confirmed', 'cancelled', 'pending'] })
  paymentStatus?: string;

  @Prop()
  paymentId?: string;

  @Prop()
  bookedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;
}

export const BoothBookingSchema = SchemaFactory.createForClass(BoothBooking);
BoothBookingSchema.index({ userId: 1, eventId: 1 });
// Removed TTL index to prevent automatic deletion - Bull queue handles expiry instead
// BoothBookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
