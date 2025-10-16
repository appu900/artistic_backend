import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { ArtistTypeDocument } from 'src/infrastructure/database/schemas/artist-type.schema';
import {
  CombineBooking,
  CombineBookingDocument,
} from 'src/infrastructure/database/schemas/Booking.schema';
import {
  EquipmentBooking,
  EquipmentBookingDocument,
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import {
  EquipmentPackage,
  EquipmentPackageDocument,
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class UserBookingAnalyticsService {
  constructor(
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(EquipmentBooking.name)
    private equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(CombineBooking.name)
    private combineBookingModel: Model<CombineBookingDocument>,
    @InjectModel(EquipmentPackage.name)
    private equipmentPackageModel: Model<EquipmentPackageDocument>,
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(ArtistProfile.name)
    private artistModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  //   ** fetch all booking for user ( artist,equipment,combined) for a given userId
  // ** response format will split into time [ upcoming,and past]

  async getUserArtistBooking(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    const bookings = await this.artistBookingModel
      .find({ bookedBy: objectUserId })
      .populate({
        path: 'artistId',
        model: 'User',
        select: 'firstName lastName roleProfile roleProfileRef',
        populate: {
          path: 'roleProfile',
          model: 'ArtistProfile',
          select: 'stageName profileImage pricePerHour category',
        },
      })
      .sort({ date: -1 })
      .lean();

    const today = new Date();
    const upcoming: any[] = [];
    const past: any[] = [];

    for (const b of bookings) {
      const artist = b.artistId as unknown as any;

      const formatted = {
        _id: b._id,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        artistType: b.artistType,
        status: b.status,
        price: b.price,
        address: b.address,
        artist: {
          name: `${artist?.firstName ?? ''} ${artist?.lastName ?? ''}`.trim(),
          stageName: artist?.roleProfile?.stageName ?? null,
          profileImage: artist?.roleProfile?.profileImage ?? null,
          pricePerHour: artist?.roleProfile?.pricePerHour ?? null,
          category: artist?.roleProfile?.category ?? null,
        },
      };

      // Compare using only date part (ignore time)
      const bookingDate = new Date(b.date);
      if (bookingDate >= today) {
        upcoming.push(formatted);
      } else {
        past.push(formatted);
      }
    }

    return {
      upcoming,
      past,
    };
  }

  // ** get equipment booking deatils

  async getUserEquipmentBookings(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    // ✅ populate must go deeper: path: 'equipments.equipmentId'
    const bookings = await this.equipmentBookingModel
      .find({ bookedBy: objectUserId })
      .populate({
        path: 'equipments.equipmentId',
        model: 'Equipment',
        select: 'name imageUrl pricePerHour pricePerDay description category',
      })
      .populate({
        path: 'packages',
        model: 'EquipmentPackage',
        select: 'name description imageUrl coverImage totalPrice items',
        populate: {
          path: 'items.equipmentId',
          model: 'Equipment',
          select: 'name imageUrl pricePerHour pricePerDay category',
        },
      })
      .sort({ date: -1 })
      .lean();

    const today = new Date();
    const upcoming: any[] = [];
    const past: any[] = [];

    for (const b of bookings) {
      // 🧠 Populate equipment details correctly
      const equipmentDetails =
        b.equipments?.map((item: any) => {
          const e = item.equipmentId; // populated Equipment doc
          return {
            name: e?.name ?? null,
            imageUrl: e?.imageUrl ?? null,
            pricePerHour: e?.pricePerHour ?? null,
            pricePerDay: e?.pricePerDay ?? null,
            description: e?.description ?? null,
            category: e?.category ?? null,
            quantity: item.quantity,
          };
        }) ?? [];

      // ✅ Packages also expanded
      const packageDetails =
        b.packages?.map((p: any) => ({
          _id: p._id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          coverImage: p.coverImage,
          totalPrice: p.totalPrice,
          items:
            p.items?.map((i: any) => ({
              equipmentName: i.equipmentId?.name ?? null,
              equipmentImage: i.equipmentId?.imageUrl ?? null,
              quantity: i.quantity,
            })) ?? [],
        })) ?? [];

      const formatted = {
        _id: b._id,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        totalPrice: b.totalPrice,
        address: b.address,
        equipmentDetails,
        packageDetails,
      };

      const bookingDate = new Date(b.date);
      if (bookingDate >= today) {
        upcoming.push(formatted);
      } else {
        past.push(formatted);
      }
    }

    return { upcoming, past };
  }

  async getUserCombineBookings(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    // Step 1: Fetch CombineBookings and populate base references
    const combineBookings = await this.combineBookingModel
      .find({ bookedBy: objectUserId })
      .populate({
        path: 'artistBookingId',
        model: 'ArtistBooking',
        populate: {
          path: 'artistId',
          model: 'User',
          select: 'firstName lastName roleProfile',
          populate: {
            path: 'roleProfile',
            model: 'ArtistProfile',
            select: 'stageName profileImage pricePerHour category',
          },
        },
      })
      .populate({
        path: 'equipmentBookingId',
        model: 'EquipmentBooking',
      })
      .lean();

    // Step 2: Extract equipment booking IDs for repopulation
    const eqBookingIds = combineBookings
      .map((b) => {
        if (
          b.equipmentBookingId &&
          typeof b.equipmentBookingId === 'object' &&
          '_id' in b.equipmentBookingId
        ) {
          return (b.equipmentBookingId as any)._id;
        }
        return null;
      })
      .filter(Boolean) as Types.ObjectId[];

    // Step 3: Populate equipment and packages separately
    const fullEquipmentBookings = await this.equipmentBookingModel
      .find({ _id: { $in: eqBookingIds } })
      .populate({
        path: 'equipments.equipmentId',
        model: 'Equipment',
        select: 'name imageUrl pricePerHour pricePerDay description category',
      })
      .populate({
        path: 'packages',
        model: 'EquipmentPackage',
        select: 'name description imageUrl coverImage totalPrice items',
        populate: {
          path: 'items.equipmentId',
          model: 'Equipment',
          select: 'name imageUrl pricePerHour pricePerDay category',
        },
      })
      .lean();

    const eqMap = new Map(
      fullEquipmentBookings.map((b) => [b._id.toString(), b]),
    );

    // Step 4: Merge and format results
    const populated = combineBookings.map((b) => {
      const artistBooking = b.artistBookingId as any;
      const artistUser = artistBooking?.artistId as any;
      const artistProfile = artistUser?.roleProfile;

      const artist = artistUser
        ? {
            name: `${artistUser.firstName ?? ''} ${artistUser.lastName ?? ''}`.trim(),
            stageName: artistProfile?.stageName ?? null,
            profileImage: artistProfile?.profileImage ?? null,
            pricePerHour: artistProfile?.pricePerHour ?? null,
            category: artistProfile?.category ?? null,
          }
        : null;

      // ✅ Type-safe access to equipment booking
      const eqBookingId =
        typeof b.equipmentBookingId === 'object' &&
        b.equipmentBookingId !== null &&
        '_id' in b.equipmentBookingId
          ? (b.equipmentBookingId as any)._id.toString()
          : null;

      const eqBooking = eqBookingId ? eqMap.get(eqBookingId) : null;

      const equipmentDetails = eqBooking?.equipments?.map((e: any) => ({
        name: e?.equipmentId?.name ?? null,
        imageUrl: e?.equipmentId?.imageUrl ?? null,
        pricePerHour: e?.equipmentId?.pricePerHour ?? null,
        pricePerDay: e?.equipmentId?.pricePerDay ?? null,
        description: e?.equipmentId?.description ?? null,
        category: e?.equipmentId?.category ?? null,
        quantity: e?.quantity ?? 0,
      }));

      const packageDetails = eqBooking?.packages?.map((p: any) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        coverImage: p.coverImage,
        totalPrice: p.totalPrice,
        items:
          p.items?.map((i: any) => ({
            equipmentName: i.equipmentId?.name ?? null,
            equipmentImage: i.equipmentId?.imageUrl ?? null,
            quantity: i.quantity,
          })) ?? [],
      }));

      return {
        _id: b._id,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        totalPrice: b.totalPrice,
        address: b.address,
        artist,
        equipmentDetails: equipmentDetails ?? [],
        packageDetails: packageDetails ?? [],
      };
    });

    return populated;
  }
}
