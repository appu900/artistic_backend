import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentProviderDocument = EquipmentProvider & Document;

@Schema({ timestamps: true })
export class EquipmentProvider {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({default:"EQUIPMENT_PROVIDER"})
  role:String
}

export const EquipmentProviderSchema =
  SchemaFactory.createForClass(EquipmentProvider);
