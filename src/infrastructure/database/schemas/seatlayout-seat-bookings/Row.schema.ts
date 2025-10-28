import { Prop,Schema, SchemaFactory } from "@nestjs/mongoose";
import {  Types } from "mongoose";

@Schema({timestamps:true})
export class Row {
  @Prop({ required: true })
  name: string; 

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Seat' }] })
  seats: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'SubSection' })
  subSectionId: Types.ObjectId;
}

export const RowSchema = SchemaFactory.createForClass(Row);
