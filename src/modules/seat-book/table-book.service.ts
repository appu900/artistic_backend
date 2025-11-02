import {
  ConflictException,
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
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PaymentService } from 'src/payment/payment.service';
import { TableBookDto } from './dto/tableBooking.dto';
import { BookingType } from '../booking/interfaces/bookingType';

@Injectable()
export class TableBookSearvice {
  private logger = new Logger(TableBookSearvice.name);
  constructor(
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    private readonly redisService: RedisService,
    private readonly paymentService: PaymentService,
  ) {}

  private getTableLockKey(tableId: string) {
    return `table_lock:${tableId}`;
  }

  async bookTable(payload: TableBookDto, userId: string, userEmail: string) {
    const { eventId, tableIds } = payload;
    const locks: string[] = [];

    try {
      // 1Redis locking
      for (const tableId of tableIds) {
        const key = this.getTableLockKey(tableId);
        const isLocked = await this.redisService.get(key);
        if (isLocked) {
          throw new ConflictException(`Table ${tableId} is not available`);
        }
        await this.redisService.set(key, userId, 420);
        locks.push(key);
      }

      this.logger.log('Tables locked in Redis');

      // Validate availability in DB
      const tables = await this.tableModel.find({
        _id: { $in: tableIds.map((id) => new Types.ObjectId(id)) },
        bookingStatus: 'available',
      });

      if (tables.length !== tableIds.length) {
        throw new ConflictException('One or more tables are already booked');
      }

      //  Mark as blocked
      await this.tableModel.updateMany(
        { _id: { $in: tableIds } },
        { $set: { bookingStatus: 'blocked' } },
      );

      // Create booking
      const totalAmount = tables.reduce((acc, t) => acc + t.price, 0);
      const expiresAt = new Date(Date.now() + 7 * 60 * 1000);

      const booking = await this.tableBookingModel.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        tableIds: tableIds.map((id) => new Types.ObjectId(id)),
        tableNumbers: tables.map((t) => t.lbl ?? t.name ?? t.table_id),
        totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        bookedAt: new Date(),
        expiresAt,
      });

      // Queue booking expiry
      //   const jobBookingId = booking._id.toString();
      //   await this.bookingExpiryQueue.add(
      //     'expire-booking',
      //     { bookingId: jobBookingId, type: 'table' },
      //     { delay: 7 * 60 * 1000, jobId: `expire-booking_${jobBookingId}` },
      //   );

      this.logger.log(`Booking ${booking._id} queued for expiry`);

      // 6️⃣ Initiate payment
      const { paymentLink } = await this.paymentService.initiatePayment({
        bookingId: booking._id as unknown as string,
        userId,
        amount: 0.01,
        type: BookingType.TABLE,
        customerEmail: userEmail,
      });

      this.logger.log(`Created table booking ${booking._id} (pending)`);

      return {
        paymentLink,
        bookingType: BookingType.TABLE,
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
    // await this.bookingExpiryQueue.remove(jobId);

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
}
