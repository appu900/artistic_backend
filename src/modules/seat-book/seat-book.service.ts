import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Seat,
  SeatDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { SeatBookDto } from './dto/seatBook.dto';
import { Lock } from 'redlock';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SeatLockingService } from 'src/infrastructure/redis/seat-lock.service';
import {
  TicketBooking,
  TicketBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Ticket_booking';

interface BookingResult {
  bookingId: string;
  seats: any[];
  totalAmount: number;
  expiresAt: Date;
}
@Injectable()
export class SeatBookService {
  private readonly logger = new Logger(SeatBookService.name);
  private readonly BOOKING_TTL = 300000;
  constructor(
    @InjectModel(Seat.name) private readonly seatModel: Model<SeatDocument>,
    @InjectModel(TicketBooking.name)
    private readonly ticketBookingModel: Model<TicketBookingDocument>,
    private redisService: RedisService,
    private seatLockingService: SeatLockingService,
  ) {}

  private async lockSeatsInDb(
    seatIds: string[],
    userId: string,
  ): Promise<void> {
    const result = await this.seatModel.updateMany(
      {
        _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
        bookingStatus: 'available',
      },
      {
        $set: {
          bookingStatus: 'blocked',
          userId: new Types.ObjectId(userId),
        },
      },
    );

    if (result.modifiedCount !== seatIds.length) {
      this.logger.error('Failed to lock seats');
      throw new ConflictException('Failed to book seats');
    }
    this.logger.log(`Locked seats in the database`);
  }


  private async simulatePayment(bookingId: string): Promise<boolean> {
    this.logger.log(`Processing payment for booking ${bookingId}...`);

    return new Promise((resolve) => {
      setTimeout(() => {
        const success = false
        this.logger.log(
          `Payment ${success ? 'succeeded' : 'failed'} for booking ${bookingId}`,
        );
        resolve(success);
      }, 3000);
    });
  }

  private async confirmBooking(
    bookingId: string,
    seatIds: string[],
  ): Promise<void> {
    // Update booking status
    await this.ticketBookingModel.findByIdAndUpdate(bookingId, {
      status: 'confirmed',
      bookedAt: new Date(),
      paymentStatus: 'completed',
      paymentId: `PAY_${Date.now()}`,
    });

    // Update seats to booked
    await this.seatModel.updateMany(
      {
        _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
      },
      {
        $set: {
          bookingStatus: 'booked',
        },
      },
    );

    this.logger.log(
      `Booking ${bookingId} confirmed and seats marked as booked`,
    );
  }

  private async rollbackBooking(
    bookingId: string,
    seatIds: string[],
  ): Promise<void> {
    // Mark booking as cancelled
    await this.ticketBookingModel.findByIdAndUpdate(bookingId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: 'Payment failed or timeout',
    });

    // Unlock seats
    await this.unlockSeatsInDB(seatIds);

    this.logger.log(`Booking ${bookingId} rolled back`);
  }

  private async validateSeats(seatIds: string[], eventId: string) {
    const seats = await this.seatModel.find({
      _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
      eventId: new Types.ObjectId(eventId),
    });

    if (seats.length !== seatIds.length) {
      throw new NotFoundException('Some seats not found');
    }

    const unavailableSeats = seats.filter(
      (seat) => seat.bookingStatus !== 'available',
    );
    if (unavailableSeats.length > 0) {
      throw new ConflictException(
        `Seats ${unavailableSeats.map((s) => s.seatId).join(', ')} are not available`,
      );
    }
    return seats;
  }

  private async unlockSeatsInDB(seatIds: string[]): Promise<void> {
    await this.seatModel.updateMany(
      {
        _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
      },
      {
        $set: {
          bookingStatus: 'available',
          userId: null,
        },
      },
    );

    this.logger.log(`Unlocked ${seatIds.length} seats in database`);
  }

// seat-book main func
//@ts-ignore
 async bookSeats(dto: SeatBookDto, userId: string) {
  let redisLock: Lock | null = null;
  let bookingDoc: TicketBookingDocument | null = null;
  let bookingId: string | null = null;
  let bookingTotalAmount: number | null = null;
  let bookingExpiresAt: Date | null = null;
  const seatIds = dto.seatIds;
  const ttlMs = this.BOOKING_TTL;

  const seats = await this.validateSeats(seatIds, dto.eventId);

  try {
    redisLock = await this.seatLockingService.lockMultipleSeats(seatIds, userId, ttlMs);

    const mongoConnection = this.ticketBookingModel.db;
    const session = await mongoConnection.startSession();

    await session.withTransaction(async () => {
      const availableCount = await this.seatModel.countDocuments(
        {
          _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
          bookingStatus: 'available',
        },
      ).session(session);

      if (availableCount !== seatIds.length) {
        throw new ConflictException('Some seats are no longer available');
      }

      const res = await this.seatModel.updateMany(
        {
          _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
          bookingStatus: 'available',
        },
        {
          $set: {
            bookingStatus: 'blocked',
            userId: new Types.ObjectId(userId),
          },
        },
        { session },
      );

      if (res.modifiedCount !== seatIds.length) {
        throw new ConflictException('Failed to lock seats in DB');
      }

      const totalAmount = seats.reduce((sum, seat) => sum + seat.price, 0);
      const [created] = await this.ticketBookingModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            eventId: new Types.ObjectId(dto.eventId),
            seatIds: seatIds.map((id) => new Types.ObjectId(id)),
            totalAmount,
            status: 'pending',
            seatNumber: seats.map((s) => s.rl),
            expiresAt: new Date(Date.now() + ttlMs),
          },
        ],
        { session },
      );
      bookingDoc = created;
  
      bookingId = created._id?.toString() ?? null;
      bookingTotalAmount = created.totalAmount ?? null;
      bookingExpiresAt = created.expiresAt ?? null;
    });

    session.endSession();

    if (!bookingId) {
      throw new BadRequestException('Booking creation failed unexpectedly');
    }

    
    this.logger.log(`Booking created: ${bookingId}, starting payment...`);

    const paymentSuccess = await this.simulatePayment(bookingId);

    if (paymentSuccess) {
      await this.confirmBooking(bookingId, seatIds);

      if (redisLock) {
        await this.seatLockingService.unlockMultipleSeats(redisLock, seatIds);
        redisLock = null;
      }

      this.logger.log(`Booking ${bookingId} confirmed successfully`);
      return {
        bookingId,
        seats,
        totalAmount: bookingTotalAmount!,
        expiresAt: bookingExpiresAt!,
      };
    } else {
      throw new BadRequestException('Payment failed');
    }
  } catch (error) {
    this.logger.error('Booking failed:', error);

 
    if (bookingId) {
      await this.rollbackBooking(bookingId, seatIds);
    } else {
      await this.unlockSeatsInDB(seatIds);
    }

    if (redisLock) {
      try {
        await this.seatLockingService.unlockMultipleSeats(redisLock, seatIds);
      } catch (e) {
        this.logger.error('Failed to release redis lock in error path:', e);
      }
    }

    throw error;
  }
}



  async 



  async cancelBooking(bookingId: string, userId: string): Promise<void> {
    const booking = await this.ticketBookingModel.findOne({
      _id: bookingId,
      userId: new Types.ObjectId(userId),
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === 'confirmed') {
      throw new BadRequestException('Cannot cancel confirmed booking');
    }

    // Unlock seats
    // const seatIds = booking.allSeatIds.map((id) => id.toString());
    const seatIds = booking.seatIds.map((id) => id.toString());
    await this.unlockSeatsInDB(seatIds);

    // Update booking
    await this.ticketBookingModel.findByIdAndUpdate(bookingId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: 'User cancelled',
    });

    this.logger.log(`Booking ${bookingId} cancelled by user`);
  }

  async getUserBookings(userId: string): Promise<TicketBookingDocument[]> {
    return await this.ticketBookingModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('seatIds')
      .sort({ createdAt: -1 });
  }
}
