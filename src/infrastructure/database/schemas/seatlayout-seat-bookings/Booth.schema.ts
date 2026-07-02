import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoothDocument = Booth & Document;

@Schema({ timestamps: true })
export class Booth {
  @Prop({ required: true })
  booth_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SeatLayout' })
  layoutId: Types.ObjectId;

  @Prop({ required: true, type: Object })
  pos: { x: number; y: number };

  @Prop({ required: true, type: Object })
  size: { x: number; y: number };

  @Prop({ default: 0 })
  rot?: number;

  @Prop()
  lbl?: string;

  @Prop({ required: true })
  catId: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: 'available', enum: ['available', 'booked', 'blocked', 'locked'] })
  bookingStatus: string;

  // Lock metadata for in-progress payments
  @Prop()
  lockExpiry?: Date;

  @Prop()
  lockedBy?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;
}

export const BoothSchema = SchemaFactory.createForClass(Booth);
BoothSchema.index({ layoutId: 1, bookingStatus: 1, lockExpiry: 1 });
BoothSchema.index({ booth_id: 1, layoutId: 1 }, { unique: true });
