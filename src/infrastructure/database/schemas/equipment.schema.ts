import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentDocument = Equipment & Document;

export enum EquipmentCategory {
  SOUND = 'SOUND',
  DISPLAY = 'DISPLAY',
  LIGHT = 'LIGHT',
  CAMERA = 'CAMERA',
  STAGING = 'STAGING',
  POWER = 'POWER',
  TRANSPORT = 'TRANSPORT',
  OTHER = 'OTHER',
}

export enum EquipmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
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

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  provider: Types.ObjectId;

  @Prop({ 
    type: String, 
    enum: EquipmentStatus, 
    default: EquipmentStatus.ACTIVE 
  })
  status: EquipmentStatus;
}

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);
