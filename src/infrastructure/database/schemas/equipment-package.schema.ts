import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PackageStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum PackageVisibility {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export type EquipmentPackageDocument = EquipmentPackage & Document;

@Schema({ timestamps: true })
export class EquipmentPackage {
  @Prop({ default: '' })
  name?: string;

  @Prop({ required: true })
  description: string;

  @Prop({ default: null })
  imageUrl?: string;

  @Prop({ type: [String], default: [] })
  images?: string[];

  @Prop({ default: null })
  coverImage?: string;

  @Prop({
    type: [
      {
        equipmentId: { type: Types.ObjectId, ref: 'Equipment', required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    required: true,
  })
  items: {
    equipmentId: Types.ObjectId;
    quantity: number;
  }[];

  @Prop({ required: true })
  totalPrice: Number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PackageStatus),
    default: PackageStatus.DRAFT,
  })
  status: PackageStatus;



  @Prop({required:true})
  roleRef:string

  @Prop({
    type: String,
    enum: Object.values(PackageVisibility),
    default: PackageVisibility.OFFLINE,
  })
  visibility: PackageVisibility;

  @Prop({ default: null })
  adminNotes?: string;
}


export const EquipmentPackageSchema = SchemaFactory.createForClass(EquipmentPackage)