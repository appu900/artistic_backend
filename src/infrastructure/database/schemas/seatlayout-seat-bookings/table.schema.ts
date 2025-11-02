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

  // Shape of the table for UI rendering (optional)
  @Prop({ enum: ['round', 'rect', 'half', 'triangle'], required: false })
  shp?: string;

  @Prop({ required: true })
  ts: number;

  @Prop({ required: true })
  sc: number;

  @Prop({ default: 'available', enum: ['available', 'booked', 'blocked', 'locked'] })
  bookingStatus: string;

  @Prop({
    type: [
      {
        pos: { x: { type: Number }, y: { type: Number } },
        size: { x: { type: Number }, y: { type: Number } },
        rl: { type: String },
        sn: { type: Number },
      },
    ],
    default: [],
  })
  chairs?: Array<{ pos: { x: number; y: number }; size: { x: number; y: number }; rl?: string; sn?: number }>;
  
}

export const TableSchema = SchemaFactory.createForClass(Table);
