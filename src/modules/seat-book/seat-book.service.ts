import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InventoryLockService } from 'src/infrastructure/redis/inventory-lock.service';
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
import { PaymentService } from 'src/payment/payment.service';
import { BookingType } from '../booking/interfaces/bookingType';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';
import { v4 as uuidv4 } from 'uuid';
import { EventBookingGuardService } from './event-booking-guard.service';
import { BookingIdempotencyService } from './booking-idempotency.service';
import { BOOKING_HOLD_MS } from './booking.constants';

@Injectable()
export class seatBookingService {
  private logger = new Logger(seatBookingService.name);

  constructor(
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(SeatBooking.name)
    private seatBookingModel: Model<SeatBookingDocument>,
    private readonly inventoryLockService: InventoryLockService,
    private readonly paymenetService: PaymentService,
    private readonly eventBookingGuard: EventBookingGuardService,
    private readonly idempotencyService: BookingIdempotencyService,
    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getSeatLockKey(seatId: string) {
    return `seat_lock:${seatId}`;
  }

  private parseIds(ids: string[]): {
    objectIds: Types.ObjectId[];
    domainIds: string[];
  } {
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

  private buildLockExpiryCondition(now: Date) {
    return [
      { lockExpiry: null },
      { lockExpiry: { $lt: now } },
      { lockExpiry: { $exists: false } },
    ];
  }

  async bookSeat(
    payload: SeatBookDto,
    userId: string,
    userEmail: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(
      userId,
      idempotencyKey,
      () => this.executeBookSeat(payload, userId, userEmail),
    );
  }

  private async executeBookSeat(
    payload: SeatBookDto,
    userId: string,
    userEmail: string,
  ) {
    const { eventId, seatIds } = payload;
    const eventOid = new Types.ObjectId(eventId);

    await this.eventBookingGuard.validateEventForBooking(
      eventId,
      userId,
      seatIds.length,
    );

    const locks: string[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOOKING_HOLD_MS);
    const holdId = uuidv4();

    try {
      // Atomic Redis lock on all requested identifiers
      const preliminaryKeys = seatIds.map((id) => this.getSeatLockKey(id));
      const locked = await this.inventoryLockService.acquireLocks(
        preliminaryKeys,
        userId,
      );
      if (!locked) {
        throw new ConflictException(
          'One or more seats were just taken. Please refresh and select again.',
        );
      }
      locks.push(...preliminaryKeys);

      const { objectIds, domainIds } = this.parseIds(seatIds);
      const idOrConditions: any[] = [];
      if (objectIds.length) idOrConditions.push({ _id: { $in: objectIds } });
      if (domainIds.length) idOrConditions.push({ seatId: { $in: domainIds } });

      const seats = await this.seatModel.find({
        eventId: eventOid,
        bookingStatus: { $ne: 'booked' },
        $and: [
          { $or: this.buildLockExpiryCondition(now) },
          { $or: idOrConditions },
        ],
      });

      if (seats.length !== seatIds.length) {
        const foundSet = new Set(
          seats.flatMap((s) => [String(s._id), s.seatId]),
        );
        const unavailable = seatIds.filter((id) => !foundSet.has(id));
        throw new ConflictException(
          `The following seats are no longer available: ${unavailable.join(', ')}. Please refresh and select different seats.`,
        );
      }

      // Lock canonical seatId keys too
      const canonKeys = seats.map((s) => this.getSeatLockKey(s.seatId));
      const extraKeys = canonKeys.filter((k) => !locks.includes(k));
      if (extraKeys.length) {
        const canonLocked = await this.inventoryLockService.acquireLocks(
          extraKeys,
          userId,
        );
        if (!canonLocked) {
          throw new ConflictException(
            'Seat race detected. Please refresh and try again.',
          );
        }
        locks.push(...extraKeys);
      }

      const upd = await this.seatModel.updateMany(
        {
          _id: { $in: seats.map((s) => s._id) },
          eventId: eventOid,
          bookingStatus: { $ne: 'booked' },
          $or: [
            { lockExpiry: null },
            { lockExpiry: { $lt: now } },
            { lockExpiry: { $exists: false } },
          ],
        },
        { $set: { lockedBy: holdId, lockExpiry: expiresAt, bookingStatus: 'locked' } },
      );

      if (upd.modifiedCount !== seatIds.length) {
        throw new ConflictException('Seat race: please retry');
      }

      const totalAmount = seats.reduce((acc, s) => acc + s.price, 0);

      const booking = await this.seatBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: eventOid,
        seatIds: seats.map((s) => s._id),
        seatNumber: seats.map((s) => s.sn ?? s.seatId),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        holdId,
        expiresAt,
      });

      const jobBookingid = String(booking._id);
      await this.bookingExpiryQueue.add(
        'expire-booking',
        { bookingId: jobBookingid, type: 'seat' },
        { delay: BOOKING_HOLD_MS, jobId: `expire-booking_${jobBookingid}` },
      );

      const paymentRes = await this.paymenetService.initiatePayment({
        bookingId: jobBookingid,
        userId,
        amount: parseFloat(totalAmount.toFixed(2)),
        type: BookingType.TICKET,
        customerEmail: userEmail,
        description: 'Seat ticket booking',
        paymentMethod: payload.paymentMethod,
      });

      this.logger.log(`Created booking ${booking._id} (pending)`);
      return {
        paymentLink: paymentRes.paymentLink,
        trackId: paymentRes.log?.trackId || null,
        bookingType: BookingType.TICKET,
        bookingId: booking._id,
        expiresAt: expiresAt.toISOString(),
        message: 'Complete payment within 7 minutes',
      };
    } catch (error: any) {
      await this.inventoryLockService.releaseLocks(locks, userId);
      this.logger.error(`Booking failed: ${error?.message || 'unknown error'}`);
      throw error;
    }
  }

