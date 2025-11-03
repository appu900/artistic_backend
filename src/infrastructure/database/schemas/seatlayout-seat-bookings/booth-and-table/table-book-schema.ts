import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TableBookingDocument = TableBooking & Document;

@Schema({ timestamps: true })
export class TableBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Table' }], required: true })
  tableIds: Types.ObjectId[];

  @Prop({ type: [String] })
  tableNumbers?: string[];

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

export const TableBookingSchema = SchemaFactory.createForClass(TableBooking);
TableBookingSchema.index({ userId: 1, eventId: 1 });
// Removed TTL index to prevent automatic deletion - Bull queue handles expiry instead
// TableBookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
