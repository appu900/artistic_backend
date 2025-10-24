import { Module, forwardRef } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { Mongoose } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Cart,
  CartItem,
  CartItemSchema,
  CartSchema,
} from 'src/infrastructure/database/schemas/cart.schema';
import { CartRepository } from './cart.repository';
import { ArtistProfile, ArtistProfileSchema } from 'src/infrastructure/database/schemas/artist-profile.schema';
import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: CartItem.name, schema: CartItemSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
    ]),
    forwardRef(() => BookingModule),
  ],
  controllers: [CartController],
  providers: [CartService, CartRepository],
})
export class CartModule {}
