import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentBookingDocument = EquipmentBooking & Document;

@Schema({ timestamps: true })
export class EquipmentBooking {
  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipment: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date; // booking date

  @Prop({ required: true, min: 1 })
  quantity: number; // number of items booked

  @Prop({
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  })
  status: string;
}

export const EquipmentBookingSchema =
  SchemaFactory.createForClass(EquipmentBooking);
