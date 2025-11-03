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
          { bookingStatus: 'available' },
        ],
      });

      if (tables.length !== tableIds.length) {
        throw new ConflictException('One or more tables are already booked or invalid');
      }

      // Canonical locks by table_id
      for (const t of tables) {
        const canonKey = this.getTableLockKey(t.table_id);
        if (!(await this.redisService.get(canonKey))) {
          await this.redisService.set(canonKey, userId, 420);
        }
        if (!locks.includes(canonKey)) locks.push(canonKey);
      }

      // Mark as blocked by _id
      await this.tableModel.updateMany(
        { _id: { $in: tables.map((t) => t._id) } },
        { $set: { bookingStatus: 'blocked' } },
      );

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
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ID ${bookingId} not found`);
    }

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

    await this.tableModel.updateMany(
      { _id: { $in: booking.tableIds } },
      { $set: { bookingStatus: 'booked', userId: booking.userId } },
    );

  const jobId = `expire-booking_${bookingId}`;
  try { await this.bookingExpiryQueue.remove(jobId); } catch {}

    for (const id of booking.tableIds) {
      await this.redisService.del(this.getTableLockKey(id.toString()));
    }

    this.logger.log(`Booking ${bookingId} confirmed successfully`);
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

    await this.tableModel.updateMany(
      { _id: { $in: booking.tableIds } },
      { $set: { bookingStatus: 'available' } },
    );

    // Remove any pending expiry job
    try { await this.bookingExpiryQueue.remove(`expire-booking_${bookingId}`); } catch {}

    for (const id of booking.tableIds) {
      await this.redisService.del(this.getTableLockKey(id.toString()));
    }

    this.logger.warn(`Booking ${booking._id} cancelled`);
    return booking;
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  async getBookingDeatils(bookingId: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    return booking;
  }
}
