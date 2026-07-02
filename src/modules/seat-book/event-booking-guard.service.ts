import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Event,
  EventDocument,
  EventStatus,
} from 'src/infrastructure/database/schemas/event.schema';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import {
  TableBooking,
  TableBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import {
  BoothBooking,
  BoothBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';

@Injectable()
export class EventBookingGuardService {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(SeatBooking.name)
    private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
  ) {}

  /**
   * Validates that an event is bookable and the user hasn't exceeded limits.
   */
  async validateEventForBooking(
    eventId: string,
    userId: string,
    requestedTicketCount: number,
  ): Promise<EventDocument> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }

    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new ConflictException('Event is not available for booking');
    }

    if (!event.allowBooking) {
      throw new ConflictException('Booking is not enabled for this event');
    }

    if (!event.openBookingLayoutId) {
      throw new ConflictException('Event seating layout is not ready');
    }

    const now = new Date();
    if (event.bookingStartDate && now < new Date(event.bookingStartDate)) {
      throw new ConflictException('Booking has not opened yet');
    }
    if (event.bookingEndDate && now > new Date(event.bookingEndDate)) {
      throw new ConflictException('Booking period has ended');
    }

    if (requestedTicketCount < 1) {
      throw new BadRequestException('Select at least one item to book');
    }

    if (event.availableTickets > 0 && requestedTicketCount > event.availableTickets) {
      throw new ConflictException(
        `Only ${event.availableTickets} tickets remaining`,
      );
    }

    if (event.maxTicketsPerUser > 0) {
      const userOid = new Types.ObjectId(userId);
      const eventOid = new Types.ObjectId(eventId);
      const activeStatuses = ['pending', 'confirmed'];

      const [seatCount, tableCount, boothCount] = await Promise.all([
        this.seatBookingModel.aggregate([
          { $match: { userId: userOid, eventId: eventOid, status: { $in: activeStatuses } } },
          { $project: { count: { $size: '$seatIds' } } },
          { $group: { _id: null, total: { $sum: '$count' } } },
        ]).then((r) => r[0]?.total ?? 0),
        this.tableBookingModel.aggregate([
          { $match: { userId: userOid, eventId: eventOid, status: { $in: activeStatuses } } },
          { $project: { count: { $size: '$tableIds' } } },
          { $group: { _id: null, total: { $sum: '$count' } } },
        ]).then((r) => r[0]?.total ?? 0),
        this.boothBookingModel.aggregate([
          { $match: { userId: userOid, eventId: eventOid, status: { $in: activeStatuses } } },
          { $project: { count: { $size: '$boothIds' } } },
          { $group: { _id: null, total: { $sum: '$count' } } },
        ]).then((r) => r[0]?.total ?? 0),
      ]);
      const existingTickets = seatCount + tableCount + boothCount;

      if (existingTickets + requestedTicketCount > event.maxTicketsPerUser) {
        throw new ConflictException(
          `Maximum ${event.maxTicketsPerUser} tickets per user. You already have ${existingTickets} booked.`,
        );
      }
    }

    return event;
  }

  /** Atomically update sold/available ticket counters on confirmation. */
  async incrementSoldTickets(
    eventId: Types.ObjectId,
    count: number,
  ): Promise<void> {
    if (count <= 0) return;

    // Always record sold tickets.
    await this.eventModel.updateOne(
      { _id: eventId },
      { $inc: { soldTickets: count } },
    );

    // Only decrement availableTickets when it is being actively tracked (> 0).
    // availableTickets === 0 means "unlimited" — do NOT subtract.
    await this.eventModel.updateOne(
      { _id: eventId, availableTickets: { $gt: 0 } },
      { $inc: { availableTickets: -count } },
    );
  }
}
