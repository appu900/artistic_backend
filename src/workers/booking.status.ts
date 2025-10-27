import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { BookingStatus } from 'src/modules/booking/dto/booking.dto';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';

@Injectable()
export class BookingStatusWorker implements OnModuleInit {
  private readonly logger = new Logger(BookingStatusWorker.name);
  constructor(
    private readonly redisService: RedisService,
    private readonly bookingService: BookingService,
  ) {}
  onModuleInit() {
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
        this.logger.log(
          `Processing job ${job.id} for booking ${bookingId} | User: ${userId} | Type: ${type} | Status: ${status}`,
        );
        try {
          let booking;
          switch (type) {
            case BookingType.ARTIST:
              booking = await this.bookingService.getArtistBookingById(bookingId)
              break;
            // do somethng
            case BookingType.EQUIPMENT:
              booking = await this.bookingService.getEquipmentBookingById(bookingId)
              break;
            // do somethinh
            case BookingType.EQUIPMENT_PACKAGE:
            case BookingType.CUSTOM_EQUIPMENT_PACKAGE:
              // For equipment package bookings, we need to handle them via the equipment package booking service
              // For now, we'll treat them as regular equipment bookings since they use the same system
              booking = await this.bookingService.getEquipmentBookingById(bookingId)
              break;
            case BookingType.COMBO:
              break;
            // do something
            default:
              throw new Error(`Unknown booking type: ${type}`);
          }

          if (!booking) {
            throw new Error(`Booking ${bookingId} not found for type ${type}`);
          }

          // ** update status in the specific

          switch (type) {
            case BookingType.ARTIST:
              const us  = (status === UpdatePaymentStatus.CONFIRMED) ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED
              await this.bookingService.updateArtistBookingStatus(bookingId,us,status)
              break;
            case BookingType.EQUIPMENT:
            case BookingType.EQUIPMENT_PACKAGE:
            case BookingType.CUSTOM_EQUIPMENT_PACKAGE:
              const updatestatus = (status === UpdatePaymentStatus.CONFIRMED) ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED
              await this.bookingService.updateEquipmentBookingStatus(bookingId,updatestatus,status)
              break;
            case BookingType.COMBO:
              break;

            default:
              throw new Error(`Unknown booking type: ${type}`);
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
        connection:this.redisService.getClient(),
        concurrency:10
      }
    );

    worker.on('completed', (job) => {
      this.logger.log(`Job #${job.id} completed successfully for booking ${job.data?.bookingId}`);
    });

    worker.on('failed', (job, err) => {
      const jobId = job?.id ?? 'unknown';
      const bookingId = job?.data?.bookingId ?? 'unknown';
      const errMessage = (err && (err as Error).message) ?? String(err);
      this.logger.error(`Job #${jobId} for booking ${bookingId} failed: ${errMessage}`, err?.stack);   
    });

    worker.on('progress', (job, progress) => {
      this.logger.debug(`Job #${job.id} progress: ${progress}%`);
    });

    this.logger.log('BookingStatusWorker initialized and listening for jobs...');
  }
}
