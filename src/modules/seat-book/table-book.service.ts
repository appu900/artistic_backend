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
  TableBooking,
  TableBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import {
  Table,
  TableDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PaymentService } from 'src/payment/payment.service';
import { TableBookDto } from './dto/tableBooking.dto';
import { BookingType } from '../booking/interfaces/bookingType';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from 'src/infrastructure/redis/queue/bullmq.module';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TableBookSearvice {
  private logger = new Logger(TableBookSearvice.name);
  constructor(
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    private readonly redisService: RedisService,
    private readonly paymentService: PaymentService,
    @Inject(QUEUE_TOKENS.BOOKING_EXPIRY)
    private readonly bookingExpiryQueue: Queue,
  ) {}

  private getTableLockKey(tableId: string) {
    return `table_lock:${tableId}`;
  }

  async bookTable(payload: TableBookDto, userId: string, userEmail: string) {
    const { eventId, tableIds } = payload;
    const locks: string[] = [];
    const now = new Date();
    const expires_At = new Date(now.getTime() + 7 * 60 * 1000);
    const holdId = uuidv4();

    try {
      // Preliminary locks on provided identifiers
      for (const anyId of tableIds) {
        const key = this.getTableLockKey(anyId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`Table ${anyId} is not available`);
        }
        await this.redisService.set(key, userId, 420);
        locks.push(key);
      }

      this.logger.log('Preliminary table locks set');

      // Split into ObjectIds and domain ids (table_id)
      const objectIds: Types.ObjectId[] = [];
      const domainIds: string[] = [];
      for (const id of tableIds) {
        if (Types.ObjectId.isValid(id)) {
          try { objectIds.push(new Types.ObjectId(id)); } catch { domainIds.push(String(id)); }
        } else {
          domainIds.push(String(id));
        }
      }

      // Fetch available tables by either identifier
      const tables = await this.tableModel.find({
        $and: [
          {
            $or: [
              objectIds.length ? { _id: { $in: objectIds } } : undefined,
              domainIds.length ? { table_id: { $in: domainIds } } : undefined,
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

      if (tables.length !== tableIds.length) {
        const foundTableIds = tables.map(t => t.table_id);
        const unavailableTables = tableIds.filter(id => !foundTableIds.includes(id));
        this.logger.error(`Table availability check failed. Requested: ${tableIds.length}, Available: ${tables.length}. Unavailable: ${unavailableTables.join(', ')}`);
        throw new ConflictException(
          `The following tables are no longer available: ${unavailableTables.join(', ')}. Please refresh and select different tables.`
        );
      }

      // Canonical locks by table_id
      for (const t of tables) {
        const canonKey = this.getTableLockKey(t.table_id);
        if (!(await this.redisService.get(canonKey))) {
          await this.redisService.set(canonKey, userId, 420);
        }
        if (!locks.includes(canonKey)) locks.push(canonKey);
      }

      // Lock tables in DB with lockedBy and lockExpiry
      const upd = await this.tableModel.updateMany(
        {
          _id: { $in: tables.map((t) => t._id) },
          bookingStatus: { $ne: 'booked' },
          $or: [
            { lockExpiry: null },
            { lockExpiry: { $lt: now } },
            { lockExpiry: { $exists: false } },
          ],
        },
        { $set: { lockedBy: holdId, lockExpiry: expires_At } },
      );

      if (upd.modifiedCount !== tableIds.length) {
        throw new ConflictException('Table race: please retry');
      }

      // Create booking
      const totalAmount = tables.reduce((acc, t) => acc + t.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

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
      });

      // Enqueue expiry for auto-release after 7 minutes
      const jobBookingId = booking._id as unknown as string;
      await this.bookingExpiryQueue.add(
        'expire-booking',
        { bookingId: jobBookingId, type: 'table' },
        { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingId}` },
      );
      this.logger.log(`Booking ${booking._id} created (pending) and expiry scheduled`);

      // Initiate payment
      const paymentRes= await this.paymentService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId,
        amount: parseFloat(totalAmount.toFixed(2)),
        type: BookingType.TABLE,
        customerEmail: userEmail,
        description: 'Table booking payment',
      });

      const paymentLink = paymentRes.paymentLink;
      const trackId = paymentRes.log?.trackId || null;

      this.logger.log(`Created table booking ${booking._id} (pending)`);

      return {
        paymentLink,
        trackId,
        bookingType: BookingType.TABLE,
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
    this.logger.log(`🍽️ Starting confirmation for table booking ${bookingId}`);
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) {
      this.logger.error(`Table booking ${bookingId} not found`);
      throw new NotFoundException(`Booking ID ${bookingId} not found`);
    }

    // If already confirmed, return early (idempotent operation)
    if (booking.status === 'confirmed') {
      this.logger.warn(`Table booking ${bookingId} already confirmed, skipping...`);
      return;
    }

    if (booking.status !== 'pending') {
      this.logger.warn(`Table booking ${bookingId} already has status: ${booking.status}`);
      throw new ConflictException(`Booking already ${booking.status}`);
    }

    if (booking.expiresAt && booking.expiresAt < new Date()) {
      this.logger.warn(`Table booking ${bookingId} expired, cancelling`);
      await this.cancelBooking(bookingId);
      throw new ConflictException('Booking expired. Please try again.');
    }

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    booking.bookedAt = new Date();
    booking.expiresAt = undefined;
    await booking.save();
    this.logger.log(`💾 Table booking ${bookingId} document updated to confirmed`);

    const now = new Date();
    // Update tables atomically - checking locks and updating in one operation
    const tableUpdateResult = await this.tableModel.updateMany(
      {
        _id: { $in: booking.tableIds },
        lockedBy: booking.holdId,
        lockExpiry: { $gt: now },
      },
      {
        $set: { bookingStatus: 'booked', userId: booking.userId },
        $unset: { lockedBy: '', lockExpiry: null },
      },
    );

    if (tableUpdateResult.modifiedCount !== booking.tableIds.length) {
      this.logger.error(
        `⚠️ Table lock verification failed. Expected ${booking.tableIds.length}, updated ${tableUpdateResult.modifiedCount}`,
      );
      throw new ConflictException(
        'Some tables are no longer locked to this booking. Please try again.',
      );
    }
    this.logger.log(`🪑 Updated ${booking.tableIds.length} tables to booked status`);

    const jobId = `expire-booking_${bookingId}`;
    try { 
      await this.bookingExpiryQueue.remove(jobId);
      this.logger.log(`Removed expiry job ${jobId}`);
    } catch (e) {
      this.logger.warn(`Could not remove expiry job ${jobId}: ${e?.message}`);
    }

    // Clean up Redis locks using table_id (not _id) - parallel execution
    const tables = await this.tableModel.find({ _id: { $in: booking.tableIds } });
    await Promise.all(
      tables.map(table => this.redisService.del(this.getTableLockKey(table.table_id)))
    );

    this.logger.log(`✅ Table booking ${bookingId} confirmed successfully with ${booking.tableIds.length} tables`);
  }

  async cancelBooking(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

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
      _id: { $in: booking.tableIds },
      bookingStatus: { $ne: 'booked' },
    };
    if (booking.holdId) {
      updateQuery.lockedBy = booking.holdId;
    }

    await this.tableModel.updateMany(
      updateQuery,
      {
        $unset: { lockedBy: '', lockExpiry: null },
        $set: { bookingStatus: 'available' },
      },
    );

    // Clean up Redis locks using table_id (parallel)
    const tables = await this.tableModel.find({ _id: { $in: booking.tableIds } });
    await Promise.all(
      tables.map(table => this.redisService.del(this.getTableLockKey(table.table_id)))
    );

    // Remove any pending expiry job
    try { await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`); } catch {}

    this.logger.warn(`Table booking ${booking._id} cancelled`);
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Table booking ${bookingId} not found`);
    }
    return booking;
  }

  // Deprecated: typo in method name, kept for backward compatibility
  async getBookingDeatils(bookingId: string) {
    return this.getBookingDetails(bookingId);
  }
}
