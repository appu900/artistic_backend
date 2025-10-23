// we need to create cart items and cart for the artist booking
// so user will add artist id , booking date and , time and price how many hour and total price
// so when user proceed to check out of cart cart shulb be empty after chekout and all

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartItemDocument = CartItem & Document;

@Schema({ timestamps: true })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artistId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  bookingDate: Date;

  @Prop({ type: String, required: true })
  startTime: string;

  @Prop({ type: String, required: true })
  endTime: string;

  @Prop({ type: Number, required: true })
  hours: number;

  @Prop({ type: Number, required: true })
  totalPrice: number;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);



export type CartDocument = Cart & Document;
@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'CartItem' }] })
  items: Types.ObjectId[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);
