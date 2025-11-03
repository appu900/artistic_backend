import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PayoutDocument = HydratedDocument<Payout>;

@Schema({ timestamps: true })
export class Payout {
  _id: Types.ObjectId;

  @Prop({ enum: ['artist', 'equipment'], required: true })
  recipientType: 'artist' | 'equipment';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  roleProfileId?: Types.ObjectId;

  @Prop({ type: String })
  recipientName?: string;

  @Prop({ type: Types.ObjectId })
  bookingId?: Types.ObjectId;

  @Prop({ type: Number, min: 0, required: true })
  grossAmount: number;

  @Prop({ type: Number, min: 0, max: 100, required: true })
  commissionPercentage: number;

  @Prop({ type: Number, min: 0, required: true })
  netAmount: number;

  @Prop({ type: String, enum: ['manual', 'bank_transfer', 'cash', 'other'], default: 'manual' })
  method: 'manual' | 'bank_transfer' | 'cash' | 'other';

  @Prop({ type: String })
  reference?: string;

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: String, default: 'paid', enum: ['pending', 'paid', 'failed', 'cancelled'] })
  payoutStatus: 'pending' | 'paid' | 'failed' | 'cancelled';

  @Prop({ type: String, default: 'recorded' })
  status: 'recorded' | 'sent' | 'failed';

  @Prop({ type: String, default: 'KWD' })
  currency: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);
PayoutSchema.index({ recipientType: 1, recipientId: 1, createdAt: -1 });
// Ensure only one payout exists per booking and recipient type (and recipient)
PayoutSchema.index(
  { bookingId: 1, recipientType: 1, recipientId: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingId: { $exists: true } },
    name: 'uniq_booking_recipient_payout'
  }
);
