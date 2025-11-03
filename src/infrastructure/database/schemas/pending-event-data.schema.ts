import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingEventDataDocument = PendingEventData & Document;

@Schema({ timestamps: true })
export class PendingEventData {
  @Prop({ required: true, unique: true, index: true })
  comboBookingId: string;

  @Prop({ type: Object, required: true })
  eventData: Record<string, any>;

  @Prop({ type: Array, default: [] })
  selectedArtists: any[];

  @Prop({ type: Array, default: [] })
  selectedEquipment: any[];

  @Prop({ type: Object })
  coverPhotoInfo: {
    name?: string;
    size?: number;
    type?: string;
  };

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  token: string;

  @Prop({ type: String, enum: ['pending', 'completed', 'expired'], default: 'pending' })
  status: string;

  @Prop({ type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }) // 24 hours expiry
  expiresAt: Date;
}

export const PendingEventDataSchema = SchemaFactory.createForClass(PendingEventData);

// Create TTL index to auto-delete expired records
PendingEventDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
