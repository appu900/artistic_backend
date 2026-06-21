import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DiscoveryCardDocument = DiscoveryCard &
  Document & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true, collection: 'discovery_cards' })
export class DiscoveryCard {
  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  caption: string;

  @Prop({ required: true, enum: ['image', 'video'] })
  mediaType: 'image' | 'video';

  @Prop({ required: true })
  mediaUrl: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const DiscoveryCardSchema = SchemaFactory.createForClass(DiscoveryCard);

DiscoveryCardSchema.index({ order: 1 });
DiscoveryCardSchema.index({ isActive: 1 });
