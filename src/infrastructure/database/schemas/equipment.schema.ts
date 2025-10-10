import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentDocument = Equipment & Document;

export enum EquipmentCategory {
  SOUND = 'SOUND',
  DISPLAY = 'DISPLAY',
  LIGHT = 'LIGHT',
  OTHER = 'OTHER',
}

@Schema({ timestamps: true })
export class Equipment {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: EquipmentCategory,
    default: EquipmentCategory.OTHER,
  })
  category: EquipmentCategory;

  @Prop({ required: true })
  imageUrl: string; 

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  pricePerHour: number;

  @Prop({ required: true, min: 0 })
  pricePerDay: number;

  @Prop({ required: true, min: 1 })
  quantity:number

  @Prop({ type: Types.ObjectId, ref: 'EquipmentProvider', required: true })
  provider: Types.ObjectId;
}

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);
