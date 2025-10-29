import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CarouselSlideDocument = CarouselSlide & Document;

@Schema({ timestamps: true })
export class CarouselSlide {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  titleHighlight: string;

  @Prop({ required: true })
  subtitle: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true })
  ctaText: string;

  @Prop({ required: true })
  ctaLink: string;

  @Prop({ required: true })
  category: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop()
  altText?: string;

  @Prop()
  description?: string;

  @Prop({ default: Date.now })
  startDate: Date;

  @Prop()
  endDate?: Date;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy?: string;
}

export const CarouselSlideSchema = SchemaFactory.createForClass(CarouselSlide);

// Index for efficient queries
CarouselSlideSchema.index({ order: 1 });
CarouselSlideSchema.index({ isActive: 1 });
CarouselSlideSchema.index({ isFeatured: 1 });
CarouselSlideSchema.index({ startDate: 1, endDate: 1 });