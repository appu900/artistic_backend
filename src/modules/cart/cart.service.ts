import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CartRepository } from './cart.repository';
import { Types } from 'mongoose';
import { InjectModel as InjectMongooseModel } from '@nestjs/mongoose';
import { ArtistProfile, ArtistProfileDocument } from 'src/infrastructure/database/schemas/artist-profile.schema';
import { BookingService } from '../booking/booking.service';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepo: CartRepository,
    @InjectMongooseModel(ArtistProfile.name)
    private readonly artistProfileModel: any,
    private readonly bookingService: BookingService,
  ) {}
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
      selectedEquipmentPackages?: string[];
      selectedCustomPackages?: string[];
      isEquipmentMultiDay?: boolean;
      equipmentEventDates?: Array<{ date: string; startTime: string; endTime: string }>;
      userDetails?: { name: string; email: string; phone: string };
      venueDetails?: {
        address: string;
        city: string;
        state: string;
        country: string;
        postalCode?: string;
        venueType?: string;
        additionalInfo?: string;
      };
    },
  ) {
    const { artistId, bookingDate, startTime, endTime, hours, totalPrice } =
      dto;
    // Resolve artist user id from profile if needed
    let artistUserId: string | null = null;
    const artistProfile: ArtistProfileDocument | null = await this.artistProfileModel.findById(
      artistId,
    );
    if (artistProfile) {
      artistUserId = artistProfile.user?.toString();
    } else {
      // if artistId is actually the user id, try to find profile by user
      const byUser = await this.artistProfileModel.findOne({ user: artistId });
      if (byUser) {
        artistUserId = byUser.user?.toString();
      }
    }

    if (!artistUserId) {
      throw new BadRequestException('Invalid artist reference');
    }

    // Validate availability early to surface conflicts
    await this.bookingService.validateArtistAvalibility(
      artistUserId,
      startTime,
      endTime,
      bookingDate,
    );
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
        selectedEquipmentPackages: (dto.selectedEquipmentPackages || []).map((id) => new Types.ObjectId(id) as any),
        selectedCustomPackages: (dto.selectedCustomPackages || []).map((id) => new Types.ObjectId(id) as any),
        isEquipmentMultiDay: !!dto.isEquipmentMultiDay,
        equipmentEventDates: dto.equipmentEventDates || [],
        userDetails: dto.userDetails || null,
        venueDetails: dto.venueDetails || null,
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

  async checkout(userId: string) {
    // Load cart items
    const cart: any = await this.cartRepo.findUserCart(new Types.ObjectId(userId));
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const conflicts: any[] = [];
    // Validate all items
    for (const item of cart.items) {
      const profile = item.artistId; // populated ArtistProfile with user
      const artistUserId = profile?.user?.toString();
      if (!artistUserId) {
        conflicts.push({ itemId: item._id, reason: 'Artist mapping missing' });
        continue;
      }
      try {
        await this.bookingService.validateArtistAvalibility(
          artistUserId,
          item.startTime,
          item.endTime,
          item.bookingDate.toISOString().split('T')[0],
        );
      } catch (e: any) {
        conflicts.push({
          itemId: item._id,
          artistId: profile?._id,
          date: item.bookingDate,
          startTime: item.startTime,
          endTime: item.endTime,
          message: e?.message || 'Unavailable',
        });
      }
    }

    if (conflicts.length > 0) {
      throw new ConflictException({ message: 'Some items have conflicts', conflicts });
    }

    // Group items by same combo (artist + equipment selection + venue)
    const groups = new Map<string, any>();
    for (const item of cart.items) {
      const profile = item.artistId;
      const artistProfileId = profile?._id?.toString?.() || profile?.toString?.();
      // Normalize selected package refs to string ObjectIds, even if populated docs are present
      const normalizeIds = (arr: any[] = []) =>
        arr
          .map((val: any) =>
            typeof val === 'string'
              ? val
              : val?._id?.toString?.() ?? val?.toString?.(),
          )
          .filter((v: any) => typeof v === 'string' && v.length > 0)
          .sort();
      const eqIds = normalizeIds(item.selectedEquipmentPackages);
      const customIds = normalizeIds(item.selectedCustomPackages);
      const venueKey = item?.venueDetails
        ? `${item.venueDetails.address || ''}|${item.venueDetails.city || ''}|${item.venueDetails.state || ''}|${item.venueDetails.country || ''}`
        : 'no-venue';
      const key = [artistProfileId, eqIds.join(','), customIds.join(','), venueKey].join('#');
      if (!groups.has(key)) {
        groups.set(key, {
          artistProfileId,
          eqIds,
          customIds,
          venueDetails: item.venueDetails || null,
          userDetails: item.userDetails || null,
          isEquipmentMultiDay: !!item.isEquipmentMultiDay,
          equipmentEventDates: item.equipmentEventDates || [],
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }

    const created: any[] = [];
    for (const [key, group] of groups.entries()) {
      const artistProfileId = group.artistProfileId;
      const eventDates = group.items
        .map((i: any) => ({
          date: new Date(i.bookingDate).toISOString().split('T')[0],
          startTime: i.startTime,
          endTime: i.endTime,
        }))
        .sort((a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const hasEquipment = group.eqIds.length > 0 || group.customIds.length > 0;
      const pricing = await this.bookingService.calculateBookingPricing(
        eventDates.length > 1
          ? {
              artistId: artistProfileId,
              eventType: 'private' as any,
              eventDates,
              selectedEquipmentPackages: group.eqIds,
              selectedCustomPackages: group.customIds,
            }
          : {
              artistId: artistProfileId,
              eventType: 'private' as any,
              eventDate: eventDates[0].date,
              startTime: eventDates[0].startTime,
              endTime: eventDates[0].endTime,
              selectedEquipmentPackages: group.eqIds,
              selectedCustomPackages: group.customIds,
            },
      );

      const combinedDto: any = {
        artistId: artistProfileId,
        bookedBy: userId,
        eventType: 'private',
        isArtistMultiDay: eventDates.length > 1,
        artistEventDates: eventDates.length > 1 ? eventDates : undefined,
        eventDate: eventDates.length === 1 ? eventDates[0].date : undefined,
        startTime: eventDates.length === 1 ? eventDates[0].startTime : undefined,
        endTime: eventDates.length === 1 ? eventDates[0].endTime : undefined,
        isEquipmentMultiDay: group.isEquipmentMultiDay || eventDates.length > 1,
        equipmentEventDates:
          (group.isEquipmentMultiDay && group.equipmentEventDates?.length > 0)
            ? group.equipmentEventDates
            : (eventDates.length > 1 ? eventDates : undefined),
        artistPrice: pricing?.artistFee?.amount || 0,
        equipmentPrice: pricing?.equipmentFee?.amount || 0,
        totalPrice: pricing?.totalAmount || pricing?.artistFee?.amount || 0,
        userDetails: group.userDetails || undefined,
        venueDetails:
          group.venueDetails || {
            address: 'Cart booking address',
            city: '',
            state: '',
            country: '',
          },
        selectedEquipmentPackages: group.eqIds,
        selectedCustomPackages: group.customIds,
      };

      const res = await this.bookingService.createCombinedBooking(combinedDto);
      created.push(res);
    }

  await this.cartRepo.removeAllItemsFromCart(new Types.ObjectId(userId));

    return { message: 'Checkout complete', createdCount: created.length, details: created };
  }

  async validateCart(userId: string) {
    const cart: any = await this.cartRepo.findUserCart(new Types.ObjectId(userId));
    if (!cart || !cart.items || cart.items.length === 0) {
      return { conflicts: [] };
    }

    const conflicts: any[] = [];
    for (const item of cart.items) {
      const profile = item.artistId;
      const artistUserId = profile?.user?.toString();
      if (!artistUserId) {
        conflicts.push({ itemId: item._id, reason: 'Artist mapping missing' });
        continue;
      }
      try {
        await this.bookingService.validateArtistAvalibility(
          artistUserId,
          item.startTime,
          item.endTime,
          item.bookingDate.toISOString().split('T')[0],
        );
      } catch (e: any) {
        conflicts.push({
          itemId: item._id,
          artistId: profile?._id,
          date: item.bookingDate,
          startTime: item.startTime,
          endTime: item.endTime,
          message: e?.message || 'Unavailable',
        });
      }
    }

    return { conflicts };
  }
}
