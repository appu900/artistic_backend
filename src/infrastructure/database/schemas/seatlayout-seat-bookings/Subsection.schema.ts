import { Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class SubSection {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Row' }] })
  rows: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Section' })
  sectionId: Types.ObjectId;
}

export const SubSectionSchema = SchemaFactory.createForClass(SubSection);
