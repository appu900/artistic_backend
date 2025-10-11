import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/roles.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  phoneNumber: string;

  @Prop({ enum: Object.values(UserRole), default: UserRole.NORMAL })
  role: UserRole;

  @Prop({ type: Types.ObjectId, refPath: 'roleProfileRef', default: null })
  roleProfile?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['ArtistProfile', 'VenueOwnerProfile', 'EquipmentProviderProfile'],
    required: false,
  })
  roleProfileRef?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  permissions?: string[];

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: null })
  lastLoginAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  addedBy?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);