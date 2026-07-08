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

  @Prop()
  holdId?: string;

  // Set when a payment is captured but booths could not be secured (hold expired
  // before the gateway callback). Flags the booking for a manual/automatic refund.
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

export const BoothBookingSchema = SchemaFactory.createForClass(BoothBooking);
BoothBookingSchema.index({ userId: 1, eventId: 1 });
BoothBookingSchema.index({ status: 1, expiresAt: 1 });
BoothBookingSchema.index({ needsRefund: 1 });
