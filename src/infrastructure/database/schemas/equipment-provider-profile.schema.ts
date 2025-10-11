import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentProviderProfileDocument = EquipmentProviderProfile & Document;

@Schema({ timestamps: true })
export class EquipmentProviderProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  addedBy?: Types.ObjectId;

  @Prop({ default: '' })
  companyName: string;

  @Prop({ default: '' })
  businessDescription: string;

  @Prop({ default: '' })
  businessAddress: string;

  @Prop({ default: '' })
  website: string;

  @Prop({ default: '' })
  businessLicense: string;

  @Prop({ default: '' })
  taxId: string;

  @Prop({ type: [String], default: [] })
  serviceAreas: string[];

  @Prop({ type: [String], default: [] })
  specializations: string[];

  @Prop({ type: Number, default: 0 })
  yearsInBusiness: number;

  @Prop({ default: '' })
  logoUrl: string;

  @Prop({ default: '' })
  coverImageUrl: string;

  @Prop({ type: Number, default: 0 })
  totalBookings: number;

  @Prop({ type: Number, default: 0 })
  rating: number;

  @Prop({ type: Number, default: 0 })
  reviewCount: number;

  @Prop({ default: true })
  isVerified: boolean;

  @Prop({ default: true })
  acceptingBookings: boolean;
}

export const EquipmentProviderProfileSchema = SchemaFactory.createForClass(EquipmentProviderProfile);