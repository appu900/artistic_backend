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
import {
  Table,
  TableDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import {
  Booth,
  BoothDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  constructor(
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    @InjectModel(OpenBookingLayout.name)
    private openBookingModel: Model<OpenBookingLayoutDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Table.name) private tableModel: Model<TableDocument>,
    @InjectModel(Booth.name) private boothModel: Model<BoothDocument>,
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
      items: [],
      spatialGrid,
      isDeleted: false,
    });

    const OpenlayoutId = openLayout._id;

    // table booking

    const tablesInLayout =
      layout?.items?.filter((item) => item.type === 'table') ?? [];
    let createdTables = [];

    if (tablesInLayout.length > 0) {
      const tableDocs = tablesInLayout.map((tbl) => ({
        table_id: tbl.id,
        name: tbl.lbl || 'Unnamed Table',
        color:
          layout?.categories.find((c) => c.id === tbl.catId)?.color ||
          '#cccccc',
        layoutId: OpenlayoutId,
        pos: tbl.pos,
        size: tbl.size,
        rot: tbl.rot || 0,
        lbl: tbl.lbl,
        catId: tbl.catId,
        price: priceMap.get(tbl.catId ?? '') ?? tbl.price ?? 0,
        ts: tbl.ts || 0,
        sc: tbl.sc || 0,
      }));
      let createdTables: TableDocument[] = [];
      //@ts-ignore
      createdTables = await this.tableModel.insertMany(tableDocs);
      this.logger.log(`✅ Created ${createdTables.length} tables`);

      openLayout.items.push(
        ...createdTables.map((t) => ({
          refId: t._id as Types.ObjectId,
          modelType: 'Table' as const,
        })),
      );
    }

    // booth woek to be done
    const boothsInLayout =
      layout?.items?.filter((item) => item.type === 'booth') ?? [];
    if (boothsInLayout.length > 0) {
      const boothDocs = boothsInLayout.map((booth) => ({
        booth_id: booth.id,
        name: booth.lbl || 'Unnamed Booth',
        color:
          layout?.categories.find((c) => c.id === booth.catId)?.color ||
          '#cccccc',
        layoutId: OpenlayoutId,
        pos: booth.pos,
        size: booth.size,
        rot: booth.rot || 0,
        lbl: booth.lbl,
        catId: booth.catId,
        price: priceMap.get(booth.catId ?? '') ?? booth.price ?? 0,
        bookingStatus: 'available',
        eventId: new Types.ObjectId(eventId),
      }));

      const createdBooths = await this.boothModel.insertMany(boothDocs);
      this.logger.log(`✅ Created ${createdBooths.length} booths`);

      openLayout.items.push(
        ...createdBooths.map((b) => ({
          refId: b._id as Types.ObjectId,
          modelType: 'Booth' as const,
        })),
      );
    }

    // seat layout work
    const seatMap = new Map();

    const seatToInsert = layout?.seats.map((seat) => ({
      seatId: seat.id,
      layoutId: OpenlayoutId,
      catId: seat.catId,
      price: priceMap.get(seat.catId ?? '') ?? 0,
      bookingStatus: 'available',
      pos: seat.pos,
      size: seat.size,
      rot: seat.rot,
      rl: seat.rl,
      sn: seat.sn,
      eventId: new Types.ObjectId(eventId),
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

  async eventLayoutDetails(openLayoutId: string) {
    const objectId = new Types.ObjectId(openLayoutId);

    const details = await this.openBookingModel
      .findById(objectId)
      .populate({
        path: 'items.refId',
      })
      .populate({
        path: 'seats',
        model: 'Seat',
      })
      .lean();
    return details;
  }
}
