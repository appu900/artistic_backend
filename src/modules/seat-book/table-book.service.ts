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
  TableBooking,
  TableBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import {
  Table,
  TableDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { InventoryLockService } from 'src/infrastructure/redis/inventory-lock.service';
import { PaymentService } from 'src/payment/payment.service';
import { TableBookDto } from './dto/tableBooking.dto';
import { BookingType } from '../booking/interfaces/bookingType';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';
import { v4 as uuidv4 } from 'uuid';
import { EventBookingGuardService } from './event-booking-guard.service';
import { BookingIdempotencyService } from './booking-idempotency.service';
import { BOOKING_HOLD_MS } from './booking.constants';

@Injectable()
export class TableBookSearvice {
  private logger = new Logger(TableBookSearvice.name);

  constructor(
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    private readonly inventoryLockService: InventoryLockService,
    private readonly paymentService: PaymentService,
    private readonly eventBookingGuard: EventBookingGuardService,
    private readonly idempotencyService: BookingIdempotencyService,
    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getTableLockKey(tableId: string) {
    return `table_lock:${tableId}`;
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

  async bookTable(
    payload: TableBookDto,
    userId: string,
    userEmail: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(
      userId,
      idempotencyKey,
      () => this.executeBookTable(payload, userId, userEmail),
    );
  }

  private async executeBookTable(
    payload: TableBookDto,
    userId: string,
    userEmail: string,
  ) {
    const { eventId, tableIds } = payload;
    const event = await this.eventBookingGuard.validateEventForBooking(
      eventId,
      userId,
      tableIds.length,
    );
    const layoutOid = event.openBookingLayoutId as Types.ObjectId;

    const locks: string[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOOKING_HOLD_MS);
    const holdId = uuidv4();

    try {
      const preliminaryKeys = tableIds.map((id) => this.getTableLockKey(id));
      const locked = await this.inventoryLockService.acquireLocks(
        preliminaryKeys,
        userId,
      );
      if (!locked) {
        throw new ConflictException(
          'One or more tables were just taken. Please refresh and select again.',
        );
      }
      locks.push(...preliminaryKeys);

      const { objectIds, domainIds } = this.parseIds(tableIds);
      const idOrConditions: any[] = [];
      if (objectIds.length) idOrConditions.push({ _id: { $in: objectIds } });
      if (domainIds.length) idOrConditions.push({ table_id: { $in: domainIds } });

      const tables = await this.tableModel.find({
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

      if (tables.length !== tableIds.length) {
        const foundSet = new Set(
          tables.flatMap((t) => [String(t._id), t.table_id]),
        );
        const unavailable = tableIds.filter((id) => !foundSet.has(id));
        throw new ConflictException(
          `The following tables are no longer available: ${unavailable.join(', ')}.`,
        );
      }

      const canonKeys = tables.map((t) => this.getTableLockKey(t.table_id));
      const extraKeys = canonKeys.filter((k) => !locks.includes(k));
      if (extraKeys.length) {
        const canonLocked = await this.inventoryLockService.acquireLocks(
          extraKeys,
          userId,
        );
        if (!canonLocked) {
          throw new ConflictException('Table race detected. Please retry.');
        }
        locks.push(...extraKeys);
      }

      const upd = await this.tableModel.updateMany(
        {
          _id: { $in: tables.map((t) => t._id) },
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

      if (upd.modifiedCount !== tableIds.length) {
        throw new ConflictException('Table race: please retry');
      }

      const totalAmount = tables.reduce((acc, t) => acc + t.price, 0);

      const booking = await this.tableBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        tableIds: tables.map((t) => t._id),
        tableNumbers: tables.map((t) => t.lbl ?? t.name ?? t.table_id),
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
        { bookingId: jobBookingId, type: 'table' },
        { delay: BOOKING_HOLD_MS, jobId: `expire-booking_${jobBookingId}` },
      );

      const paymentRes = await this.paymentService.initiatePayment({
        bookingId: jobBookingId,
        userId,
        amount: parseFloat(totalAmount.toFixed(2)),
        type: BookingType.TABLE,
        customerEmail: payload.customerDetails?.email || userEmail,
        description: 'Table booking payment',
        paymentMethod: payload.paymentMethod,
      });

      return {
        paymentLink: paymentRes.paymentLink,
        trackId: paymentRes.log?.trackId || null,
        bookingType: BookingType.TABLE,
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

  /**
   * Idempotent + resilient confirm (see seat-book.service for the full rationale).
   * Never dead-letters a paid booking: re-secures tables on late payment, or flags
   * `needsRefund` and returns instead of throwing when tables can't be secured.
   */
  async confirmBooking(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ID ${bookingId} not found`);
    if (booking.status === 'confirmed') return;

    const tableIds = booking.tableIds;
    const expectedCount = tableIds.length;

    // Step 1 — book tables still locked by this hold (no-op on retry).
    await this.tableModel.updateMany(
      {
        _id: { $in: tableIds },
        lockedBy: booking.holdId,
        bookingStatus: { $ne: 'booked' },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry: '' },
      },
    );

    const countOwned = () =>
      this.tableModel.countDocuments({
        _id: { $in: tableIds },
        bookingStatus: 'booked',
        userId: booking.userId,
      });
    let ownedBooked = await countOwned();

    // Step 2 — late payment: re-secure tables that are still free.
    if (ownedBooked !== expectedCount) {
      const reSecurable = await this.tableModel.find({
        _id: { $in: tableIds },
        bookingStatus: { $ne: 'booked' },
      });
      if (reSecurable.length) {
        await this.tableModel.updateMany(
          {
            _id: { $in: reSecurable.map((t) => t._id) },
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
      const claimed = await this.tableBookingModel.findOneAndUpdate(
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
      const tables = await this.tableModel.find({ _id: { $in: tableIds } });
      await this.inventoryLockService.forceRelease(
        tables.flatMap((t) => [
          this.getTableLockKey(t.table_id),
          this.getTableLockKey(String(t._id)),
        ]),
      );
      return;
    }

    // Step 3b — captured but tables unavailable → flag for refund, do not throw.
    await this.tableModel.updateMany(
      { _id: { $in: tableIds }, userId: booking.userId, bookingStatus: 'booked' },
      { $set: { bookingStatus: 'available', userId: null }, $unset: { lockedBy: '', lockExpiry: '' } },
    );
    await this.tableBookingModel.updateOne(
      { _id: booking._id, status: { $ne: 'confirmed' } },
      {
        $set: {
          status: 'cancelled',
          paymentStatus: 'confirmed',
          needsRefund: true,
          refundReason:
            'Payment captured but tables were no longer available (hold expired before payment).',
          cancelledAt: new Date(),
        },
        $unset: { expiresAt: '' },
      },
    );
    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    const lockedTables = await this.tableModel.find({ _id: { $in: tableIds } });
    await this.inventoryLockService.forceRelease(
      lockedTables.flatMap((t) => [
        this.getTableLockKey(t.table_id),
        this.getTableLockKey(String(t._id)),
      ]),
    );
    this.logger.error(
      `⚠️ Table booking ${bookingId} PAID but could only secure ${ownedBooked}/${expectedCount} tables. Flagged needsRefund=true.`,
    );
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
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
      _id: { $in: booking.tableIds },
      bookingStatus: { $ne: 'booked' },
    };
    if (booking.holdId) updateQuery.lockedBy = booking.holdId;

    await this.tableModel.updateMany(updateQuery, {
      $unset: { lockedBy: '', lockExpiry: '' },
      $set: { bookingStatus: 'available' },
    });

    const tables = await this.tableModel.find({ _id: { $in: booking.tableIds } });
    await this.inventoryLockService.forceRelease(
      tables.flatMap((t) => [
        this.getTableLockKey(t.table_id),
        this.getTableLockKey(String(t._id)),
      ]),
    );

    try {
      await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`);
    } catch {}
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Table booking ${bookingId} not found`);
    return booking;
  }

  async getBookingDeatils(bookingId: string) {
    return this.getBookingDetails(bookingId);
  }
}
