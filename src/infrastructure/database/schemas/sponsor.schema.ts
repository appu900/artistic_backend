import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type SponsorDocument = Sponsor & Document;

@Schema({ timestamps: true })
export class Sponsor {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  logo: string;

  @Prop()
  website?: string;

  @Prop()
  description?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop()
  altText?: string;

  @Prop({ 
    type: String, 
    enum: ['platinum', 'gold', 'silver', 'bronze', 'partner'],
    default: 'partner'
  })
  tier: string;

  @Prop({ default: Date.now })
  startDate: Date;

  @Prop()
  endDate?: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  createdBy: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updatedBy?: mongoose.Types.ObjectId;
}

export const SponsorSchema = SchemaFactory.createForClass(Sponsor);

SponsorSchema.index({ order: 1 });
SponsorSchema.index({ isActive: 1 });
SponsorSchema.index({ isFeatured: 1 });
SponsorSchema.index({ tier: 1 });
SponsorSchema.index({ startDate: 1, endDate: 1 });
