import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventAttendancePortalDocument = EventAttendancePortal & Document;

@Schema({ timestamps: true })
export class EventAttendancePortal {
  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, unique: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  portalToken: string;

  @Prop({ required: true })
  pinHash: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  label?: string;
}

export const EventAttendancePortalSchema = SchemaFactory.createForClass(EventAttendancePortal);
