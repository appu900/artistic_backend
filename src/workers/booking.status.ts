import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { BookingStatus } from 'src/modules/booking/dto/booking.dto';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { EquipmentPackageBookingService } from 'src/modules/equipment-package-booking/equipment-package-booking.service';
import { seatBookingService } from 'src/modules/seat-book/seat-book.service';
import { TableBookSearvice } from 'src/modules/seat-book/table-book.service';

@Injectable()
export class BookingStatusWorker implements OnModuleInit {
  private readonly logger = new Logger(BookingStatusWorker.name);
  constructor(
    private readonly redisService: RedisService,
    private readonly bookingService: BookingService,
    private readonly equipmentPackageBookingService: EquipmentPackageBookingService,
    private readonly seatBookingService:seatBookingService,
    private readonly tableBookingService:TableBookSearvice
  ) {}
  onModuleInit() {
    console.log('=== BookingStatusWorker onModuleInit called ===');
    
    const worker = new Worker<
      {
        bookingId: string;
        userId: string;
        type: BookingType;
        status: UpdatePaymentStatus;
      },
      any
    >(
      'BOOKING_STATUS',
      async (
        job: Job<{
          bookingId: string;
          userId: string;
          type: BookingType;
          status: UpdatePaymentStatus;
        }>,
      ) => {
        const { bookingId, userId, type, status } = job.data;
        console.log(`=== WORKER PROCESSING JOB ${job.id} ===`);
        this.logger.log(
          `Processing job ${job.id} for booking ${bookingId} | User: ${String(userId)} | Type: ${type} | Status: ${status}`,
        );
        try {
          // Confirm-only path for successful payments; keep existing side-effects for cancellations
          if (status === UpdatePaymentStatus.CONFIRMED) {
            switch (type) {
              case BookingType.ARTIST: {
                const bookingStatus = BookingStatus.CONFIRMED;
                await this.bookingService.confirmArtistBookingOnly(bookingId, bookingStatus);
                break;
              }
              case BookingType.EQUIPMENT: {
                const bookingStatus = BookingStatus.CONFIRMED;
                await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.EQUIPMENT_PACKAGE: {
                await this.equipmentPackageBookingService.updateBookingStatus(bookingId, String(userId), { status: 'confirmed' });
                break;
              }
              case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
                const bookingStatus = BookingStatus.CONFIRMED;
                await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.COMBO: {
                const bookingStatus = BookingStatus.CONFIRMED;
                await this.bookingService.confirmCombinedBookingOnly(bookingId, bookingStatus);
                break;
              }
              case BookingType.TICKET:{
                const bookingStatus = BookingStatus.CONFIRMED;
                await this.seatBookingService.confirmBooking(bookingId)
                break
              }
              case BookingType.TABLE:{
                await this.tableBookingService.confirmBooking(bookingId)
                break
              }
              default:
                throw new Error(`Unknown booking type: ${type}`);
            }
          } else {
            // For CANCEL (and other statuses), retain previous comprehensive update behavior
            switch (type) {
              case BookingType.ARTIST: {
                const bookingStatus = BookingStatus.CANCELLED;
                await this.bookingService.updateArtistBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.EQUIPMENT: {
                const bookingStatus = BookingStatus.CANCELLED;
                await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.EQUIPMENT_PACKAGE: {
                await this.equipmentPackageBookingService.updateBookingStatus(bookingId, String(userId), { status: 'cancelled' });
                break;
              }
              case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
                const bookingStatus = BookingStatus.CANCELLED;
                await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.COMBO: {
                const bookingStatus = BookingStatus.CANCELLED;
                await this.bookingService.updateCombinedBookingStatus(bookingId, bookingStatus, status);
                break;
              }
              case BookingType.TICKET:{
                await this.seatBookingService.cancelBooking(bookingId)
                break
              }
              case BookingType.TABLE:{
                await this.tableBookingService.cancelBooking(bookingId)
                break
              }
              default:
                throw new Error(`Unknown booking type: ${type}`);
            }
          }
          this.logger.log(
            `Successfully updated booking ${bookingId} (type: ${type}) to status ${status} for user ${userId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to update booking ${bookingId} (type: ${type}, status: ${status}, user: ${userId}): ${error.message}`,
            error.stack,
          );
          throw error
        }
      },
      {
        connection: this.redisService.getClient(),
        concurrency: 10
      }
    );

    console.log('=== Worker created, setting up event handlers ===');

    worker.on('completed', (job) => {
      console.log(`=== JOB COMPLETED: ${job.id} ===`);
      this.logger.log(`Job #${job.id} completed successfully for booking ${job.data?.bookingId}`);
    });

    worker.on('failed', (job, err) => {
      const jobId = job?.id ?? 'unknown';
      const bookingId = job?.data?.bookingId ?? 'unknown';
      const errMessage = (err && (err as Error).message) ?? String(err);
      console.log(`=== JOB FAILED: ${jobId} for booking ${bookingId} ===`);
      this.logger.error(`Job #${jobId} for booking ${bookingId} failed: ${errMessage}`, err?.stack);   
    });

    worker.on('progress', (job, progress) => {
      this.logger.debug(`Job #${job.id} progress: ${progress}%`);
    });

    worker.on('ready', () => {
      console.log('=== Worker is ready and connected to Redis ===');
    });

    worker.on('error', (err) => {
      console.log('=== Worker error ===', err);
      this.logger.error('Worker error:', err);
    });

    this.logger.log('BookingStatusWorker initialized and listening for jobs...');
  }
}
