import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CartRepository } from './cart.repository';
import { Types } from 'mongoose';

@Injectable()
export class CartService {
  constructor(private readonly cartRepo: CartRepository) {}
  async getCart(userId: string) {
    return await this.cartRepo.findUserCart(new Types.ObjectId(userId));
  }

  private getHoursArray(startTime: string, endTime: string): number[] {
    const startHour = parseInt(startTime.split(':')[0], 10);
    const endHour = parseInt(endTime.split(':')[0], 10);
    if (isNaN(startHour) || isNaN(endHour) || endHour <= startHour) {
      throw new BadRequestException('Invalid startTime or endTime');
    }
    return Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  }
  async addToCart(
    userId: string,
    dto: {
      artistId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      hours: number;
      totalPrice: number;
    },
  ) {
    const { artistId, bookingDate, startTime, endTime, hours, totalPrice } =
      dto;
    const bookingDateObj = new Date(bookingDate);
    bookingDateObj.setUTCHours(0, 0, 0, 0);
    const createdItem = await this.cartRepo.addItem(
      new Types.ObjectId(userId),
      {
        artistId: new Types.ObjectId(artistId),
        bookingDate: bookingDateObj,
        startTime,
        endTime,
        hours,
        totalPrice,
      },
    );
    return createdItem;
  }

  async removeItem(userId: string, itemId: string) {
    return this.cartRepo.removeItem(
      new Types.ObjectId(userId),
      new Types.ObjectId(itemId),
    );
  }

  async clearCart(userId: string) {
    return this.cartRepo.clearCart(new Types.ObjectId(userId));
  }
}
