import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommissionSettingDocument = HydratedDocument<CommissionSetting>;

@Schema({ timestamps: true })
export class CommissionSetting {
  _id: Types.ObjectId;

  @Prop({ enum: ['artist', 'equipment', 'global'], required: true })
  scope: 'artist' | 'equipment' | 'global';

  @Prop({ type: Number, min: 0, max: 100, required: true, default: 10 })
  percentage: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const CommissionSettingSchema = SchemaFactory.createForClass(CommissionSetting);
CommissionSettingSchema.index({ scope: 1 }, { unique: true });
