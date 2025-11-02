import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SeatBookDto } from './dto/seatBook.dto';
import { InjectModel } from '@nestjs/mongoose';
import {
  Seat,
  SeatDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { Model, Types } from 'mongoose';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { PaymentService } from 'src/payment/payment.service';
import { BookingType } from '../booking/interfaces/bookingType';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';

@Injectable()
export class seatBookingService {
  private logger = new Logger(seatBookingService.name);
  constructor(
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(SeatBooking.name)
    private seatBookingModel: Model<SeatBookingDocument>,
    private readonly redisService: RedisService,
    private readonly paymenetService: PaymentService,

    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getSeatLockKey(seatId: string) {
    return `seat_lock:${seatId}`;
  }
  async bookSeat(payload: SeatBookDto, userId: string, userEmail: string) {
    const { eventId, seatIds } = payload;
    const locks: string[] = [];
    try {
      //  check redis lock if not set lock for individual seats
      for (const seatId of seatIds) {
        const key = this.getSeatLockKey(seatId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`seat ${seatId} is not avalavil`);
        }
        await this.redisService.set(key, userId, 420);
        locks.push(key);
      }
      this.logger.log('seat locked');

      // validate seat availbility in db
      const seats = await this.seatModel.find({
        _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
        bookingStatus: 'available',
      });
      if (seats.length != seatIds.length) {
        throw new ConflictException('One or more seats are already booked');
      }
      // ** block seats as blocked in DB
      await this.seatModel.updateMany(
        { _id: { $in: seatIds } },
        { $set: { bookingStatus: 'blocked' } },
      );

      // ** steps create booking with status pending
      const totalAmount = seats.reduce((acc, s) => acc + s.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

      const booking = await this.seatBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        seatIds: seatIds.map((id) => new Types.ObjectId(id)),
        seatNumber: seats.map((s) => s.sn ?? s.seatId),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        expiresAt,
      });

      // ** enqueue the bookingid to the expiry queue for auto relese process
      const jobBookingid = booking._id as unknown as string;
      await this.bookingExpiryQueue.add(
        'expire-booking',
        {
          bookingId: booking._id as unknown as string,
        },
        { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingid}` },
      );
      console.log('enqueed to the queue for seatlocking');

      // ** initiate payment here
      const paymentRes = await this.paymenetService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId: userId,
        amount: 0.01,
        type: BookingType.TICKET,
        customerEmail: userEmail,
      });

      this.logger.log(`Created booking ${booking._id} (pending)`);
      const paymentLink = paymentRes.paymentLink;
      const trackId = paymentRes.log?.trackId || null;
      return {
        paymentLink,
        trackId,
        bookingType: BookingType.TICKET,
        bookingId: booking._id,
        message: 'complete payment with in 7 minutes',
      };
    } catch (error) {
      for (const key of locks) await this.redisService.del(key);
      this.logger.error(`Booking failed:${error.mesaage}`);
      throw error;
    }
  }

  async confirmBooking(bookingId: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking)
      throw new NotFoundException(`booking id ${bookingId} not found`);
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
    console.log(
      'booking confirmed ---------------------------bro saved booking',
    );
    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      { $set: { bookingStatus: 'booked', userId: booking.userId } },
    );
    // ** cancel expiry job
    const jobId = `expire-booking_${bookingId}`;
    // await this.bookingExpiryQueue.remove(jobId);

    for (const id of booking.seatIds) {
      await this.redisService.del(`seat_lock:${id.toString()}`);
    }
    this.logger.log(`Booking ${bookingId} confirmed successfully.`);
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
    if (booking.status === 'cancelled' || booking.status === 'expired') {
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
    const updated = await booking.save();
    console.log("updated booking document is ,",updated)

    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      { $set: { bookingStatus: 'available' } },
    );

    for (const id of booking.seatIds) {
      await this.redisService.del(`seat_lock:${id.toString()}`);
    }

    this.logger.warn(`Booking ${booking._id} cancelled`);
  }

  async getBookingDeatils(bookingId: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    return booking;
  }
}
