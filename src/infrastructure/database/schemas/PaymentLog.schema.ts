import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentsLogDocument = PaymentsLog & Document;

@Schema({ timestamps: true })  // Auto-manages createdAt/updatedAt
export class PaymentsLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: ['INR', 'KWD', 'USD'] })  // Add enum for validation
  currency: string;

  @Prop({ 
    required: true, 
    enum: ['PENDING', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED']  // Standard statuses
  })
  status: string;

  @Prop({ required: false })  
  sessionId: string;


  @Prop({ required: false })  
  errorMessage?: string;

  @Prop({ required: true })  
  bookingId: string;

  @Prop({ required: true, enum: ['artist', 'equipment'] })   
  bookingType: string;

  @Prop({ required: true })
  date: Date = new Date();

}

export const PaymentsLogSchema = SchemaFactory.createForClass(PaymentsLog);
PaymentsLogSchema.index({ user: 1, bookingId: 1, status: 1 });