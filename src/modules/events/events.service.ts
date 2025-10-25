import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { read } from 'fs';
import { Model, Types } from 'mongoose';
import {
  OpenBookingLayout,
  OpenBookingLayoutDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Open-seat-booking.schema';
import {
  SeatLayout,
  SeatLayoutDocument,
  SeatLayoutSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { BookingStatus } from '../booking/dto/booking.dto';
import {
  Seat,
  SeatDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  constructor(
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    @InjectModel(OpenBookingLayout.name)
    private openBookingModel: Model<OpenBookingLayoutDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
  ) {}

  async openTicketBookingForEvent(layoutId: string, eventId: string) {
    // to be implmented : fetch event details from event Model & at the end attach openBookingLayout Id to event ticket booking
    // 1 open booing for seat one for table and one for booth

    // fetch the layout details
    const objectLayoutId = new Types.ObjectId(layoutId);
    const layout = await this.seatLayoutModel.findById(objectLayoutId);
    this.logger.log('layout Data:', layout);

    const priceMap = new Map(layout?.categories.map((c) => [c.id, c.price]));

    // here we are doing the spatialGrid clone
    const spatialGrid: {
      cellSize: number;
      gridWidth: number;
      gridHeight: number;
      cellIndex: Record<string, Types.ObjectId[]>;
    } = {
      cellSize: layout?.spatialGrid?.cellSize ?? 100,
      gridWidth: layout?.spatialGrid?.gridWidth ?? 12,
      gridHeight: layout?.spatialGrid?.gridHeight ?? 8,
      cellIndex: {} as Record<string, Types.ObjectId[]>,
    };

    const openLayout = await this.openBookingModel.create({
      name: layout?.name,
      venueOwnerId: layout?.venueOwnerId,
      categories: layout?.categories,
      items: layout?.items,
      spatialGrid,
      isDeleted: false,
    });

    const OpenlayoutId = openLayout._id;
    const seatMap = new Map();

    const seatToInsert = layout?.seats.map((seat) => ({
      seatId: seat.id,
      layoutId: OpenlayoutId,
      catId: seat.catId,
      price: priceMap.get(seat.catId) || 0,
      bookingStatus: 'available',
      pos: seat.pos,
      size: seat.size,
      rot: seat.rot,
      rl: seat.rl,
      sn: seat.sn,
      eventId:new Types.ObjectId(eventId)
    }));

    const createdSeats = await this.seatModel.insertMany(seatToInsert);
    console.log('seat created', createdSeats);

    // here we are creating a hashmap for quicjk lookup for which seat belongs to which seatid
    createdSeats.forEach((s) => seatMap.set(s.seatId, s._id));

    for (const [cellKey, ids] of Object.entries(
      layout?.spatialGrid?.cellIndex ?? {},
    )) {
      spatialGrid.cellIndex[cellKey] = (ids ?? [])
        .map((seatId) => seatMap.get(seatId) as Types.ObjectId)
        .filter(Boolean);
    }

    openLayout.seats = createdSeats.map((s) => s._id as Types.ObjectId);
    openLayout.spatialGrid = spatialGrid;
    await openLayout.save();
    return openLayout;
  }
}
