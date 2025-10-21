

import { Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class Section {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  basePrice: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'SubSection' }] })
  subSections: Types.ObjectId[];

}

export const SectionSchema = SchemaFactory.createForClass(Section);
