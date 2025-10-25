import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketBookingDocument = TicketBooking & Document;

@Schema({ timestamps: true })
export class TicketBooking {
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
    enum: ['confirmed', 'cancelled'],
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
}

export const TicketBookingSchema = SchemaFactory.createForClass(TicketBooking);
TicketBookingSchema.index({ userId: 1, eventId: 1 });
TicketBookingSchema.index({ status: 1, expiresAt: 1 });
