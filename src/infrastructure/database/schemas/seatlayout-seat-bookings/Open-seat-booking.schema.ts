// open-booking-layout.schema.ts
// this is the running schema for ticket booking 
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OpenBookingLayoutDocument = OpenBookingLayout & Document;

@Schema({ timestamps: true })
export class OpenBookingLayout {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  venueOwnerId: Types.ObjectId;

  @Prop({ type: Array })
  categories: Record<string, any>[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Seat' }] })
  seats: Types.ObjectId[];

  @Prop({ type: Array })
  items: Record<string, any>[];

  @Prop({ type: Object })
  spatialGrid: {
    cellSize: number;
    gridWidth: number;
    gridHeight: number;
    cellIndex: Record<string, Types.ObjectId[]>;
  };

  @Prop({ default: false })
  isDeleted: boolean;
}

export const OpenBookingLayoutSchema =
  SchemaFactory.createForClass(OpenBookingLayout);
