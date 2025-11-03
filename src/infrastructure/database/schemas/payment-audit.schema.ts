import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentAuditDocument = HydratedDocument<PaymentAudit>;

@Schema({ timestamps: true })
export class PaymentAudit {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  action: 'commission_update' | 'payout_record' | 'payment_status_update' | 'other';

  @Prop({ type: String })
  entityType?: 'artist' | 'equipment' | 'booking' | 'system';

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ type: Object })
  details?: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  performedBy?: Types.ObjectId;
}

export const PaymentAuditSchema = SchemaFactory.createForClass(PaymentAudit);
PaymentAuditSchema.index({ action: 1, createdAt: -1 });
