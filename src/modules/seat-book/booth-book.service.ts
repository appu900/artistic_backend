import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
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
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BoothBookService {
  private logger = new Logger(BoothBookService.name);
  constructor(
    @InjectModel(Booth.name) private readonly boothModel: Model<BoothDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
    private readonly redisService: RedisService,
    private paymentService: PaymentService,
    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getBoothLockKey(boothId: string) {
    return `booth_lock:${boothId}`;
  }

  async bookBooth(payload: BoothBookDto, userId: string, userEmail: string) {
    const { eventId, boothIds } = payload;
    const locks: string[] = [];
    const now = new Date();
    const expires_At = new Date(now.getTime() + 7 * 60 * 1000);
    const holdId = uuidv4();

    try {
      // Preliminary locks on provided identifiers
      for (const anyId of boothIds) {
        const key = this.getBoothLockKey(anyId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`Booth ${anyId} is not available`);
        }
        await this.redisService.set(key, userId, 420); // lock for 7 minutes
        locks.push(key);
      }
      this.logger.log('Preliminary booth locks set');

      // Split into ObjectIds and domain ids (booth_id)
      const objectIds: Types.ObjectId[] = [];
      const domainIds: string[] = [];
      for (const id of boothIds) {
        if (Types.ObjectId.isValid(id)) {
          try { objectIds.push(new Types.ObjectId(id)); } catch { domainIds.push(String(id)); }
        } else {
          domainIds.push(String(id));
        }
      }

      // Validate availability in DB by either identifier
      const booths = await this.boothModel.find({
        $and: [
          {
            $or: [
              objectIds.length ? { _id: { $in: objectIds } } : undefined,
              domainIds.length ? { booth_id: { $in: domainIds } } : undefined,
            ].filter(Boolean) as any[],
          },
          { bookingStatus: { $ne: 'booked' } },
          {
            $or: [
              { lockExpiry: null },
              { lockExpiry: { $lt: now } },
              { lockExpiry: { $exists: false } },
            ],
          },
        ],
      });

      if (booths.length !== boothIds.length) {
        const foundBoothIds = booths.map(b => b.booth_id);
        const unavailableBooths = boothIds.filter(id => !foundBoothIds.includes(id));
        this.logger.error(`Booth availability check failed. Requested: ${boothIds.length}, Available: ${booths.length}. Unavailable: ${unavailableBooths.join(', ')}`);
        throw new ConflictException(
          `The following booths are no longer available: ${unavailableBooths.join(', ')}. Please refresh and select different booths.`
        );
      }

      // Canonical locks on booth_id
      for (const b of booths) {
        const canonKey = this.getBoothLockKey(b.booth_id);
        if (!(await this.redisService.get(canonKey))) {
          await this.redisService.set(canonKey, userId, 420);
        }
        if (!locks.includes(canonKey)) locks.push(canonKey);
      }

      // Lock booths in DB with lockedBy and lockExpiry
      const upd = await this.boothModel.updateMany(
        {
          _id: { $in: booths.map((b) => b._id) },
          bookingStatus: { $ne: 'booked' },
          $or: [
            { lockExpiry: null },
            { lockExpiry: { $lt: now } },
            { lockExpiry: { $exists: false } },
          ],
        },
        { $set: { lockedBy: holdId, lockExpiry: expires_At } },
      );

      if (upd.modifiedCount !== boothIds.length) {
        throw new ConflictException('Booth race: please retry');
      }

      // Create booking document
      const totalAmount = booths.reduce((acc, b) => acc + b.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

      const booking = await this.boothBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        boothIds: booths.map((b) => b._id),
        boothNumbers: booths.map((b) => b.lbl ?? b.name ?? b.booth_id),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        holdId,
        expiresAt,
      });

      // Enqueue expiry job after 7 minutes
      const jobBookingId = booking._id as unknown as string;
      await this.bookingExpiryQueue.add(
        'expire-booking',
        { bookingId: jobBookingId, type: 'booth' },
        { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingId}` },
      );
      this.logger.log(`Booking ${booking._id} prepared (pending) and expiry scheduled`);

      // Initiate payment
      const paymentRes = await this.paymentService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId,
        amount: parseFloat(totalAmount.toFixed(2)),
        type: BookingType.BOOTH,
        customerEmail: userEmail,
        description: 'Booth booking payment',
      });

      const paymentLink = paymentRes.paymentLink;
      const trackId = paymentRes.log?.trackId || null;

      this.logger.log(`Created booth booking ${booking._id} (pending)`);

      return {
        paymentLink,
        trackId,
        bookingType: BookingType.BOOTH,
        bookingId: booking._id,
        message: 'Complete payment within 7 minutes to confirm your booking',
      };
    } catch (error: any) {
      // rollback redis locks
      for (const key of locks) await this.redisService.del(key);
      this.logger.error(`Booking failed: ${error?.message || 'unknown error'}`);
      throw error;
    }
  }

  async confirmBooking(bookingId: string) {
    this.logger.log(`🏛️ Starting confirmation for booth booking ${bookingId}`);
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) {
      this.logger.error(`Booth booking ${bookingId} not found`);
      throw new NotFoundException(`Booking ID ${bookingId} not found`);
    }

    // If already confirmed, return early (idempotent operation)
    if (booking.status === 'confirmed') {
      this.logger.warn(`Booth booking ${bookingId} already confirmed, skipping...`);
      return;
    }

    if (booking.status !== 'pending') {
      this.logger.warn(`Booth booking ${bookingId} already has status: ${booking.status}`);
      throw new ConflictException(`Booking already ${booking.status}`);
    }

    if (booking.expiresAt && booking.expiresAt < new Date()) {
      this.logger.warn(`Booth booking ${bookingId} expired, cancelling`);
      await this.cancelBooking(bookingId);
      throw new ConflictException('Booking expired. Please try again.');
    }

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    booking.bookedAt = new Date();
    booking.expiresAt = undefined;
    await booking.save();
    this.logger.log(`💾 Booth booking ${bookingId} document updated to confirmed`);

    const now = new Date();
    // Update booths atomically - checking locks and updating in one operation
    const boothUpdateResult = await this.boothModel.updateMany(
      {
        _id: { $in: booking.boothIds },
        lockedBy: booking.holdId,
        lockExpiry: { $gt: now },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry: null },
      },
    );

    if (boothUpdateResult.modifiedCount !== booking.boothIds.length) {
      this.logger.error(
        `⚠️ Booth lock verification failed. Expected ${booking.boothIds.length}, updated ${boothUpdateResult.modifiedCount}`,
      );
      throw new ConflictException(
        'Some booths are no longer locked to this booking. Please try again.',
      );
    }
    this.logger.log(`🎪 Updated ${booking.boothIds.length} booths to booked status`);

    const jobId = `expire-booking_${bookingId}`;
    try { 
      await this.bookingExpiryQueue.remove(jobId);
      this.logger.log(`Removed expiry job ${jobId}`);
    } catch (e) {
      this.logger.warn(`Could not remove expiry job ${jobId}: ${e?.message}`);
    }

    // Clean up Redis locks using booth_id (not _id) - parallel execution
    const booths = await this.boothModel.find({ _id: { $in: booking.boothIds } });
    await Promise.all(
      booths.map(booth => this.redisService.del(this.getBoothLockKey(booth.booth_id)))
    );

    this.logger.log(`✅ Booth booking ${bookingId} confirmed successfully with ${booking.boothIds.length} booths`);
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

    // Clear locks - only for items locked by this booking
    const updateQuery: any = {
      _id: { $in: booking.boothIds },
      bookingStatus: { $ne: 'booked' },
    };
    if (booking.holdId) {
      updateQuery.lockedBy = booking.holdId;
    }

    await this.boothModel.updateMany(
      updateQuery,
      {
        $unset: { lockedBy: '', lockExpiry: null },
        $set: { bookingStatus: 'available' },
      },
    );

    // Clean up Redis locks using booth_id (parallel)
    const booths = await this.boothModel.find({ _id: { $in: booking.boothIds } });
    await Promise.all(
      booths.map(booth => this.redisService.del(this.getBoothLockKey(booth.booth_id)))
    );

    // Remove any pending expiry job
    try { await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`); } catch {}

    this.logger.warn(`Booth booking ${booking._id} cancelled`);
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booth booking ${bookingId} not found`);
    }
    return booking;
  }

  // Deprecated: typo in method name, kept for backward compatibility
  async getBookingDeatils(bookingId: string) {
    return this.getBookingDetails(bookingId);
  }
}
