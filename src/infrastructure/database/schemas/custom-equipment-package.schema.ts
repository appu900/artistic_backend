import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CustomPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export type CustomEquipmentPackageDocument = CustomEquipmentPackage & Document;

@Schema({ timestamps: true })
export class CustomEquipmentPackage {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    type: [
      {
        equipmentId: { type: Types.ObjectId, ref: 'Equipment', required: true },
        quantity: { type: Number, required: true, min: 1 },
        pricePerDay: { type: Number, required: true, min: 0 }, // Store price at time of package creation
      },
    ],
    required: true,
  })
  items: {
    equipmentId: Types.ObjectId;
    quantity: number;
    pricePerDay: number;
  }[];

  @Prop({ required: true, min: 0 })
  totalPricePerDay: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ 
    type: String, 
    enum: CustomPackageStatus, 
    default: CustomPackageStatus.ACTIVE 
  })
  status: CustomPackageStatus;

  @Prop({ default: false })
  isPublic: boolean; 

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({ default: '' })
  notes: string; 
}

export const CustomEquipmentPackageSchema = SchemaFactory.createForClass(CustomEquipmentPackage);