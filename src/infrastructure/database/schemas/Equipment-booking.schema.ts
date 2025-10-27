import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentBookingDocument = EquipmentBooking & Document;

@Schema({ timestamps: true })
export class EquipmentBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
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
  packages?: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'CustomEquipmentPackage', default: [] })
  customPackages?: Types.ObjectId[];

  @Prop({ required: true })
  date: string;

  @Prop({
    type: [
      {
        date: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
    ],
    default: [],
  })
  equipmentDates?: {
    date: string;
    startTime: string;
    endTime: string;
  }[];

  @Prop({ type: Boolean, default: false })
  isMultiDay?: boolean;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({
    enum: ['PENDING', 'CONFIRMED', 'CANCEL'],
    default: 'PENDING',
  })
  paymentStatus: string;

  @Prop({ type: Types.ObjectId, ref: 'PaymentsLog' })
  paymentLogId?: Types.ObjectId;

  @Prop({ type: Number, required: true })
  totalPrice: number;

  @Prop({ type: Types.ObjectId, ref: 'GlobalBooking', default: null })
  globalBookingRef?: Types.ObjectId; // reference if combined booking

  @Prop({ type: Types.ObjectId, ref: 'CombineBooking', default: null })
  combineBookingRef?: Types.ObjectId; // reference to combined booking

  @Prop({})
  address?: string;
}

export const EquipmentBookingSchema =
  SchemaFactory.createForClass(EquipmentBooking);
