import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException,
  ConflictException,
  ForbiddenException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OpenBookingLayout,
  OpenBookingLayoutDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Open-seat-booking.schema';
import {
  SeatLayout,
  SeatLayoutDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
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
import {
  Event,
  EventDocument,
  EventStatus,
  EventVisibility,
} from 'src/infrastructure/database/schemas/event.schema';
import {
  EventTicketBooking,
  EventTicketBookingDocument,
  TicketStatus,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/EventTicketBooking.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
  PerformancePreference,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  EquipmentBooking,
  EquipmentBookingDocument,
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableDocument,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PaymentService } from 'src/payment/payment.service';
import { BookingType } from '../booking/interfaces/bookingType';
import { BookingStatus } from '../booking/dto/booking.dto';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';
import { User, UserDocument } from 'src/infrastructure/database/schemas';

export interface CreateEventDto {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  visibility: EventVisibility;
  performanceType: string;
  venue: {
    name: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode?: string;
    capacity?: number;
    venueType?: string;
    facilities?: string[];
  };
  seatLayoutId?: string;
  artists?: Array<{
    artistId?: string;
    fee: number;
    isCustomArtist?: boolean;
    customArtistName?: string;
    customArtistPhoto?: string;
    notes?: string;
  }>;
  equipment?: Array<{
    equipmentId: string;
    quantity: number;
    notes?: string;
  }>;
  pricing: {
    basePrice: number;
    categoryPricing?: Record<string, number>;
    tablePricing?: Record<string, number>;
    boothPricing?: Record<string, number>;
    serviceFee?: number;
    taxPercentage?: number;
  };
  tags?: string[];
  genres?: string[];
  allowBooking?: boolean;
  bookingStartDate?: Date;
  bookingEndDate?: Date;
  maxTicketsPerUser?: number;
  contactEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  termsAndConditions?: string;
  cancellationPolicy?: string;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  coverPhoto?: string;
}

export interface EventFilters {
  page?: number;
  limit?: number;
  status?: EventStatus;
  visibility?: EventVisibility;
  performanceType?: string;
  city?: string;
  state?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  createdBy?: string;
  venueOwnerId?: string;
}

export interface BookEventTicketsDto {
  eventId: string;
  userId: string;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
    address?: string;
    emergencyContact?: string;
    specialRequests?: string;
  };
  seats?: Array<{
    seatId: string;
    categoryId: string;
    price: number;
  }>;
  tables?: Array<{
    tableId: string;
    categoryId: string;
    price: number;
  }>;
  booths?: Array<{
    boothId: string;
    categoryId: string;
    price: number;
  }>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  
  constructor(
    @InjectModel(Event.name)
    private eventModel: Model<EventDocument>,
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    @InjectModel(OpenBookingLayout.name)
    private openBookingModel: Model<OpenBookingLayoutDocument>,
    @InjectModel(Seat.name) 
    private seatModel: Model<SeatDocument>,
    @InjectModel(Table.name) 
    private tableModel: Model<TableDocument>,
    @InjectModel(Booth.name) 
    private boothModel: Model<BoothDocument>,
    @InjectModel(EventTicketBooking.name)
    private ticketBookingModel: Model<EventTicketBookingDocument>,
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(EquipmentBooking.name)
    private equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(ArtistUnavailable.name)
    private artistUnavailableModel: Model<ArtistUnavailableDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private s3Service: S3Service,
    private redisService: RedisService,
    private paymentService: PaymentService,
    private emailService: EmailService,
  ) {}


  /**
   * Create a new event (Admin or Venue Owner)
   */
  async createEvent(
    createEventDto: CreateEventDto,
    createdBy: string,
    createdByRole: 'admin' | 'venue_owner',
    venueOwnerId?: string,
    coverPhotoFile?: Express.Multer.File,
    additionalFiles?: Array<Express.Multer.File>
  ): Promise<EventDocument> {
    try {
      // Idempotency: prevent duplicate rapid submissions creating multiple events
      const lockKeyBase = `${createEventDto.name || 'event'}:${createEventDto.startDate}:${createEventDto.startTime}:${createdBy || 'anon'}`;
      const lockKey = `event:create:lock:${Buffer.from(lockKeyBase).toString('base64')}`;
      const redisClient = this.redisService.getClient();
      const lockAcquired = await redisClient.setnx(lockKey, '1');
      if (lockAcquired === 0) {
        throw new BadRequestException('Duplicate event creation detected. Please wait a moment and try again.');
      }
      await redisClient.expire(lockKey, 15);

      // Normalize DTO in case fields arrived as JSON strings via multipart
      const dto = this.normalizeCreateEventDto(createEventDto);

      // Extract cover photo from files array if not provided separately
      let coverPhoto = coverPhotoFile;
      const customArtistPhotoFiles: { [key: string]: Express.Multer.File } = {};
      
      if (additionalFiles && additionalFiles.length > 0) {
        for (const file of additionalFiles) {
          if (file.fieldname === 'coverPhoto' && !coverPhoto) {
            coverPhoto = file;
          } else if (file.fieldname.startsWith('customArtistPhoto_')) {
            customArtistPhotoFiles[file.fieldname] = file;
          }
        }
      }

      // Validate performance type against artist availability
      if (dto.artists?.length) {
        await this.validateArtistsForEvent(dto.artists, dto.performanceType);
      }

      // Validate equipment availability
      if (dto.equipment?.length) {
        await this.validateEquipmentForEvent(dto.equipment, dto.startDate, dto.endDate);
      }

      // Upload cover photo if provided
      let coverPhotoUrl = '';
      if (coverPhoto) {
        coverPhotoUrl = await this.s3Service.uploadFile(coverPhoto, 'events/covers');
      }

  // Prepare artist data (include any uploaded custom artist photos)
  const artists = await this.prepareEventArtists(dto.artists || [], customArtistPhotoFiles);
      
      // Prepare equipment data
      const equipment = await this.prepareEventEquipment(dto.equipment || []);

      // Calculate total capacity from seat layout if provided
      let totalCapacity = dto.venue?.capacity || 0;
      if (dto.seatLayoutId) {
        const layout = await this.seatLayoutModel.findById(dto.seatLayoutId);
        if (layout) {
          totalCapacity = layout.seats.length + 
            layout.items.filter(item => item.type === 'table').reduce((sum, table) => sum + (table.sc || 0), 0) +
            layout.items.filter(item => item.type === 'booth').length;
        }
      }

      const event = new this.eventModel({
        ...dto,
        coverPhoto: coverPhotoUrl,
        createdBy: new Types.ObjectId(createdBy),
        createdByRole,
        venueOwnerId: venueOwnerId ? new Types.ObjectId(venueOwnerId) : undefined,
        seatLayoutId: dto.seatLayoutId ? new Types.ObjectId(dto.seatLayoutId) : undefined,
        artists,
        equipment,
        totalCapacity,
        availableTickets: totalCapacity,
        soldTickets: 0,
      });

      const savedEvent = await event.save();
  this.logger.log(`✅ Event created: ${savedEvent._id} by ${createdByRole}: ${createdBy}`);

      // Handle booking creation based on role
      if (createdByRole === 'admin') {
        // Admin creates events without payment - just mark artists/equipment as unavailable and create bookings
        await this.createAdminEventBookings(savedEvent, artists, equipment);
      } else if (createdByRole === 'venue_owner') {
        // Venue owner event creation - bookings will be handled by payment flow if needed
        // For now, just log that venue owner created the event
        this.logger.log(`Venue owner event created - payment/booking flow will be handled separately if needed`);
      }
      
      return savedEvent;
    } catch (error) {
      this.logger.error('Failed to create event:', error);
      throw new BadRequestException('Failed to create event: ' + error.message);
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    eventId: string,
    updateEventDto: UpdateEventDto,
    userId: string,
    userRole: 'admin' | 'venue_owner',
    coverPhotoFile?: Express.Multer.File
  ): Promise<EventDocument> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole === 'venue_owner' && event.createdByRole === 'admin') {
      throw new ForbiddenException('Venue owners cannot edit admin-created events');
    }
    
    if (userRole === 'venue_owner' && event.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own events');
    }

    // Upload new cover photo if provided
    if (coverPhotoFile) {
      updateEventDto.coverPhoto = await this.s3Service.uploadFile(coverPhotoFile, 'events/covers');
    }

    // Normalize and update artists/equipment if provided (multipart JSON strings)
    const normalizedUpdate: UpdateEventDto = this.normalizeUpdateEventDto(updateEventDto);

    if (normalizedUpdate.artists) {
      normalizedUpdate.artists = await this.prepareEventArtists(normalizedUpdate.artists);
    }

    if (normalizedUpdate.equipment) {
      normalizedUpdate.equipment = await this.prepareEventEquipment(normalizedUpdate.equipment);
    }

    Object.assign(event, normalizedUpdate);
    const updatedEvent = await event.save();
    
    this.logger.log(`✅ Event updated: ${eventId} by ${userRole}: ${userId}`);
    return updatedEvent;
  }

  /**
   * Get event by ID with full details
   */
  async getEventById(eventId: string, includeDeleted = false): Promise<EventDocument> {
    const query: any = { _id: eventId };
    if (!includeDeleted) {
      query.isDeleted = false;
    }

    const event = await this.eventModel
      .findOne(query)
      .populate('createdBy', 'name email')
      .populate('venueOwnerId', 'businessName contactEmail')
      .populate('seatLayoutId')
      .populate('artists.artistId', 'stageName profileImage category')
      .populate('equipment.equipmentId', 'name category pricePerDay')
      .lean();

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event as any;
  }

  /**
   * Increment view count for an event
   */
  async incrementViewCount(eventId: string): Promise<void> {
    await this.eventModel.findByIdAndUpdate(
      eventId,
      { $inc: { viewCount: 1 } },
      { new: true }
    );
  }

  /**
   * Get events with filtering and pagination
   */
  async getEvents(filters: EventFilters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      visibility,
      performanceType,
      city,
      state,
      startDate,
      endDate,
      search,
      createdBy,
      venueOwnerId,
    } = filters;

    const query: any = { isDeleted: false };

    // Apply filters
    if (status) query.status = status;
    if (visibility) query.visibility = visibility;
    if (performanceType) query.performanceType = performanceType;
    if (city) query['venue.city'] = new RegExp(city, 'i');
    if (state) query['venue.state'] = new RegExp(state, 'i');
    if (createdBy) query.createdBy = createdBy;
    if (venueOwnerId) query.venueOwnerId = venueOwnerId;

    // Date range filter
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = startDate;
      if (endDate) query.startDate.$lte = endDate;
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    
    const [events, total] = await Promise.all([
      this.eventModel
        .find(query)
        .populate('createdBy', 'name email')
        .populate('venueOwnerId', 'businessName')
        .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.eventModel.countDocuments(query),
    ]);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get public events for homepage
   */
  async getPublicEvents(filters: Partial<EventFilters> = {}) {
    return this.getEvents({
      ...filters,
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
    });
  }

  /**
   * Get events by performance type
   */
  async getEventsByPerformanceType(performanceType: string, filters: Partial<EventFilters> = {}) {
    return this.getEvents({
      ...filters,
      performanceType,
      status: EventStatus.PUBLISHED,
    });
  }

  /**
   * Publish an event (make it bookable)
   */
  async publishEvent(eventId: string, userId: string, userRole: 'admin' | 'venue_owner'): Promise<EventDocument> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole === 'venue_owner' && event.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only publish your own events');
    }

    // Validate event is ready for publishing
    if (!event.seatLayoutId) {
      throw new BadRequestException('Event must have a seat layout before publishing');
    }

    if (event.artists.length === 0) {
      throw new BadRequestException('Event must have at least one artist before publishing');
    }

    // Create open booking layout for ticket sales
    const openBookingLayout = await this.openTicketBookingForEvent(
      event.seatLayoutId.toString(),
      eventId
    );

    event.status = EventStatus.PUBLISHED;
    event.openBookingLayoutId = openBookingLayout._id as Types.ObjectId;
    event.allowBooking = true;

    const publishedEvent = await event.save();
    this.logger.log(`✅ Event published: ${eventId} by ${userRole}: ${userId}`);
    
    return publishedEvent;
  }

  /**
   * Cancel an event
   */
  async cancelEvent(eventId: string, userId: string, userRole: 'admin' | 'venue_owner', reason?: string): Promise<EventDocument> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole === 'venue_owner' && event.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own events');
    }

    event.status = EventStatus.CANCELLED;
    event.allowBooking = false;

    const cancelledEvent = await event.save();

    // TODO: Handle refunds for existing bookings
    // TODO: Send cancellation notifications

    this.logger.log(`✅ Event cancelled: ${eventId} by ${userRole}: ${userId}. Reason: ${reason}`);
    return cancelledEvent;
  }

  /**
   * Soft delete an event
   */
  async deleteEvent(eventId: string, userId: string, userRole: 'admin' | 'venue_owner'): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole === 'venue_owner' && event.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own events');
    }

    // Check if event has bookings
    const hasBookings = await this.ticketBookingModel.exists({ eventId, status: { $ne: TicketStatus.CANCELLED } });
    if (hasBookings) {
      throw new BadRequestException('Cannot delete event with active bookings');
    }

    event.isDeleted = true;
    event.deletedAt = new Date();
    event.deletedBy = new Types.ObjectId(userId);
    
    await event.save();
    this.logger.log(`✅ Event deleted: ${eventId} by ${userRole}: ${userId}`);
  }

  // ==================== TICKET BOOKING METHODS ====================

  /**
   * Open ticket booking for an event (creates OpenBookingLayout)
   */
  async openTicketBookingForEvent(layoutId: string, eventId: string) {
    // Fetch event details
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Fetch the layout details
    const objectLayoutId = new Types.ObjectId(layoutId);
    const layout = await this.seatLayoutModel.findById(objectLayoutId);
    if (!layout) {
      throw new NotFoundException('Seat layout not found');
    }

    this.logger.log('Creating open booking layout for event:', eventId);

    // Create price map from event pricing, fallback to layout categories
    const priceMap = new Map();
    
    // Use event-specific pricing if available
    if (event.pricing.categoryPricing) {
      for (const [categoryId, price] of Object.entries(event.pricing.categoryPricing)) {
        priceMap.set(categoryId, price);
      }
    }
    
    // Fallback to layout category pricing
    layout.categories.forEach(c => {
      if (!priceMap.has(c.id)) {
        priceMap.set(c.id, c.price);
      }
    });

    // Clone spatial grid
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
      name: `${layout.name} - ${event.name}`,
      venueOwnerId: layout.venueOwnerId,
      categories: layout.categories,
      items: [],
      spatialGrid,
      isDeleted: false,
    });

    const openLayoutId = openLayout._id;

    // Create table bookings
    const tablesInLayout = layout?.items?.filter((item) => item.type === 'table') ?? [];
    if (tablesInLayout.length > 0) {
      const tableDocs = tablesInLayout.map((tbl) => {
        // Collect decorative chairs linked to this table (by grpId)
        const chairs = (layout?.seats || [])
          .filter((s: any) => s.grpId === tbl.id)
          .map((s: any) => ({
            pos: s.pos,
            size: s.size,
            rl: s.rl,
            sn: s.sn,
          }));

        return {
        table_id: tbl.id,
        name: tbl.lbl || 'Unnamed Table',
        color: layout?.categories.find((c) => c.id === tbl.catId)?.color || '#cccccc',
        layoutId: openLayoutId,
        pos: tbl.pos,
        size: tbl.size,
        rot: tbl.rot || 0,
        lbl: tbl.lbl,
        catId: tbl.catId,
        price: (tbl.catId && event.pricing.tablePricing?.[tbl.catId]) || priceMap.get(tbl.catId ?? '') || tbl.price || 0,
        shp: tbl.shp, // preserve shape for UI rendering
        ts: tbl.ts || 0,
        sc: tbl.sc || 0,
          chairs,
        eventId: new Types.ObjectId(eventId),
        };
      });

      const createdTables = await this.tableModel.insertMany(tableDocs);
      this.logger.log(`✅ Created ${createdTables.length} tables for event ${eventId}`);

      openLayout.items.push(
        ...createdTables.map((t) => ({
          refId: t._id as Types.ObjectId,
          modelType: 'Table' as const,
        })),
      );
    }

    // Create booth bookings
    const boothsInLayout = layout?.items?.filter((item) => item.type === 'booth') ?? [];
    if (boothsInLayout.length > 0) {
      const boothDocs = boothsInLayout.map((booth) => ({
        booth_id: booth.id,
        name: booth.lbl || 'Unnamed Booth',
        color: layout?.categories.find((c) => c.id === booth.catId)?.color || '#cccccc',
        layoutId: openLayoutId,
        pos: booth.pos,
        size: booth.size,
        rot: booth.rot || 0,
        lbl: booth.lbl,
        catId: booth.catId,
        price: (booth.catId && event.pricing.boothPricing?.[booth.catId]) || priceMap.get(booth.catId ?? '') || booth.price || 0,
        bookingStatus: 'available',
        eventId: new Types.ObjectId(eventId),
      }));

      const createdBooths = await this.boothModel.insertMany(boothDocs);
      this.logger.log(`✅ Created ${createdBooths.length} booths for event ${eventId}`);

      openLayout.items.push(
        ...createdBooths.map((b) => ({
          refId: b._id as Types.ObjectId,
          modelType: 'Booth' as const,
        })),
      );
    }

    // Create seat bookings
    const seatMap = new Map();
    const seatToInsert = (layout?.seats || [])
      .filter((seat: any) => !seat.grpId) 
      .map((seat) => ({
        seatId: seat.id,
        layoutId: openLayoutId,
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
    this.logger.log(`✅ Created ${createdSeats.length} seats for event ${eventId}`);

    // Create seat mapping for spatial grid
    createdSeats.forEach((s) => seatMap.set(s.seatId, s._id));

    for (const [cellKey, ids] of Object.entries(layout?.spatialGrid?.cellIndex ?? {})) {
      spatialGrid.cellIndex[cellKey] = (ids ?? [])
        .map((seatId) => seatMap.get(seatId) as Types.ObjectId)
        .filter(Boolean);
    }

    openLayout.seats = createdSeats.map((s) => s._id as Types.ObjectId);
    openLayout.spatialGrid = spatialGrid;
    await openLayout.save();
    
    return openLayout;
  }

  /**
   * Rebuild the open booking layout for an event.
   * Deletes the existing OpenBookingLayout and its seats/tables/booths, then regenerates it
   * using the current SeatLayout. Ensures table chairs are not added as seats.
   */
  async rebuildOpenBooking(eventId: string, userId: string, userRole: 'admin' | 'venue_owner') {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Permission check for venue owners
    if (userRole === 'venue_owner' && event.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only rebuild your own events');
    }

    // Remove existing open layout artifacts if present
    if (event.openBookingLayoutId) {
      const openLayoutId = event.openBookingLayoutId as Types.ObjectId;
      await Promise.all([
        this.seatModel.deleteMany({ layoutId: openLayoutId }),
        this.tableModel.deleteMany({ layoutId: openLayoutId }),
        this.boothModel.deleteMany({ layoutId: openLayoutId }),
      ]);
      await this.openBookingModel.findByIdAndDelete(openLayoutId);
    }

    // Regenerate from the current seat layout
    if (!event.seatLayoutId) {
      throw new BadRequestException('Event must have a seat layout to rebuild booking');
    }

    const newOpenLayout = await this.openTicketBookingForEvent(
      event.seatLayoutId.toString(),
      eventId
    );

    event.openBookingLayoutId = newOpenLayout._id as Types.ObjectId;
    // Keep event bookable if it was already published
    if (event.status === EventStatus.PUBLISHED) {
      event.allowBooking = true;
    }
    await event.save();

    this.logger.log(`🔁 Rebuilt open booking layout for event ${eventId}`);
    return {
      message: 'Open booking layout rebuilt successfully',
      openBookingLayoutId: newOpenLayout._id,
    };
  }

  /**
   * Get event layout details for booking interface
   */
  async getEventLayoutDetails(eventId: string) {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!event.openBookingLayoutId) {
      throw new BadRequestException('Event is not open for booking');
    }

    const details = await this.openBookingModel
      .findById(event.openBookingLayoutId)
      .populate({
        path: 'items.refId',
      })
      .populate({
        path: 'seats',
        model: 'Seat',
      })
      .lean();

    return {
      event: {
        _id: event._id,
        name: event.name,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue,
        pricing: event.pricing,
      },
      layout: details,
    };
  }

  /**
   * Get non-bookable decor items (stage, screen, entry, exit, washroom) from original SeatLayout
   * for a public, published event. Returns only what's in the venue layout; no placeholders.
   */
  async getEventDecor(eventId: string) {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Only allow decor for published, non-private events
    if (event.status !== EventStatus.PUBLISHED || event.visibility === EventVisibility.PRIVATE) {
      throw new BadRequestException('Event not available');
    }

    if (!event.seatLayoutId) {
      throw new BadRequestException('Event has no seat layout');
    }

    const seatLayout = await this.seatLayoutModel.findById(event.seatLayoutId).lean();
    if (!seatLayout) {
      throw new NotFoundException('Seat layout not found');
    }

    const decorTypes = new Set(['stage', 'screen', 'entry', 'exit', 'washroom']);
    const items = (seatLayout.items || []).filter((it: any) => decorTypes.has(it.type));

    return {
      canvasW: seatLayout.canvasW,
      canvasH: seatLayout.canvasH,
      items,
    };
  }

  /**
   * Book event tickets with proper locking
   */
  async bookEventTickets(bookingDto: BookEventTicketsDto): Promise<{ booking: EventTicketBookingDocument; paymentLink: string }> {
    const { eventId, userId, customerInfo, seats = [], tables = [], booths = [] } = bookingDto;

    // Validate event
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check if event is bookable
    if (!event.allowBooking || event.status !== EventStatus.PUBLISHED || 
        event.visibility === EventVisibility.PRIVATE || event.availableTickets <= 0) {
      throw new BadRequestException('Event is not available for booking');
    }

    // Check booking date restrictions
    const now = new Date();
    if (event.bookingStartDate && now < event.bookingStartDate) {
      throw new BadRequestException('Booking has not started yet');
    }
    if (event.bookingEndDate && now > event.bookingEndDate) {
      throw new BadRequestException('Booking has ended');
    }

    const totalItems = seats.length + tables.length + booths.length;
    if (totalItems === 0) {
      throw new BadRequestException('At least one seat, table, or booth must be selected');
    }

    if (event.maxTicketsPerUser > 0 && totalItems > event.maxTicketsPerUser) {
      throw new BadRequestException(`Maximum ${event.maxTicketsPerUser} tickets allowed per user`);
    }

    // Check availability and create locks
    const lockKey = `event_booking_lock:${eventId}:${userId}:${Date.now()}`;
    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Lock selected items
      await this.lockSelectedItems(seats, tables, booths, lockKey, lockExpiry);

      // Calculate pricing
      const pricing = await this.calculateEventTicketPricing(event, seats, tables, booths);

      // Create booking record
      const booking = new this.ticketBookingModel({
        eventId: new Types.ObjectId(eventId),
        userId: new Types.ObjectId(userId),
        openBookingLayoutId: event.openBookingLayoutId,
        status: TicketStatus.PENDING,
        seats: seats.map(seat => ({
          seatId: seat.seatId,
          categoryId: seat.categoryId,
          categoryName: event.pricing.categoryPricing?.[seat.categoryId] ? 'Custom' : 'Standard',
          price: seat.price,
        })),
        tables: tables.map(table => ({
          tableId: table.tableId,
          tableName: `Table ${table.tableId}`,
          categoryId: table.categoryId,
          price: table.price,
        })),
        booths: booths.map(booth => ({
          boothId: booth.boothId,
          boothName: `Booth ${booth.boothId}`,
          categoryId: booth.categoryId,
          price: booth.price,
        })),
        customerInfo,
        paymentInfo: pricing,
        totalTickets: totalItems,
        lockExpiry,
        isLocked: true,
        lockedBy: lockKey,
      });

      const savedBooking = await booking.save();

      // Initiate payment
      const paymentResult = await this.paymentService.initiatePayment({
        bookingId: String(savedBooking._id),
        userId,
        amount: pricing.total,
        type: BookingType.ARTIST, // Using existing enum, could be extended for events
        customerEmail: customerInfo.email,
        description: `Event ticket booking for ${event.name}`,
        customerMobile: customerInfo.phone,
      });

      this.logger.log(`✅ Event ticket booking created: ${savedBooking._id} for event: ${eventId}`);

      return {
        booking: savedBooking,
        paymentLink: paymentResult.paymentLink,
      };

    } catch (error) {
      // Release locks on error
      await this.releaseItemLocks(lockKey);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  // Convert JSON-string fields and cast date strings
  private normalizeCreateEventDto(input: any): CreateEventDto {
    const dto: any = { ...input };
    // Parse nested JSON fields if they came as strings
    ['venue', 'pricing', 'artists', 'equipment', 'tags', 'genres'].forEach((key) => {
      if (typeof dto[key] === 'string') {
        try { dto[key] = JSON.parse(dto[key]); } catch { /* ignore */ }
      }
    });
    // Cast dates
    ['startDate', 'endDate', 'bookingStartDate', 'bookingEndDate'].forEach((key) => {
      if (typeof dto[key] === 'string') {
        const d = new Date(dto[key]);
        if (!isNaN(d.getTime())) dto[key] = d;
      }
    });
    return dto as CreateEventDto;
  }

  private normalizeUpdateEventDto(input: any): UpdateEventDto {
    const dto: any = { ...input };
    ['venue', 'pricing', 'artists', 'equipment', 'tags', 'genres'].forEach((key) => {
      if (typeof dto[key] === 'string') {
        try { dto[key] = JSON.parse(dto[key]); } catch { /* ignore */ }
      }
    });
    ['startDate', 'endDate', 'bookingStartDate', 'bookingEndDate'].forEach((key) => {
      if (typeof dto[key] === 'string') {
        const d = new Date(dto[key]);
        if (!isNaN(d.getTime())) dto[key] = d;
      }
    });
    return dto as UpdateEventDto;
  }

  private async validateArtistsForEvent(artists: any[], performanceType: string) {
    for (const artistData of artists) {
      if (!artistData.isCustomArtist && artistData.artistId) {
        const artist = await this.artistProfileModel.findById(artistData.artistId);
        if (!artist) {
          throw new BadRequestException(`Artist ${artistData.artistId} not found`);
        }
        
        // Check if artist's performance preference matches event type
        const eventVisibility = this.mapPerformanceTypeToVisibility(performanceType);
        if (!artist.performPreference.includes(eventVisibility)) {
          throw new BadRequestException(`Artist ${artist.stageName} does not perform ${performanceType} events`);
        }
      }
    }
  }

  private async validateEquipmentForEvent(equipment: any[], startDate: Date, endDate: Date) {
    for (const equipmentData of equipment) {
      const equipmentItem = await this.equipmentModel.findById(equipmentData.equipmentId);
      if (!equipmentItem) {
        throw new BadRequestException(`Equipment ${equipmentData.equipmentId} not found`);
      }
      
      // TODO: Check equipment availability for the event dates
      // This would involve checking existing bookings
    }
  }

  private async prepareEventArtists(
    artists: any[], 
    customArtistPhotoFiles: { [key: string]: Express.Multer.File } = {}
  ): Promise<any[]> {
    const preparedArtists: any[] = [];
    
    for (let i = 0; i < artists.length; i++) {
      const artistData = artists[i];
      if (artistData.isCustomArtist) {
        // Handle custom artist photo upload to S3 if it's a file
        let customArtistPhotoUrl = artistData.customArtistPhoto;
        
        // Check for corresponding file in customArtistPhotoFiles
        const photoFileKey = `customArtistPhoto_${i}`;
        const photoFile = customArtistPhotoFiles[photoFileKey];
        
        if (photoFile) {
          try {
            customArtistPhotoUrl = await this.s3Service.uploadFile(
              photoFile, 
              'events/custom-artists'
            );
            this.logger.log(`Uploaded custom artist photo to S3: ${customArtistPhotoUrl}`);
          } catch (error) {
            this.logger.error('Failed to upload custom artist photo:', error);
            customArtistPhotoUrl = '';
          }
        }
        
        preparedArtists.push({
          artistId: new Types.ObjectId(), // Dummy ID for custom artists (legacy field)
          artistName: artistData.customArtistName,
          artistPhoto: customArtistPhotoUrl,
          fee: artistData.fee,
          isCustomArtist: true,
          customArtistName: artistData.customArtistName,
          customArtistPhoto: customArtistPhotoUrl,
          notes: artistData.notes,
        });
      } else {
        const artist = await this.artistProfileModel.findById(artistData.artistId);
        if (artist) {
          preparedArtists.push({
            // Keep both references to avoid ambiguity elsewhere
            artistProfileId: artist._id,
            artistUserId: artist.user,
            artistId: artist._id, // legacy: some code expects this to be profile id
            artistName: artist.stageName,
            artistPhoto: artist.profileImage,
            fee: artistData.fee,
            isCustomArtist: false,
            notes: artistData.notes,
          });
        }
      }
    }
    
    return preparedArtists;
  }

  private async prepareEventEquipment(equipment: any[]): Promise<any[]> {
    const preparedEquipment: any[] = [];
    
    for (const equipmentData of equipment) {
      const equipmentItem = await this.equipmentModel.findById(equipmentData.equipmentId);
      if (equipmentItem) {
        // Equipment is booked for the whole day, not hourly
        const totalPrice = equipmentItem.pricePerDay * equipmentData.quantity;
        preparedEquipment.push({
          equipmentId: equipmentItem._id,
          equipmentName: equipmentItem.name,
          quantity: equipmentData.quantity,
          pricePerUnit: equipmentItem.pricePerDay,
          totalPrice,
          notes: equipmentData.notes,
        });
      }
    }
    
    return preparedEquipment;
  }

  private mapPerformanceTypeToVisibility(performanceType: string): PerformancePreference {
    // Map performance types to artist performance preferences
    const mapping: Record<string, PerformancePreference> = {
      'private': PerformancePreference.PRIVATE,
      'public': PerformancePreference.PUBLIC,
      'international': PerformancePreference.INTERNATIONAL,
      'workshop': PerformancePreference.WORKSHOP,
    };
    
    return mapping[performanceType.toLowerCase()] || PerformancePreference.PUBLIC;
  }

  private async lockSelectedItems(seats: any[], tables: any[], booths: any[], lockKey: string, lockExpiry: Date) {
    // Lock seats
    if (seats.length > 0) {
      const seatIds = seats.map(s => s.seatId);
      const lockedSeats = await this.seatModel.updateMany(
        { 
          seatId: { $in: seatIds },
          bookingStatus: 'available'
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      if (lockedSeats.modifiedCount !== seats.length) {
        throw new ConflictException('Some seats are no longer available');
      }
    }

    // Lock tables
    if (tables.length > 0) {
      const tableIds = tables.map(t => t.tableId);
      const lockedTables = await this.tableModel.updateMany(
        { 
          table_id: { $in: tableIds },
          bookingStatus: 'available'
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      if (lockedTables.modifiedCount !== tables.length) {
        throw new ConflictException('Some tables are no longer available');
      }
    }

    // Lock booths
    if (booths.length > 0) {
      const boothIds = booths.map(b => b.boothId);
      const lockedBooths = await this.boothModel.updateMany(
        { 
          booth_id: { $in: boothIds },
          bookingStatus: 'available'
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      if (lockedBooths.modifiedCount !== booths.length) {
        throw new ConflictException('Some booths are no longer available');
      }
    }
  }

  private async releaseItemLocks(lockKey: string) {
    await Promise.all([
      this.seatModel.updateMany(
        { lockedBy: lockKey },
        { 
          bookingStatus: 'available',
          $unset: { lockExpiry: 1, lockedBy: 1 }
        }
      ),
      this.tableModel.updateMany(
        { lockedBy: lockKey },
        { 
          bookingStatus: 'available',
          $unset: { lockExpiry: 1, lockedBy: 1 }
        }
      ),
      this.boothModel.updateMany(
        { lockedBy: lockKey },
        { 
          bookingStatus: 'available',
          $unset: { lockExpiry: 1, lockedBy: 1 }
        }
      ),
    ]);
  }

  private async calculateEventTicketPricing(event: EventDocument, seats: any[], tables: any[], booths: any[]) {
    let subtotal = 0;
    
    // Calculate seat pricing
    subtotal += seats.reduce((sum, seat) => sum + seat.price, 0);
    
    // Calculate table pricing
    subtotal += tables.reduce((sum, table) => sum + table.price, 0);
    
    // Calculate booth pricing
    subtotal += booths.reduce((sum, booth) => sum + booth.price, 0);
    
    const serviceFee = event.pricing.serviceFee || 0;
    const tax = (subtotal * (event.pricing.taxPercentage || 0)) / 100;
    const total = subtotal + serviceFee + tax;
    
    return {
      subtotal,
      serviceFee,
      tax,
      total,
      currency: 'KWD',
    };
  }

  /**
   * Get event layout details (legacy method for backward compatibility)
   */
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

  /**
   * Create bookings for admin-created events (no payment required)
   */
  private async createAdminEventBookings(event: EventDocument, artists: any[], equipment: any[]): Promise<void> {
    try {
      // Create artist bookings and mark unavailability
      for (const artistData of artists) {
        if (!artistData.isCustomArtist && artistData.artistId) {
          // Resolve correct user/profile IDs
          const profileId: Types.ObjectId | undefined = artistData.artistProfileId || artistData.artistId;
          let artistUserId: Types.ObjectId | undefined = artistData.artistUserId;
          if (!artistUserId && profileId) {
            const prof = await this.artistProfileModel.findById(profileId).select('user').lean();
            artistUserId = prof?.user as any;
          }

          if (!artistUserId) {
            throw new BadRequestException(`Could not resolve artist user for artist ${artistData.artistId}`);
          }
          // Create artist booking
          const artistBooking = new this.artistBookingModel({
            artistId: artistUserId, // store USER id as required by schema
            bookedBy: event.createdBy,
            date: event.startDate.toISOString().split('T')[0],
            startTime: event.startTime,
            endTime: event.endTime,
            artistType: this.mapPerformanceTypeToArtistType(event.performanceType),
            status: BookingStatus.CONFIRMED, // Admin bookings are automatically confirmed
            price: artistData.fee || 0, // Keep existing field for backward compatibility
            totalPrice: artistData.fee || 0, // New field for event bookings
            paymentStatus: 'completed', // Admin doesn't pay; align with ArtistBooking enum (lowercase)
            venueDetails: {
              name: event.venue.name,
              address: event.venue.address,
              city: event.venue.city,
              state: event.venue.state,
              country: event.venue.country,
            },
            eventDescription: `Admin Event: ${event.name}`,
            specialRequests: artistData.notes || '',
            isAdminCreated: true,
            eventId: event._id,
          });

          const savedArtistBooking = await artistBooking.save();
          this.logger.log(`Created artist booking for event ${event._id}, artist user ${artistUserId}`);

          // Send email notification to artist (non-blocking)
          try {
            const artistUser = await this.userModel.findById(artistUserId).select('firstName lastName email').lean();
            if (artistUser?.email) {
              const durationHours = this.calculateDurationHours(event.startTime, event.endTime);
              await this.emailService.sendArtistBookingConfirmation(artistUser.email, {
                artistName: `${artistUser.firstName || ''} ${artistUser.lastName || ''}`.trim() || 'Artist',
                bookingId: String(savedArtistBooking._id),
                eventType: event.performanceType || 'Performance',
                eventDate: event.startDate.toISOString().split('T')[0],
                startTime: event.startTime,
                endTime: event.endTime,
                duration: durationHours,
                artistFee: artistData.fee || 0,
                venueAddress: [event.venue?.name, event.venue?.address, event.venue?.city, event.venue?.country].filter(Boolean).join(', '),
                customerName: event.contactPerson || 'Event Organizer',
                customerEmail: event.contactEmail || '',
                customerPhone: event.contactPhone || '',
                eventDescription: event.description || '',
              });
            }
          } catch (mailErr) {
            this.logger.warn(`Failed to send artist booking email: ${mailErr.message}`);
          }

          // Mark artist as unavailable for the event period (per-day with hours[])
          try {
            const start = new Date(event.startDate);
            const end = new Date(event.endDate);

            // Parse times (HH:mm)
            const [sH] = (event.startTime || '00:00').split(':').map((v) => parseInt(v, 10));
            const [eH] = (event.endTime || '23:59').split(':').map((v) => parseInt(v, 10));

            // Iterate through each date in the range
            const cur = new Date(start);
            while (cur <= end) {
              const isFirstDay = cur.toDateString() === start.toDateString();
              const isLastDay = cur.toDateString() === end.toDateString();

              const dayStartHour = isFirstDay ? sH : 0;
              let dayEndHour = isLastDay ? eH : 24; // exclusive upper bound
              if (dayEndHour <= dayStartHour) {
                // Ensure at least one hour; fallback to block the full day if invalid
                dayEndHour = Math.min(24, dayStartHour + 1);
              }

              const hours: number[] = [];
              for (let h = dayStartHour; h < dayEndHour; h++) {
                hours.push(h);
              }

              const dateOnly = new Date(Date.UTC(cur.getFullYear(), cur.getMonth(), cur.getDate()));

              const unavailabilityRecord = new this.artistUnavailableModel({
                artistProfile: new Types.ObjectId(profileId),
                date: dateOnly,
                hours,
              });

              await unavailabilityRecord.save();
              this.logger.log(
                `Marked artist ${artistData.artistId} unavailable on ${dateOnly.toISOString().slice(0,10)} for hours [${hours.join(',')}]`
              );

              // Next day
              cur.setDate(cur.getDate() + 1);
            }
          } catch (e) {
            this.logger.error('Failed to mark artist unavailable:', e);
            throw e;
          }
        }
      }

      // Create equipment bookings
      for (const equipmentData of equipment) {
        if (equipmentData.equipmentId) {
          const equipmentBooking = new this.equipmentBookingModel({
            bookedBy: event.createdBy,
            equipments: [{
              equipmentId: equipmentData.equipmentId,
              quantity: equipmentData.quantity,
              pricePerDay: equipmentData.pricePerUnit || 0,
            }],
            date: event.startDate.toISOString().split('T')[0], // Keep existing field for backward compatibility
            startTime: event.startTime, // Required field
            endTime: event.endTime, // Required field
            startDate: event.startDate.toISOString().split('T')[0], // New field for event bookings
            endDate: event.endDate.toISOString().split('T')[0], // New field for event bookings
            status: BookingStatus.CONFIRMED, // Admin bookings are automatically confirmed
            totalPrice: equipmentData.totalPrice || 0,
            paymentStatus: 'CONFIRMED', // Admin doesn't pay; align with EquipmentBooking enum (uppercase)
            venueDetails: {
              name: event.venue.name,
              address: event.venue.address,
              city: event.venue.city,
              state: event.venue.state,
              country: event.venue.country,
            },
            eventDescription: `Admin Event: ${event.name}`,
            specialRequests: equipmentData.notes || '',
            isAdminCreated: true,
            eventId: event._id,
          });

          const savedEquipmentBooking = await equipmentBooking.save();
          this.logger.log(`Created equipment booking for event ${event._id}, equipment ${equipmentData.equipmentId}`);

          // Send email notification to equipment provider (non-blocking)
          try {
            const equipmentDoc = await this.equipmentModel.findById(equipmentData.equipmentId).select('name provider').lean();
            if (equipmentDoc?.provider) {
              const providerUser = await this.userModel.findById(equipmentDoc.provider).select('firstName lastName email').lean();
              if (providerUser?.email) {
                const duration = `${event.startTime} - ${event.endTime}`;
                await this.emailService.sendEquipmentProviderNotification(providerUser.email, {
                  providerName: `${providerUser.firstName || ''} ${providerUser.lastName || ''}`.trim() || 'Provider',
                  bookingId: String(savedEquipmentBooking._id),
                  equipmentName: equipmentDoc.name,
                  startDate: event.startDate.toISOString().split('T')[0],
                  endDate: event.endDate.toISOString().split('T')[0],
                  startTime: event.startTime,
                  endTime: event.endTime,
                  duration,
                  equipmentFee: equipmentData.totalPrice || 0,
                  venueAddress: [event.venue?.name, event.venue?.address, event.venue?.city, event.venue?.country].filter(Boolean).join(', '),
                  customerName: event.contactPerson || 'Event Organizer',
                  customerEmail: event.contactEmail || '',
                  customerPhone: event.contactPhone || '',
                  eventDescription: event.description || '',
                  equipmentItems: [
                    { name: equipmentDoc.name, quantity: equipmentData.quantity, price: equipmentData.pricePerUnit || '' },
                  ],
                });
              }
            }
          } catch (mailErr) {
            this.logger.warn(`Failed to send equipment provider booking email: ${mailErr.message}`);
          }
        }
      }

      this.logger.log(`✅ Created ${artists.length} artist bookings and ${equipment.length} equipment bookings for admin event ${event._id}`);
    } catch (error) {
      this.logger.error(`Failed to create admin event bookings for event ${event._id}:`, error);
      throw new BadRequestException('Failed to create event bookings: ' + error.message);
    }
  }

  private calculateDurationHours(startTime: string, endTime: string): number {
    try {
      const [sH, sM] = (startTime || '0:0').split(':').map((n) => parseInt(n, 10));
      const [eH, eM] = (endTime || '0:0').split(':').map((n) => parseInt(n, 10));
      const startMinutes = (sH || 0) * 60 + (sM || 0);
      const endMinutes = (eH || 0) * 60 + (eM || 0);
      const diff = Math.max(0, endMinutes - startMinutes);
      return Math.round((diff / 60) * 10) / 10; // one-decimal hours
    } catch {
      return 0;
    }
  }

  private mapPerformanceTypeToArtistType(performanceType: string): 'private' | 'public' {
    const privateTypes = ['private', 'workshop'];
    return privateTypes.includes(performanceType.toLowerCase()) ? 'private' : 'public';
  }

  // ==================== PAYMENT FLOW METHODS ====================

  /**
   * Store pending event data temporarily (Redis/Database)
   */
  async storePendingEventData(comboBookingId: string, data: any): Promise<{ success: boolean }> {
    try {
      // Store in Redis with 1 hour expiration
      const redisKey = `pending-event:${comboBookingId}`;
      await this.redisService.set(redisKey, JSON.stringify(data), 3600); // 1 hour TTL
      
      this.logger.log(`Stored pending event data for combo booking: ${comboBookingId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to store pending event data:', error);
      throw new BadRequestException('Failed to store event data');
    }
  }

  /**
   * Create event after successful payment verification
   */
  async createEventAfterPayment(comboBookingId: string, trackId: string, userId: string): Promise<any> {
    try {
      // Verify payment first
      const paymentVerified = await this.paymentService.verifyPayment(
        trackId,
        comboBookingId,
        BookingType.COMBO,
        false,
        trackId
      );

      if (paymentVerified.result !== 'CAPTURED') {
        throw new BadRequestException('Payment not verified or captured');
      }

      // Retrieve stored event data
      const redisKey = `pending-event:${comboBookingId}`;
      const storedDataStr = await this.redisService.get(redisKey);
      
      if (!storedDataStr) {
        throw new BadRequestException('Event data not found or expired');
      }

      const storedData = JSON.parse(storedDataStr);

      // Create event
      const createdEvent = await this.createEvent(
        storedData.eventData,
        storedData.userId || userId,
        'venue_owner',
        undefined, // No cover photo after payment (already handled)
        undefined,
        undefined // No additional files in post-payment creation
      );

      // Clean up stored data
      await this.redisService.del(redisKey);

      this.logger.log(`✅ Event created after payment: ${createdEvent._id} for combo booking: ${comboBookingId}`);
      return createdEvent;
    } catch (error) {
      this.logger.error('Failed to create event after payment:', error);
      throw new BadRequestException('Failed to create event after payment: ' + error.message);
    }
  }
}
