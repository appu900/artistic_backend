// table.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TableDocument = Table & Document;

@Schema({ timestamps: true })
export class Table {
  @Prop({ required: true })
  table_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true })
  layoutId: Types.ObjectId;

  @Prop({ required: true, type: { x: Number, y: Number } })
  pos: { x: number; y: number };

  @Prop({ required: true, type: { x: Number, y: Number } })
  size: { x: number; y: number };

  @Prop({ default: 0 })
  rot?: number;

  @Prop()
  lbl?: string;

  @Prop({ required: true })
  catId: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  ts: number;

  @Prop({ required: true })
  sc: number;

  @Prop({ default: 'available', enum: ['available', 'booked', 'blocked','expired'] })
  bookingStatus: string;

  
}

export const TableSchema = SchemaFactory.createForClass(Table);
