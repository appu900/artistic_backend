import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatLayoutDocument = SeatLayout & Document;

export enum SeatMapItemType {
  SEAT = 'seat',
  ENTRY = 'entry',
  EXIT = 'exit',
  WASHROOM = 'washroom',
  SCREEN = 'screen',
  STAGE = 'stage',
  TABLE = 'table',
  BOOTH = 'booth',
}

export enum TableShape {
  ROUND = 'round',
  RECT = 'rect',
  HALF = 'half',
  TRIANGLE = 'triangle',
}

@Schema({ _id: false })
export class SeatCategory {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true })
  price: number;
}

@Schema({ _id: false })
export class SeatMapItem {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: Object.values(SeatMapItemType) })
  type: SeatMapItemType;

  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop({ required: true })
  w: number;

  @Prop({ required: true })
  h: number;

  @Prop()
  rotation?: number;

  @Prop()
  categoryId?: string;

  @Prop()
  label?: string;

  @Prop({ enum: Object.values(TableShape) })
  shape?: TableShape;

  @Prop()
  rowLabel?: string;

  @Prop()
  seatNumber?: number;

  // For tables: number of seats around the table
  @Prop()
  tableSeats?: number;

  // For seat groups: number of seats in this group
  @Prop()
  seatCount?: number;

  // Reference to actual Seat document (for booking)
  @Prop({ type: Types.ObjectId, ref: 'Seat' })
  seatId?: Types.ObjectId;

  // Reference to Section
  @Prop({ type: Types.ObjectId, ref: 'Section' })
  sectionId?: Types.ObjectId;

  // Reference to SubSection
  @Prop({ type: Types.ObjectId, ref: 'SubSection' })
  subSectionId?: Types.ObjectId;

  // Reference to Row
  @Prop({ type: Types.ObjectId, ref: 'Row' })
  rowId?: Types.ObjectId;
}

@Schema({ timestamps: true })
export class SeatLayout {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'VenueOwnerProfile' })
  venueOwnerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event' })
  eventId?: Types.ObjectId;

  @Prop({ type: [SeatMapItem], default: [] })
  items: SeatMapItem[];

  @Prop({ type: [SeatCategory], default: [] })
  categories: SeatCategory[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Section' }] })
  sections: Types.ObjectId[];

  @Prop({ default: 1200 })
  canvasW: number;

  @Prop({ default: 700 })
  canvasH: number;

  @Prop({ default: false })
  isActive: boolean;
}

export const SeatLayoutSchema = SchemaFactory.createForClass(SeatLayout);
