import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BoothBooking,
  BoothBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import {
  Booth,
  BoothDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PaymentService } from 'src/payment/payment.service';
import { BoothBookDto } from './dto/boothBook.dto';
import { BookingType } from '../booking/interfaces/bookingType';

@Injectable()
export class BoothBookService {
  private logger = new Logger(BoothBookService.name);
  constructor(
    @InjectModel(Booth.name) private readonly boothModel: Model<BoothDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
    private readonly redisService: RedisService,
    private paymentService: PaymentService,
  ) {}

  private getBoothLockKey(boothId: string) {
    return `booth_lock:${boothId}`;
  }

  async bookBooth(payload: BoothBookDto, userId: string, userEmail: string) {
    const { eventId, boothIds } = payload;
    const locks: string[] = [];

    try {
      // 1️⃣ Lock in Redis
      for (const boothId of boothIds) {
        const key = this.getBoothLockKey(boothId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`Booth ${boothId} is not available`);
        }
        await this.redisService.set(key, userId, 420); // lock for 7 minutes
        locks.push(key);
      }
      this.logger.log('Booths locked in Redis');

      // 2️⃣ Validate availability in DB
      const booths = await this.boothModel.find({
        _id: { $in: boothIds.map((id) => new Types.ObjectId(id)) },
        bookingStatus: 'available',
      });

      if (booths.length !== boothIds.length) {
        throw new ConflictException('One or more booths are already booked');
      }

      // Mark as blocked in DB
      await this.boothModel.updateMany(
        { _id: { $in: boothIds } },
        { $set: { bookingStatus: 'blocked' } },
      );

      // Create booking document
      const totalAmount = booths.reduce((acc, b) => acc + b.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

      const booking = await this.boothBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        boothIds: boothIds.map((id) => new Types.ObjectId(id)),
        boothNumbers: booths.map((b) => b.lbl ?? b.name ?? b.booth_id),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        expiresAt,
      });

      // Enqueue expiry job
      const jobBookingId = booking._id as unknown as string;
      //   await this.bookingExpiryQueue.add(
      //     'expire-booking',
      //     { bookingId: jobBookingId, type: 'booth' },
      //     { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingId}` },
      //   );

      this.logger.log(`Booking ${booking._id} enqueued for expiry`);

      // 6️⃣ Initiate payment
      const { paymentLink } = await this.paymentService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId,
        amount: 0.01,
        type: BookingType.BOOTH,
        customerEmail: userEmail,
      });

      this.logger.log(`Created booth booking ${booking._id} (pending)`);

      return {
        paymentLink,
        bookingType: BookingType.BOOTH,
        bookingId: booking._id,
        message: 'Complete payment within 7 minutes to confirm your booking',
      };
    } catch (error) {
      // rollback redis locks
      for (const key of locks) await this.redisService.del(key);
      this.logger.error(`Booking failed: ${error.message}`);
      throw error;
    }
  }

  async confirmBooking(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking)
      throw new NotFoundException(`Booking ID ${bookingId} not found`);

    if (booking.status !== 'pending') {
      throw new ConflictException(`Booking already ${booking.status}`);
    }

    if (booking.expiresAt && booking.expiresAt < new Date()) {
      await this.cancelBooking(bookingId);
      throw new ConflictException('Booking expired. Please try again.');
    }

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    booking.bookedAt = new Date();
    booking.expiresAt = undefined;
    await booking.save();

    await this.boothModel.updateMany(
      { _id: { $in: booking.boothIds } },
      { $set: { bookingStatus: 'booked', userId: booking.userId } },
    );

    const jobId = `expire-booking_${bookingId}`;
    // await this.bookingExpiryQueue.remove(jobId);

    for (const id of booking.boothIds) {
      await this.redisService.del(this.getBoothLockKey(id.toString()));
    }

    this.logger.log(`Booking ${bookingId} confirmed successfully`);
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    if (['cancelled', 'expired'].includes(booking.status)) {
      this.logger.warn(`Booking ${bookingId} already ${booking.status}`);
      return booking;
    }

    if (booking.status === 'confirmed') {
      throw new ConflictException(
        'Booking already confirmed and cannot be cancelled.',
      );
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    await this.boothModel.updateMany(
      { _id: { $in: booking.boothIds } },
      { $set: { bookingStatus: 'available' } },
    );

    for (const id of booking.boothIds) {
      await this.redisService.del(this.getBoothLockKey(id.toString()));
    }

    this.logger.warn(`Booking ${booking._id} cancelled`);
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }
}
