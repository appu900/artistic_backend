import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentUnavailableDocument = EquipmentUnavailable & Document;

@Schema({ timestamps: true })
export class EquipmentUnavailable {
  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipment: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: Number, default: 0 })
  unavailableQuantity: number; // e.g. 5 speakers under maintenance
}

export const EquipmentUnavailableSchema =
  SchemaFactory.createForClass(EquipmentUnavailable);
