import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type TestimonialDocument = Testimonial & Document;

@Schema({ timestamps: true })
export class Testimonial {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  avatar?: string;

  @Prop({ min: 1, max: 5, default: 5 })
  rating: number;

  @Prop()
  company?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  createdBy: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updatedBy?: mongoose.Types.ObjectId;
}

export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);

// Index for efficient queries
TestimonialSchema.index({ order: 1 });
TestimonialSchema.index({ isActive: 1 });
TestimonialSchema.index({ isFeatured: 1 });
TestimonialSchema.index({ rating: -1 });
