import {
  ConflictException,
  Inject,
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
import { InventoryLockService } from 'src/infrastructure/redis/inventory-lock.service';
import { PaymentService } from 'src/payment/payment.service';
import { BoothBookDto } from './dto/boothBook.dto';
import { BookingType } from '../booking/interfaces/bookingType';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';
import { v4 as uuidv4 } from 'uuid';
import { EventBookingGuardService } from './event-booking-guard.service';
import { BookingIdempotencyService } from './booking-idempotency.service';
import { BOOKING_HOLD_MS } from './booking.constants';

@Injectable()
export class BoothBookService {
  private logger = new Logger(BoothBookService.name);

  constructor(
    @InjectModel(Booth.name) private readonly boothModel: Model<BoothDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
    private readonly inventoryLockService: InventoryLockService,
    private paymentService: PaymentService,
    private readonly eventBookingGuard: EventBookingGuardService,
    private readonly idempotencyService: BookingIdempotencyService,
    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getBoothLockKey(boothId: string) {
    return `booth_lock:${boothId}`;
  }

  private parseIds(ids: string[]) {
    const objectIds: Types.ObjectId[] = [];
    const domainIds: string[] = [];
    for (const id of ids) {
      if (Types.ObjectId.isValid(id)) {
        try {
          objectIds.push(new Types.ObjectId(id));
        } catch {
          domainIds.push(String(id));
        }
      } else {
        domainIds.push(String(id));
      }
    }
    return { objectIds, domainIds };
  }

  async bookBooth(
    payload: BoothBookDto,
    userId: string,
    userEmail: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(
      userId,
      idempotencyKey,
      () => this.executeBookBooth(payload, userId, userEmail),
    );
  }

  private async executeBookBooth(
    payload: BoothBookDto,
    userId: string,
    userEmail: string,
  ) {
    const { eventId, boothIds } = payload;
    const event = await this.eventBookingGuard.validateEventForBooking(
      eventId,
      userId,
      boothIds.length,
    );
    const layoutOid = event.openBookingLayoutId as Types.ObjectId;

    const locks: string[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOOKING_HOLD_MS);
    const holdId = uuidv4();

    try {
      const preliminaryKeys = boothIds.map((id) => this.getBoothLockKey(id));
      const locked = await this.inventoryLockService.acquireLocks(
        preliminaryKeys,
        userId,
      );
      if (!locked) {
        throw new ConflictException(
          'One or more booths were just taken. Please refresh and select again.',
        );
      }
      locks.push(...preliminaryKeys);

      const { objectIds, domainIds } = this.parseIds(boothIds);
      const idOrConditions: any[] = [];
      if (objectIds.length) idOrConditions.push({ _id: { $in: objectIds } });
      if (domainIds.length) idOrConditions.push({ booth_id: { $in: domainIds } });

      const booths = await this.boothModel.find({
        layoutId: layoutOid,
        $and: [
          { bookingStatus: { $ne: 'booked' } },
          {
            $or: [
              { lockExpiry: null },
              { lockExpiry: { $lt: now } },
              { lockExpiry: { $exists: false } },
            ],
          },
          { $or: idOrConditions },
        ],
      });

      if (booths.length !== boothIds.length) {
        const foundSet = new Set(
          booths.flatMap((b) => [String(b._id), b.booth_id]),
        );
        const unavailable = boothIds.filter((id) => !foundSet.has(id));
        throw new ConflictException(
          `The following booths are no longer available: ${unavailable.join(', ')}.`,
        );
      }

      const canonKeys = booths.map((b) => this.getBoothLockKey(b.booth_id));
      const extraKeys = canonKeys.filter((k) => !locks.includes(k));
      if (extraKeys.length) {
        const canonLocked = await this.inventoryLockService.acquireLocks(
          extraKeys,
          userId,
        );
        if (!canonLocked) {
          throw new ConflictException('Booth race detected. Please retry.');
        }
        locks.push(...extraKeys);
      }

      const upd = await this.boothModel.updateMany(
        {
          _id: { $in: booths.map((b) => b._id) },
          layoutId: layoutOid,
          bookingStatus: { $ne: 'booked' },
          $or: [
            { lockExpiry: null },
            { lockExpiry: { $lt: now } },
            { lockExpiry: { $exists: false } },
          ],
        },
        { $set: { lockedBy: holdId, lockExpiry: expiresAt, bookingStatus: 'locked' } },
      );

      if (upd.modifiedCount !== boothIds.length) {
        throw new ConflictException('Booth race: please retry');
      }

      const totalAmount = booths.reduce((acc, b) => acc + b.price, 0);

      const booking = await this.boothBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        boothIds: booths.map((b) => b._id as Types.ObjectId) as any,
        boothNumbers: booths.map((b) => b.lbl ?? b.name ?? b.booth_id),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        holdId,
        expiresAt,
        ...(payload.customerDetails ? { customerDetails: payload.customerDetails } : {}),
      });

      const jobBookingId = String(booking._id);
      await this.bookingExpiryQueue.add(
        'expire-booking',
        { bookingId: jobBookingId, type: 'booth' },
        { delay: BOOKING_HOLD_MS, jobId: `expire-booking_${jobBookingId}` },
      );

      const paymentRes = await this.paymentService.initiatePayment({
        bookingId: jobBookingId,
        userId,
        amount: parseFloat(totalAmount.toFixed(2)),
        type: BookingType.BOOTH,
        customerEmail: payload.customerDetails?.email || userEmail,
        description: 'Booth booking payment',
        paymentMethod: payload.paymentMethod,
      });

      return {
        paymentLink: paymentRes.paymentLink,
        trackId: paymentRes.log?.trackId || null,
        bookingType: BookingType.BOOTH,
        bookingId: booking._id,
        expiresAt: expiresAt.toISOString(),
        message: 'Complete payment within 7 minutes to confirm your booking',
      };
    } catch (error: any) {
      await this.inventoryLockService.releaseLocks(locks, userId);
      this.logger.error(`Booking failed: ${error?.message || 'unknown error'}`);
      throw error;
    }
  }

  async confirmBooking(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ID ${bookingId} not found`);
    if (booking.status === 'confirmed') return;

    const boothIds = booking.boothIds;
    const expectedCount = boothIds.length;

    await this.boothModel.updateMany(
      {
        _id: { $in: boothIds },
        lockedBy: booking.holdId,
        bookingStatus: { $ne: 'booked' },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry: '' },
      },
    );

    const countOwned = () =>
      this.boothModel.countDocuments({
        _id: { $in: boothIds },
        bookingStatus: 'booked',
        userId: booking.userId,
      });
    let ownedBooked = await countOwned();

    if (ownedBooked !== expectedCount) {
      const reSecurable = await this.boothModel.find({
        _id: { $in: boothIds },
        bookingStatus: { $ne: 'booked' },
      });
      if (reSecurable.length) {
        await this.boothModel.updateMany(
          {
            _id: { $in: reSecurable.map((b) => b._id) },
            bookingStatus: { $ne: 'booked' },
          },
          {
            $set: { bookingStatus: 'booked', userId: booking.userId },
            $unset: { lockedBy: '', lockExpiry: '' },
          },
        );
        ownedBooked = await countOwned();
      }
    }

    // Step 3a — all secured → finalize exactly once.
    if (ownedBooked === expectedCount) {
      const claimed = await this.boothBookingModel.findOneAndUpdate(
        { _id: booking._id, status: { $ne: 'confirmed' } },
        {
          $set: {
            status: 'confirmed',
            paymentStatus: 'confirmed',
            bookedAt: new Date(),
            needsRefund: false,
          },
          $unset: { expiresAt: '', refundReason: '' },
        },
        { new: true },
      );
      if (claimed) {
        await this.eventBookingGuard.incrementSoldTickets(
          booking.eventId,
          expectedCount,
        );
      }
      try {
        await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
      } catch {}
      const booths = await this.boothModel.find({ _id: { $in: boothIds } });
      await this.inventoryLockService.forceRelease(
        booths.flatMap((b) => [
          this.getBoothLockKey(b.booth_id),
          this.getBoothLockKey(String(b._id)),
        ]),
      );
      return;
    }

    // Step 3b — captured but booths unavailable → flag for refund, do not throw.
    await this.boothModel.updateMany(
      { _id: { $in: boothIds }, userId: booking.userId, bookingStatus: 'booked' },
      { $set: { bookingStatus: 'available', userId: null }, $unset: { lockedBy: '', lockExpiry: '' } },
    );
    await this.boothBookingModel.updateOne(
      { _id: booking._id, status: { $ne: 'confirmed' } },
      {
        $set: {
          status: 'cancelled',
          paymentStatus: 'confirmed',
          needsRefund: true,
          refundReason:
            'Payment captured but booths were no longer available (hold expired before payment).',
          cancelledAt: new Date(),
        },
        $unset: { expiresAt: '' },
      },
    );
    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    const lockedBooths = await this.boothModel.find({ _id: { $in: boothIds } });
    await this.inventoryLockService.forceRelease(
      lockedBooths.flatMap((b) => [
        this.getBoothLockKey(b.booth_id),
        this.getBoothLockKey(String(b._id)),
      ]),
    );
    this.logger.error(
      `⚠️ Booth booking ${bookingId} PAID but could only secure ${ownedBooked}/${expectedCount} booths. Flagged needsRefund=true.`,
    );
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (['cancelled', 'expired'].includes(booking.status)) return booking;
    if (booking.status === 'confirmed') {
      throw new ConflictException('Booking already confirmed and cannot be cancelled.');
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    const updateQuery: any = {
      _id: { $in: booking.boothIds },
      bookingStatus: { $ne: 'booked' },
    };
    if (booking.holdId) updateQuery.lockedBy = booking.holdId;

    await this.boothModel.updateMany(updateQuery, {
      $unset: { lockedBy: '', lockExpiry: '' },
      $set: { bookingStatus: 'available' },
    });

    const booths = await this.boothModel.find({ _id: { $in: booking.boothIds } });
    await this.inventoryLockService.forceRelease(
      booths.flatMap((b) => [
        this.getBoothLockKey(b.booth_id),
        this.getBoothLockKey(String(b._id)),
      ]),
    );

    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booth booking ${bookingId} not found`);
    return booking;
  }

  async getBookingDeatils(bookingId: string) {
    return this.getBookingDetails(bookingId);
  }
}
