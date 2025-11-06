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
import { v4 as uuidv4 } from 'uuid';

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
    console.log(seatIds);
    const locks: string[] = [];
    const now = new Date();
    const expires_At = new Date(now.getTime() + 7 * 60 * 1000);
    const holdId = uuidv4();
    try {
      // Preliminary locks on provided identifiers to reduce race conditions
      for (const anyId of seatIds) {
        const key = this.getSeatLockKey(anyId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`Seat ${anyId} is not available`);
        }
        await this.redisService.set(key, userId, 420); // 7 minutes
        locks.push(key);
      }
      this.logger.log('Preliminary seat locks set');

      const objectIds: Types.ObjectId[] = [];
      const domainIds: string[] = [];
      for (const id of seatIds) {
        if (Types.ObjectId.isValid(id)) {
          // Extra check: only treat as ObjectId if it round-trips
          try {
            objectIds.push(new Types.ObjectId(id));
          } catch {
            domainIds.push(String(id));
          }
        } else {
          domainIds.push(String(id));
        }
      }

      // Fetch seats by either _id or seatId, and ensure availability
      const seats = await this.seatModel.find({
        $and: [
          { bookingStatus: { $ne: 'booked' } },
          {
            $or: [
              { lockExpiry: null },
              { lockExpiry: { $lt: now } },
              { lockExpiry: { $exists: false } },
            ],
          },
          { _id: { $in: seatIds } },
        ],
      });

      if (seats.length !== seatIds.length) {
        throw new ConflictException(
          'One or more seats are already booked or invalid',
        );
      }

      // Lock with canonical domain seatId as well, to cover both identifier forms
      for (const s of seats) {
        const canonKey = this.getSeatLockKey(s.seatId);
        if (!(await this.redisService.get(canonKey))) {
          await this.redisService.set(canonKey, userId, 420);
        }
        if (!locks.includes(canonKey)) locks.push(canonKey);
      }

      // Block seats in DB by _id
      const upd = await this.seatModel.updateMany(
        {
          _id: { $in: seats.map((s) => s._id) },
          bookingStatus: { $ne: 'booked' },
          $or: [
            { lockExpiry: null },
            { lockExpiry: { $lt: now } },
            { lockExpiry: { $exists: false } },
          ],
        },
        { $set: { lockedBy: holdId, lockExpiry: expires_At } },
      );

      if (upd.modifiedCount !== seatIds.length) {
        throw new ConflictException('Seat race: please retry');
      }

      // Create booking with status pending
      const totalAmount = seats.reduce((acc, s) => acc + s.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

      const booking = await this.seatBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        seatIds: seats.map((s) => s._id), // store canonical ObjectIds
        seatNumber: seats.map((s) => s.sn ?? s.seatId),
        totalAmount:0.01,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        holdId,
        expiresAt,
      });

      // Enqueue expiry for auto-release after 7 minutes
      const jobBookingid = booking._id as unknown as string;
      await this.bookingExpiryQueue.add(
        'expire-booking',
        { bookingId: jobBookingid },
        { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingid}` },
      );
      this.logger.log(
        `Enqueued booking ${jobBookingid} for seat lock expiry in 7 minutes`,
      );

      // Initiate payment
      const paymentRes = await this.paymenetService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId: userId,
        // amount: parseFloat(totalAmount.toFixed(2)),
        amount:0.01,
        type: BookingType.TICKET,
        customerEmail: userEmail,
        description: 'Seat ticket booking',
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
    } catch (error: any) {
      for (const key of locks) await this.redisService.del(key);
      this.logger.error(`Booking failed: ${error?.message || 'unknown error'}`);
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

    const now = new Date();
    if (booking.expiresAt && booking.expiresAt < now) {
      await this.cancelBooking(bookingId);
      throw new ConflictException('Booking expired. Please try again.');
    }

    // check seat holds are still there..
    const activeSeats = await this.seatModel.find({
      _id: { $in: booking.seatIds },
      lockedBy: booking.holdId,
      lockExpiry: { $gt: now },
    });
    if (activeSeats.length !== booking.seatIds.length) {
      throw new ConflictException('Some seats are no longer available');
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
      {
        _id: { $in: booking.seatIds },
        lockedBy: booking.holdId,
        lockExpiry: { $gt: now },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry:null },
      },
    );
    // ** cancel expiry job
    // const jobId = `expire-booking_${bookingId}`;
    // try {
    //   await this.bookingExpiryQueue.remove(jobId);
    //   this.logger.log(`Removed expiry job ${jobId} after confirmation`);
    // } catch (e) {
    //   this.logger.warn(
    //     `Failed to remove expiry job ${jobId}: ${e?.message || e}`,
    //   );
    // }

    // Get the original seatIds for lock cleanup
    const seats = await this.seatModel.find({ _id: { $in: booking.seatIds } });
    for (const seat of seats) {
      await this.redisService.del(`seat_lock:${seat.seatId}`);
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
    console.log('updated booking document is ,', updated);

    await this.seatModel.updateMany(
      {
        _id: { $in: booking.seatIds },
        bookingStatus: { $ne: 'booked' },
        lockedBy: booking.holdId,
      },
      {
        $unset: { lockedBy: '', lockExpiry:null },
        $set: { bookingStatus: 'available' },
      },
    );

    // Get the original seatIds for lock cleanup
    const seats = await this.seatModel.find({ _id: { $in: booking.seatIds } });
    for (const seat of seats) {
      await this.redisService.del(`seat_lock:${seat.seatId}`);
    }

    // Remove expiry job if present
    const jobId = `expire-booking_${bookingId}`;
    try {
      await this.bookingExpiryQueue.remove(jobId);
      this.logger.log(`Removed expiry job ${jobId} after cancellation`);
    } catch {}
    this.logger.warn(`Booking ${booking._id} cancelled`);
  }

  async getBookingDeatils(bookingId: string) {
    console.log(bookingId);
    const id = new Types.ObjectId(bookingId);
    const booking = await this.seatBookingModel.findById(id);
    return booking;
  }
}
