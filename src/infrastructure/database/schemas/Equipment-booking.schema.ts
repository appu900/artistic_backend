import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentBookingDocument = EquipmentBooking & Document;

@Schema({ timestamps: true })
export class EquipmentBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bookedBy: Types.ObjectId;

  @Prop({
    type: [
      {
        equipmentId: { type: Types.ObjectId, ref: 'Equipment', required: true },
        quantity: { type: Number, required: true },
      },
    ],
    default: [],
  })
  equipments: {
    equipmentId: Types.ObjectId;
    quantity: number;
  }[];

  @Prop({ type: [Types.ObjectId], ref: 'EquipmentPackage', default: [] })
  package?: Types.ObjectId[]; 

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Number, required: true })
  totalPrice: number;

  @Prop({ type: Types.ObjectId, ref: 'GlobalBooking', default: null })
  globalBookingRef?: Types.ObjectId; // reference if combined booking
}

export const EquipmentBookingSchema =
  SchemaFactory.createForClass(EquipmentBooking);
