import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PortfolioItemDocument = PortfolioItem & Document;

export enum PortfolioItemType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio'
}

export enum PortfolioItemStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

@Schema({ timestamps: true })
export class PortfolioItem {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ 
    required: true, 
    enum: Object.values(PortfolioItemType),
    type: String 
  })
  type: PortfolioItemType;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ 
    required: true, 
    enum: Object.values(PortfolioItemStatus),
    type: String,
    default: PortfolioItemStatus.PENDING
  })
  status: PortfolioItemStatus;

  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artistProfile: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  artistUser: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewComment?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  likes: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const PortfolioItemSchema = SchemaFactory.createForClass(PortfolioItem);