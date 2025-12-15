import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import {
  Seat,
  SeatDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { Table, TableDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { TableBooking, TableBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { Booth, BoothDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';
import { BoothBooking, BoothBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import { SeatBookModule } from 'src/modules/seat-book/seat-book.module';
import { RedisService } from '../redis.service';

@Processor('booking-expiry-queue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  },
  prefix: 'bull',
})
@Injectable()
export class BookingExpiryQueue extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BookingExpiryQueue.name);
  constructor(
    @InjectModel(SeatBooking.name)
    private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(Seat.name) private readonly seatModel: Model<SeatDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(Table.name) private readonly tableModel: Model<TableDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
    @InjectModel(Booth.name) private readonly boothModel: Model<BoothDocument>,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  onModuleInit() {
    this.logger.log(
      '🚀 BookingExpiryQueue worker initialized and listening for jobs...',
    );
    // Startup cleanup to expire any stale pending bookings
    this.startupCleanup().catch((e) =>
      this.logger.warn(`Startup cleanup encountered an issue: ${(e as any)?.message}`),
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job ${job.id} failed:`, error);
  }

  @OnWorkerEvent('ready')
  onReady() {
    this.logger.log('🚀 Worker is READY and listening for jobs!');
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('❌ Worker error:', error);
  }

  async process(job: Job<{ bookingId: string; type?: 'seat' | 'table' | 'booth' }>): Promise<void> {
    const { bookingId, type = 'seat' } = job.data;
    this.logger.warn(`🕐 Expiry job triggered for ${type} booking ${bookingId} at ${new Date().toISOString()}`);

    if (type === 'seat') {
      const booking = await this.seatBookingModel.findById(bookingId);
      if (!booking) { this.logger.warn(`❌ Seat booking ${bookingId} not found — skipping`); return; }
      if (booking.status !== 'pending') { this.logger.log(`✅ Seat booking ${bookingId} already ${booking.status}`); return; }
      booking.status = 'expired'; booking.paymentStatus = 'cancelled'; booking.cancelledAt = new Date(); await booking.save();
      
      // Clear bookingStatus and lock fields
      await this.seatModel.updateMany(
        { _id: { $in: booking.seatIds } },
        { 
          $set: { bookingStatus: 'available', userId: null },
          $unset: { lockedBy: '', lockExpiry: null }
        }
      );
      
      // Clear Redis locks (parallel)
      const seats = await this.seatModel.find({ _id: { $in: booking.seatIds } });
      await Promise.all(seats.map(s => this.redisService.del(`seat_lock:${s.seatId}`)));
      
      this.logger.log(`✅ Seat booking ${bookingId} expired and seats released`);
      return;
    }

    if (type === 'table') {
      const booking = await this.tableBookingModel.findById(bookingId);
      if (!booking) { this.logger.warn(`❌ Table booking ${bookingId} not found — skipping`); return; }
      if (booking.status !== 'pending') { this.logger.log(`✅ Table booking ${bookingId} already ${booking.status}`); return; }
      booking.status = 'expired'; booking.paymentStatus = 'cancelled'; booking.cancelledAt = new Date(); await booking.save();
      
      // Clear bookingStatus and lock fields
      await this.tableModel.updateMany(
        { _id: { $in: booking.tableIds } },
        { 
          $set: { bookingStatus: 'available', userId: null },
          $unset: { lockedBy: '', lockExpiry: null }
        }
      );
      
      // Clear Redis locks using table_id (parallel)
      const tables = await this.tableModel.find({ _id: { $in: booking.tableIds } });
      await Promise.all(tables.map(t => this.redisService.del(`table_lock:${t.table_id}`)));
      
      this.logger.log(`✅ Table booking ${bookingId} expired and tables released`);
      return;
    }

    if (type === 'booth') {
      const booking = await this.boothBookingModel.findById(bookingId);
      if (!booking) { this.logger.warn(`❌ Booth booking ${bookingId} not found — skipping`); return; }
      if (booking.status !== 'pending') { this.logger.log(`✅ Booth booking ${bookingId} already ${booking.status}`); return; }
      booking.status = 'expired'; booking.paymentStatus = 'cancelled'; booking.cancelledAt = new Date(); await booking.save();
      
      // Clear bookingStatus and lock fields
      await this.boothModel.updateMany(
        { _id: { $in: booking.boothIds } },
        { 
          $set: { bookingStatus: 'available', userId: null },
          $unset: { lockedBy: '', lockExpiry: null }
        }
      );
      
      // Clear Redis locks using booth_id (parallel)
      const booths = await this.boothModel.find({ _id: { $in: booking.boothIds } });
      await Promise.all(booths.map(b => this.redisService.del(`booth_lock:${b.booth_id}`)));
      
      this.logger.log(`✅ Booth booking ${bookingId} expired and booths released`);
      return;
    }
  }

  private async startupCleanup() {
    const now = new Date();
    
    // Process all three types in parallel
    const [pendingSeats, pendingTables, pendingBooths] = await Promise.all([
      this.seatBookingModel.find({ status: 'pending', expiresAt: { $lt: now } }),
      this.tableBookingModel.find({ status: 'pending', expiresAt: { $lt: now } }),
      this.boothBookingModel.find({ status: 'pending', expiresAt: { $lt: now } }),
    ]);

    // Process seats in parallel
    await Promise.all(
      pendingSeats.map(bk => 
        this.process({
          id: `startup-seat-${bk._id}`,
          name: 'expire-booking',
          data: { bookingId: String(bk._id), type: 'seat' },
        } as Job<{ bookingId: string; type: 'seat' | 'table' | 'booth' }>)
      )
    );

    // Process tables in parallel
    await Promise.all(
      pendingTables.map(async bk => {
        try {
          await this.tableBookingModel.updateOne(
            { _id: bk._id },
            { $set: { status: 'expired', paymentStatus: 'cancelled', cancelledAt: new Date() } }
          );
          await this.tableModel.updateMany(
            { _id: { $in: bk.tableIds } },
            { 
              $set: { bookingStatus: 'available', userId: null },
              $unset: { lockedBy: '', lockExpiry: null }
            }
          );
          const tables = await this.tableModel.find({ _id: { $in: bk.tableIds } });
          await Promise.all(tables.map(t => this.redisService.del(`table_lock:${t.table_id}`)));
          this.logger.log(`✅ Startup cleanup: expired TABLE booking ${bk._id}`);
        } catch (e) {
          this.logger.warn(`Startup cleanup (table) failed for ${bk._id}: ${(e as any)?.message}`);
        }
      })
    );

    // Process booths in parallel
    await Promise.all(
      pendingBooths.map(async bk => {
        try {
          await this.boothBookingModel.updateOne(
            { _id: bk._id },
            { $set: { status: 'expired', paymentStatus: 'cancelled', cancelledAt: new Date() } }
          );
          await this.boothModel.updateMany(
            { _id: { $in: bk.boothIds } },
            { 
              $set: { bookingStatus: 'available', userId: null },
              $unset: { lockedBy: '', lockExpiry: null }
            }
          );
          const booths = await this.boothModel.find({ _id: { $in: bk.boothIds } });
          await Promise.all(booths.map(b => this.redisService.del(`booth_lock:${b.booth_id}`)));
          this.logger.log(`✅ Startup cleanup: expired BOOTH booking ${bk._id}`);
        } catch (e) {
          this.logger.warn(`Startup cleanup (booth) failed for ${bk._id}: ${(e as any)?.message}`);
        }
      })
    );

    if (pendingSeats.length || pendingTables.length || pendingBooths.length) {
      this.logger.log(
        `✅ Startup cleanup complete: ${pendingSeats.length} seats, ${pendingTables.length} tables, ${pendingBooths.length} booths expired`
      );
    }
  }
}


