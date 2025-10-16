import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TermsType {
  ARTIST_BOOKING_PAYMENT = 'ARTIST-BOOKING-PAYMENT',
  EQUIPMENT_BOOKING_PAYMENT = 'EQUIPMENT-BOOKING-PAYMENT', 
  GENERAL_BOOKING = 'GENERAL-BOOKING',
}

@Schema()
export class SubSection {
  @Prop({ required: true })
  title: string;

  @Prop({ type: [String], required: true })
  descriptions: string[];

  @Prop({ default: Date.now })
  createdAt: Date;
}

@Schema({timestamps:true})
export class Terms extends Document {
    @Prop({required:true, enum:TermsType})
    category:TermsType

    @Prop({required:true})
    name:string

    @Prop({required:true})
    description:string

    @Prop({type:[SubSection], default:[]})
    subSections:SubSection[]

    @Prop({default:1})
    version:number
}


export type TermsDocument = Terms & Document;
export const TermsSchema = SchemaFactory.createForClass(Terms);