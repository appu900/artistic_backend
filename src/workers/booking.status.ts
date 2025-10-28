import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { BookingStatus } from 'src/modules/booking/dto/booking.dto';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { EquipmentPackageBookingService } from 'src/modules/equipment-package-booking/equipment-package-booking.service';

@Injectable()
export class BookingStatusWorker implements OnModuleInit {
  private readonly logger = new Logger(BookingStatusWorker.name);
  constructor(
    private readonly redisService: RedisService,
    private readonly bookingService: BookingService,
    private readonly equipmentPackageBookingService: EquipmentPackageBookingService,
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
          `Processing job ${job.id} for booking ${bookingId} | User: ${String(userId)} | Type: ${type} | Status: ${status}`,
        );
        try {
          let booking;
          switch (type) {
            case BookingType.ARTIST:
              // TODO: Implement artist booking retrieval in BookingService
              // booking = await this.bookingService.getArtistBookingById(bookingId)
              break;
            case BookingType.EQUIPMENT:
              booking = await this.bookingService.getEquipmentBookingById(bookingId);
              break;
            case BookingType.EQUIPMENT_PACKAGE:
              // Resolve existence by attempting fetch via equipment package booking service
              booking = await this.equipmentPackageBookingService.getBookingById(bookingId, String(userId));
              break;
            case BookingType.CUSTOM_EQUIPMENT_PACKAGE:
              // Custom equipment bookings are stored in equipment bookings collection
              booking = await this.bookingService.getEquipmentBookingById(bookingId);
              break;
            case BookingType.COMBO:
              break;
            default:
              throw new Error(`Unknown booking type: ${type}`);
          }

          if (!booking) {
            throw new Error(`Booking ${bookingId} not found for type ${type}`);
          }

          // ** update status in the specific

          switch (type) {
            case BookingType.ARTIST: {
              // TODO: Implement artist booking status update in BookingService
              break;
            }
            case BookingType.EQUIPMENT: {
              const bookingStatus = status === UpdatePaymentStatus.CONFIRMED ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED;
              await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
              break;
            }
            case BookingType.EQUIPMENT_PACKAGE: {
              const newStatus = status === UpdatePaymentStatus.CONFIRMED ? 'confirmed' : 'cancelled';
              await this.equipmentPackageBookingService.updateBookingStatus(bookingId, String(userId), { status: newStatus });
              break;
            }
            case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
              const bookingStatus = status === UpdatePaymentStatus.CONFIRMED ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED;
              await this.bookingService.updateEquipmentBookingStatus(bookingId, bookingStatus, status);
              break;
            }
            case BookingType.COMBO: {
              break;
            }
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