  async confirmBooking(bookingId: string) {
    this.logger.log(`Starting confirmation for seat booking ${bookingId}`);
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`booking id ${bookingId} not found`);
    }

    if (booking.status === 'confirmed') {
      this.logger.warn(`Seat booking ${bookingId} already confirmed`);
      return;
    }

    const seatIds = booking.seatIds;
    const expectedCount = seatIds.length;

    await this.seatModel.updateMany(
      {
        _id: { $in: seatIds },
        lockedBy: booking.holdId,
        bookingStatus: { $ne: 'booked' },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry: '' },
      },
    );

    const countOwned = () =>
      this.seatModel.countDocuments({
        _id: { $in: seatIds },
        bookingStatus: 'booked',
        userId: booking.userId,
      });
    let ownedBooked = await countOwned();

  
    if (ownedBooked !== expectedCount) {
      const reSecurable = await this.seatModel.find({
        _id: { $in: seatIds },
        bookingStatus: { $ne: 'booked' },
      });
      if (reSecurable.length) {
        await this.seatModel.updateMany(
          {
            _id: { $in: reSecurable.map((s) => s._id) },
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

    if (ownedBooked === expectedCount) {
      const claimed = await this.seatBookingModel.findOneAndUpdate(
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
      } catch {
        this.logger.warn(`Failed to remove expiry job for ${bookingId}`);
      }

      const seats = await this.seatModel.find({ _id: { $in: seatIds } });
      await this.inventoryLockService.forceRelease(
        seats.flatMap((s) => [
          this.getSeatLockKey(s.seatId),
          this.getSeatLockKey(String(s._id)),
        ]),
      );

      this.logger.log(
        `Seat booking ${bookingId} confirmed with ${expectedCount} seats`,
      );
      return;
    }
    
    await this.seatModel.updateMany(
      { _id: { $in: seatIds }, userId: booking.userId, bookingStatus: 'booked' },
      { $set: { bookingStatus: 'available', userId: null }, $unset: { lockedBy: '', lockExpiry: '' } },
    );
    await this.seatBookingModel.updateOne(
      { _id: booking._id, status: { $ne: 'confirmed' } },
      {
        $set: {
          status: 'cancelled',
          paymentStatus: 'confirmed',
          needsRefund: true,
          refundReason:
            'Payment captured but seats were no longer available (hold expired before payment).',
          cancelledAt: new Date(),
        },
        $unset: { expiresAt: '' },
      },
    );
    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    const lockedSeats = await this.seatModel.find({ _id: { $in: seatIds } });
    await this.inventoryLockService.forceRelease(
      lockedSeats.flatMap((s) => [
        this.getSeatLockKey(s.seatId),
        this.getSeatLockKey(String(s._id)),
      ]),
    );
    this.logger.error(
      `⚠️ Seat booking ${bookingId} PAID but could only secure ${ownedBooked}/${expectedCount} seats. Flagged needsRefund=true.`,
    );
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
    if (booking.status === 'cancelled' || booking.status === 'expired') {
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

    const updateQuery: any = {
      _id: { $in: booking.seatIds },
      bookingStatus: { $ne: 'booked' },
    };
    if (booking.holdId) updateQuery.lockedBy = booking.holdId;

    await this.seatModel.updateMany(updateQuery, {
      $unset: { lockedBy: '', lockExpiry: '' },
      $set: { bookingStatus: 'available' },
    });

    const seats = await this.seatModel.find({ _id: { $in: booking.seatIds } });
    await this.inventoryLockService.forceRelease(
      seats.flatMap((s) => [
        this.getSeatLockKey(s.seatId),
        this.getSeatLockKey(String(s._id)),
      ]),
    );

    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    this.logger.warn(`Booking ${booking._id} cancelled`);
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
    return booking;
  }

  async getBookingDeatils(bookingId: string) {
    return this.getBookingDetails(bookingId);
  }
}
