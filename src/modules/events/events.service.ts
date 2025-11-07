import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef
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
// Removed deprecated unified EventTicketBooking schema in favor of separate seat/table/booth bookings
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
import {
  PendingEventData,
  PendingEventDataDocument,
} from 'src/infrastructure/database/schemas/pending-event-data.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { PaymentService } from 'src/payment/payment.service';
import { BookingType } from '../booking/interfaces/bookingType';
import { BookingStatus } from '../booking/dto/booking.dto';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { VenueOwnerProfile, VenueOwnerProfileDocument } from 'src/infrastructure/database/schemas/venue-owner-profile.schema';
import { SeatBooking, SeatBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';

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
  // Replaced unified ticket booking with separate models
  @InjectModel(SeatBooking.name)
  private seatBookingModel: Model<SeatBookingDocument>,
  @InjectModel(TableBooking.name)
  private tableBookingModel: Model<TableBookingDocument>,
  @InjectModel(BoothBooking.name)
  private boothBookingModel: Model<BoothBookingDocument>,
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
    @InjectModel(PendingEventData.name)
    private pendingEventDataModel: Model<PendingEventDataDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(VenueOwnerProfile.name)
    private venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
    private s3Service: S3Service,
    private redisService: RedisService,
    @Inject(forwardRef(() => PaymentService))
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
    additionalFiles?: Array<Express.Multer.File>,
    skipDuplicateCheck = false
  ): Promise<EventDocument> {
    try {
      // Idempotency: prevent duplicate rapid submissions creating multiple events
      // Skip for post-payment event creation (already verified via payment)
      if (!skipDuplicateCheck) {
        const lockKeyBase = `${createEventDto.name || 'event'}:${createEventDto.startDate}:${createEventDto.startTime}:${createdBy || 'anon'}`;
        const lockKey = `event:create:lock:${Buffer.from(lockKeyBase).toString('base64')}`;
        const redisClient = this.redisService.getClient();
        const lockAcquired = await redisClient.setnx(lockKey, '1');
        if (lockAcquired === 0) {
          throw new BadRequestException('Duplicate event creation detected. Please wait a moment and try again.');
        }
        await redisClient.expire(lockKey, 15);
      }

      // Normalize DTO in case fields arrived as JSON strings via multipart
      const dto = this.normalizeCreateEventDto(createEventDto);

      // === COMPREHENSIVE VALIDATION ===
      
      // Basic field validation
      if (!dto.name || dto.name.trim().length < 3) {
        throw new BadRequestException('Event name must be at least 3 characters long');
      }
      if (dto.name.length > 200) {
        throw new BadRequestException('Event name must not exceed 200 characters');
      }
      
      if (!dto.description || dto.description.trim().length < 10) {
        throw new BadRequestException('Event description must be at least 10 characters long');
      }
      
      if (!dto.performanceType) {
        throw new BadRequestException('Performance type is required');
      }

      // Venue validation
      if (!dto.venue || !dto.venue.name || dto.venue.name.trim().length === 0) {
        throw new BadRequestException('Venue name is required');
      }
      if (!dto.venue.address || dto.venue.address.trim().length === 0) {
        throw new BadRequestException('Venue address is required');
      }
      if (!dto.venue.city || dto.venue.city.trim().length === 0) {
        throw new BadRequestException('Venue city is required');
      }
      if (!dto.venue.state || dto.venue.state.trim().length === 0) {
        throw new BadRequestException('Venue state is required');
      }
      if (!dto.venue.country || dto.venue.country.trim().length === 0) {
        throw new BadRequestException('Venue country is required');
      }

      // Date and time validation
      if (!dto.startDate || !dto.endDate) {
        throw new BadRequestException('Event start and end dates are required');
      }
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException('Event start and end times are required');
      }

      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);
      const now = new Date();
      
      if (isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid start date format');
      }
      if (isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid end date format');
      }
      
      if (startDate < now) {
        throw new BadRequestException('Event start date cannot be in the past');
      }
      if (endDate < startDate) {
        throw new BadRequestException('Event end date must be after or equal to start date');
      }

      // Admin-specific validation: venue owner is required
      if (createdByRole === 'admin' && (!venueOwnerId || venueOwnerId.trim() === '')) {
        throw new BadRequestException('Venue owner ID is required for admin-created events');
      }

      // Validation: If seat layout is provided, venue owner ID is required
      if (dto.seatLayoutId && !venueOwnerId) {
        throw new BadRequestException(
          'Venue owner ID is required when a seat layout is selected. Please select a venue owner for this event.'
        );
      }

      // Validate seat layout exists and belongs to the venue owner
      if (dto.seatLayoutId) {
        if (!Types.ObjectId.isValid(dto.seatLayoutId)) {
          throw new BadRequestException('Invalid seat layout ID format');
        }
        
        const layout = await this.seatLayoutModel.findById(dto.seatLayoutId);
        if (!layout) {
          throw new BadRequestException('Selected seat layout not found');
        }
        
        if (layout.isDeleted) {
          throw new BadRequestException('Selected seat layout has been deleted');
        }
        
        // Verify layout belongs to the specified venue owner
        if (venueOwnerId && layout.venueOwnerId) {
          const layoutVenueOwnerIdStr = layout.venueOwnerId.toString();
          const providedVenueOwnerIdStr = venueOwnerId.toString();
          
          this.logger.log(`Seat layout validation - Layout venueOwnerId: ${layoutVenueOwnerIdStr}, Provided venueOwnerId: ${providedVenueOwnerIdStr}`);
          
          if (layoutVenueOwnerIdStr !== providedVenueOwnerIdStr) {
            throw new BadRequestException(
              `Selected seat layout does not belong to the specified venue owner. Layout owner: ${layoutVenueOwnerIdStr}, Event owner: ${providedVenueOwnerIdStr}`
            );
          }
        }
      }

      // Validate venueOwnerId if provided
      if (venueOwnerId) {
        if (!Types.ObjectId.isValid(venueOwnerId)) {
          throw new BadRequestException('Invalid venue owner ID format');
        }
        
        // Verify venue owner profile exists
        const venueOwnerProfile = await this.venueOwnerProfileModel.findById(venueOwnerId);
        if (!venueOwnerProfile) {
          throw new BadRequestException('Venue owner profile not found');
        }
      }

      // Validate booking settings
      if (dto.maxTicketsPerUser !== undefined) {
        if (dto.maxTicketsPerUser < 1 || dto.maxTicketsPerUser > 100) {
          throw new BadRequestException('Maximum tickets per user must be between 1 and 100');
        }
      } else {
        throw new BadRequestException('Maximum tickets per user is required');
      }

      if (dto.allowBooking) {
        if (!dto.bookingStartDate || !dto.bookingEndDate) {
          throw new BadRequestException('Booking start and end dates are required when booking is enabled');
        }
        
        const bookingStart = new Date(dto.bookingStartDate);
        const bookingEnd = new Date(dto.bookingEndDate);
        
        if (bookingEnd < bookingStart) {
          throw new BadRequestException('Booking end date must be after booking start date');
        }
        
        if (bookingEnd > startDate) {
          throw new BadRequestException('Booking must end before or on the event start date');
        }
      }

      // Validate contact information
      if (dto.contactEmail && dto.contactEmail.trim().length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(dto.contactEmail)) {
          throw new BadRequestException('Invalid contact email format');
        }
      }

      // Phone validation removed - different formats in different countries (Kuwait, etc.)

      // Validate artists if provided
      if (dto.artists && dto.artists.length > 0) {
        for (let i = 0; i < dto.artists.length; i++) {
          const artist = dto.artists[i];
          
          if (artist.isCustomArtist) {
            if (!artist.customArtistName || artist.customArtistName.trim().length === 0) {
              throw new BadRequestException(`Custom artist #${i + 1}: Name is required`);
            }
          } else {
            if (!artist.artistId) {
              throw new BadRequestException(`Artist #${i + 1}: Artist ID is required`);
            }
            if (!Types.ObjectId.isValid(artist.artistId)) {
              throw new BadRequestException(`Artist #${i + 1}: Invalid artist ID format`);
            }
          }
          
          // Allow 0 as valid price, only check for negative values
          if (artist.fee === undefined || artist.fee === null || artist.fee < 0) {
            throw new BadRequestException(`Artist #${i + 1}: Fee cannot be negative`);
          }
        }
      }

      // Validate equipment if provided
      if (dto.equipment && dto.equipment.length > 0) {
        for (let i = 0; i < dto.equipment.length; i++) {
          const equip = dto.equipment[i];
          
          if (!equip.equipmentId) {
            throw new BadRequestException(`Equipment #${i + 1}: Equipment ID is required`);
          }
          if (!Types.ObjectId.isValid(equip.equipmentId)) {
            throw new BadRequestException(`Equipment #${i + 1}: Invalid equipment ID format`);
          }
          if (!equip.quantity || equip.quantity <= 0) {
            throw new BadRequestException(`Equipment #${i + 1}: Quantity must be greater than 0`);
          }
        }
      }

      // === END VALIDATION ===

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
        coverPhoto: coverPhotoUrl || undefined, // Set to undefined if empty so schema default/optional works
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

      // Handle booking creation for both admin and venue owner
      // Both need to send emails to artists and equipment providers
      if (createdByRole === 'admin' || createdByRole === 'venue_owner') {
        this.logger.log(`Creating bookings and sending notifications for ${createdByRole} event...`);
        await this.createAdminEventBookings(savedEvent, artists, equipment);
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
    
    // Convert string IDs to ObjectId for proper querying
    if (createdBy) {
      query.createdBy = new Types.ObjectId(createdBy);
    }
    if (venueOwnerId) {
      query.venueOwnerId = new Types.ObjectId(venueOwnerId);
    }

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

    console.log('🔍 [EventsService.getEvents] Query:', JSON.stringify(query, null, 2));
    console.log('🔍 [EventsService.getEvents] Filters received:', filters);

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

    console.log('📤 [EventsService.getEvents] Found:', events.length, 'events out of', total, 'total');

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
   * Get events for venue owner (created by them OR assigned to their venue owner profile)
   */
  async getEventsForVenueOwner(
    userId: string, 
    venueOwnerProfileId: string | undefined,
    filters: EventFilters = {}
  ) {
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
    } = filters;

    const query: any = { isDeleted: false };

    // Apply filters
    if (status) query.status = status;
    if (visibility) query.visibility = visibility;
    if (performanceType) query.performanceType = performanceType;
    if (city) query['venue.city'] = new RegExp(city, 'i');
    if (state) query['venue.state'] = new RegExp(state, 'i');

    // Get events created by this user OR assigned to their venue owner profile
    const orConditions: any[] = [
      { createdBy: new Types.ObjectId(userId) }
    ];

    if (venueOwnerProfileId) {
      // venueOwnerId is stored as a string in the database, not ObjectId
      orConditions.push({ venueOwnerId: venueOwnerProfileId });
    }

    query.$or = orConditions;

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
    if (userRole === 'venue_owner') {
      // Allow if creator OR assigned venue owner
      let isOwner = event.createdBy.toString() === userId;
      if (!isOwner && event.venueOwnerId) {
        try {
          const user = await this.userModel.findById(userId).select('venueOwnerId').lean();
          const userVenueOwnerId = (user as any)?.venueOwnerId || (user as any)?.venueOwnerProfileId;
          if (userVenueOwnerId) {
            isOwner = String(event.venueOwnerId) === String(userVenueOwnerId);
          }
        } catch (e) {
          // ignore lookup errors and fall back to creator check
        }
      }
      if (!isOwner) {
        throw new ForbiddenException('You can only publish your own events');
      }
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
    if (userRole === 'venue_owner') {
      // Allow if creator OR assigned venue owner
      let isOwner = event.createdBy.toString() === userId;
      if (!isOwner && event.venueOwnerId) {
        try {
          const user = await this.userModel.findById(userId).select('venueOwnerId').lean();
          const userVenueOwnerId = (user as any)?.venueOwnerId || (user as any)?.venueOwnerProfileId;
          if (userVenueOwnerId) {
            isOwner = String(event.venueOwnerId) === String(userVenueOwnerId);
          }
        } catch (e) {
          // ignore lookup errors and fall back to creator check
        }
      }
      if (!isOwner) {
        throw new ForbiddenException('You can only cancel your own events');
      }
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
    if (userRole === 'venue_owner') {
      // Allow if creator OR assigned venue owner
      let isOwner = event.createdBy.toString() === userId;
      if (!isOwner && event.venueOwnerId) {
        try {
          const user = await this.userModel.findById(userId).select('venueOwnerId').lean();
          const userVenueOwnerId = (user as any)?.venueOwnerId || (user as any)?.venueOwnerProfileId;
          if (userVenueOwnerId) {
            isOwner = String(event.venueOwnerId) === String(userVenueOwnerId);
          }
        } catch (e) {
          // ignore lookup errors and fall back to creator check
        }
      }
      if (!isOwner) {
        throw new ForbiddenException('You can only delete your own events');
      }
    }

    // Check if event has bookings
    const [hasSeatBookings, hasTableBookings, hasBoothBookings] = await Promise.all([
      this.seatBookingModel.exists({ eventId: new Types.ObjectId(eventId), status: { $ne: 'cancelled' } }),
      this.tableBookingModel.exists({ eventId: new Types.ObjectId(eventId), status: { $ne: 'cancelled' } }),
      this.boothBookingModel.exists({ eventId: new Types.ObjectId(eventId), status: { $ne: 'cancelled' } }),
    ]);
    const hasBookings = Boolean(hasSeatBookings || hasTableBookings || hasBoothBookings);
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
    if (userRole === 'venue_owner') {
      let isOwner = event.createdBy.toString() === userId;
      if (!isOwner && event.venueOwnerId) {
        try {
          const user = await this.userModel.findById(userId).select('venueOwnerId').lean();
          const userVenueOwnerId = (user as any)?.venueOwnerId || (user as any)?.venueOwnerProfileId;
          if (userVenueOwnerId) {
            isOwner = String(event.venueOwnerId) === String(userVenueOwnerId);
          }
        } catch (e) {
        }
      }
      if (!isOwner) {
        throw new ForbiddenException('You can only rebuild your own events');
      }
    }

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
  // Deprecated unified booking; frontend now books via /seat-book endpoints
  async bookEventTickets(bookingDto: BookEventTicketsDto): Promise<{ paymentLink: string }> {
    const { eventId, userId, customerInfo, seats = [], tables = [], booths = [] } = bookingDto;

    // Debug: Log the incoming request
    this.logger.log(`📝 Booking request for event ${eventId} by user ${userId}:`);
    this.logger.log(`🪑 Seats requested: ${JSON.stringify(seats.map(s => s.seatId))}`);
    this.logger.log(`🍽️ Tables requested: ${JSON.stringify(tables.map(t => t.tableId))}`);
    this.logger.log(`🏢 Booths requested: ${JSON.stringify(booths.map(b => b.boothId))}`);
    
    // Deduplicate seat/table/booth requests to prevent duplicate lock attempts
    const uniqueSeats = seats.filter((seat, index, self) => 
      index === self.findIndex(s => s.seatId === seat.seatId)
    );
    const uniqueTables = tables.filter((table, index, self) => 
      index === self.findIndex(t => t.tableId === table.tableId)
    );
    const uniqueBooths = booths.filter((booth, index, self) => 
      index === self.findIndex(b => b.boothId === booth.boothId)
    );
    
    if (uniqueSeats.length !== seats.length) {
      this.logger.warn(`⚠️ Duplicate seats found! Original: ${seats.length}, Unique: ${uniqueSeats.length}`);
    }
    if (uniqueTables.length !== tables.length) {
      this.logger.warn(`⚠️ Duplicate tables found! Original: ${tables.length}, Unique: ${uniqueTables.length}`);
    }
    if (uniqueBooths.length !== booths.length) {
      this.logger.warn(`⚠️ Duplicate booths found! Original: ${booths.length}, Unique: ${uniqueBooths.length}`);
    }

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
    
    // Log for debugging
    this.logger.log(`Booking validation for event ${eventId}:`);
    this.logger.log(`Current time: ${now.toISOString()}`);
    this.logger.log(`Booking start date: ${event.bookingStartDate ? new Date(event.bookingStartDate).toISOString() : 'Not set'}`);
    this.logger.log(`Booking end date: ${event.bookingEndDate ? new Date(event.bookingEndDate).toISOString() : 'Not set'}`);
    
    if (event.bookingStartDate && now < event.bookingStartDate) {
      const startDate = new Date(event.bookingStartDate).toLocaleString();
      const currentDate = now.toLocaleString();
      throw new BadRequestException(`Booking has not started yet. Booking starts on ${startDate}. Current time: ${currentDate}`);
    }
    if (event.bookingEndDate && now > event.bookingEndDate) {
      const endDate = new Date(event.bookingEndDate).toLocaleString();
      throw new BadRequestException(`Booking has ended. Booking ended on ${endDate}`);
    }

    const totalItems = uniqueSeats.length + uniqueTables.length + uniqueBooths.length;
    if (totalItems === 0) {
      throw new BadRequestException('At least one seat, table, or booth must be selected');
    }

    if (event.maxTicketsPerUser > 0 && totalItems > event.maxTicketsPerUser) {
      throw new BadRequestException(`Maximum ${event.maxTicketsPerUser} tickets allowed per user`);
    }

    // Clean up any expired locks for this event before attempting to lock
    try {
      const nowTs = new Date();
      await Promise.all([
        // Seats are tied to eventId
        this.seatModel.updateMany(
          { eventId: event._id as any, bookingStatus: 'locked', lockExpiry: { $lt: nowTs } as any },
          { bookingStatus: 'available', $unset: { lockExpiry: 1, lockedBy: 1 } },
        ),
        // Tables/Booths are tied to layout
        event.seatLayoutId
          ? this.tableModel.updateMany(
              { layoutId: event.seatLayoutId as any, bookingStatus: 'locked', lockExpiry: { $lt: nowTs } as any },
              { bookingStatus: 'available', $unset: { lockExpiry: 1, lockedBy: 1 } },
            )
          : Promise.resolve(null),
        event.seatLayoutId
          ? this.boothModel.updateMany(
              { layoutId: event.seatLayoutId as any, bookingStatus: 'locked', lockExpiry: { $lt: nowTs } as any },
              { bookingStatus: 'available', $unset: { lockExpiry: 1, lockedBy: 1 } },
            )
          : Promise.resolve(null),
      ]);
    } catch (e) {
      this.logger.warn(`Failed to cleanup expired locks for event ${eventId}: ${(e as any)?.message}`);
    }

    // Check availability and create locks
    const lockKey = `event_booking_lock:${eventId}:${userId}:${Date.now()}`;
    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Lock selected items (using deduplicated arrays)
      await this.lockSelectedItems(uniqueSeats, uniqueTables, uniqueBooths, lockKey, lockExpiry);

      // Calculate pricing (using original arrays to maintain pricing integrity)
      const pricing = await this.calculateEventTicketPricing(event, seats, tables, booths);

      // Since unified booking is removed, instruct clients to use /seat-book endpoints.
      // Keep compatibility: immediately release locks and throw informative error.
      await this.releaseItemLocks(lockKey);
      return { paymentLink: '' };

    } catch (error) {
      // Release locks on error
      this.logger.error(`❌ Booking failed for event ${eventId}, releasing locks with key: ${lockKey}`, error);
      await this.releaseItemLocks(lockKey);
      throw error;
    }
  }

  /**
   * Confirm an event ticket booking after successful payment
   */
  // Removed unified confirmEventTicketBooking; confirmations are per schema via PaymentService

  /**
   * Cancel a pending event ticket booking and release locks
   */
  // Removed unified cancelEventTicketBooking

  /**
   * Get a single ticket booking for the current user
   */
  // Removed unified getEventTicketBooking

  /**
   * Get current user's event ticket bookings with basic filters
   */
  // Removed unified getUserEventBookings; user booking dashboards should aggregate seat/table/booth

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
    // Allow reclaiming of expired locks in the same atomic operation to reduce false conflicts
    const now = new Date();
    this.logger.log(`🔒 Attempting to lock items at ${now.toISOString()}: ${seats.length} seats, ${tables.length} tables, ${booths.length} booths`);
    
    // Lock seats
    if (seats.length > 0) {
      const seatIds = seats.map(s => s.seatId);
      this.logger.log(`🪑 Locking seats: ${seatIds.join(', ')}`);
      
      // Debug: Check current status of seats before locking
      const currentSeatStatus = await this.seatModel.find({ seatId: { $in: seatIds } })
        .select('seatId bookingStatus lockExpiry lockedBy')
        .lean();
      this.logger.log(`🔍 Current seat status before locking:`, currentSeatStatus);
      
      const lockedSeats = await this.seatModel.updateMany(
        {
          seatId: { $in: seatIds },
          // Seats can be locked if currently available OR locked but already expired
          $or: [
            { bookingStatus: 'available' },
            { bookingStatus: 'locked', lockExpiry: { $lt: now } as any },
          ],
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      this.logger.log(`🪑 Locked ${lockedSeats.modifiedCount} out of ${seats.length} requested seats`);
      
      if (lockedSeats.modifiedCount < seats.length) {
        // For duplicate seatIds in DB, we need to check if ALL instances of each unique seatId were locked
        const uniqueSeatIds = [...new Set(seatIds)];
        const lockedSeatIds = await this.seatModel.distinct('seatId', {
          seatId: { $in: uniqueSeatIds },
          bookingStatus: 'locked',
          lockedBy: lockKey
        });
        
        this.logger.log(`🔍 Unique seat IDs requested: ${uniqueSeatIds.length}, Successfully locked: ${lockedSeatIds.length}`);
        
        if (lockedSeatIds.length < uniqueSeatIds.length) {
          // Find which unique seat IDs failed to lock
          const unlockedSeatIds = uniqueSeatIds.filter(seatId => !lockedSeatIds.includes(seatId));
          
          // Find which seats are genuinely unavailable (not expired locks)
          const conflictingSeats = await this.seatModel
            .find({ 
              seatId: { $in: unlockedSeatIds }, 
              $and: [
                { bookingStatus: { $ne: 'available' } },
                { 
                  $or: [
                    { bookingStatus: { $ne: 'locked' } },
                    { bookingStatus: 'locked', lockExpiry: { $gte: now } }
                  ]
                }
              ]
            })
            .select('seatId bookingStatus lockedBy lockExpiry')
            .lean();
            
          this.logger.log(`🪑 Found ${conflictingSeats.length} genuinely conflicting seats:`, conflictingSeats);
            
          // Only throw if there are genuinely conflicting seats (not just expired locks)
          if (conflictingSeats.length > 0) {
            // Deduplicate conflicts by seatId
            const uniqueConflicts = conflictingSeats.reduce((acc: any[], seat: any) => {
              if (!acc.find(s => s.seatId === seat.seatId)) {
                acc.push({
                  seatId: seat.seatId,
                  status: seat.bookingStatus,
                });
              }
              return acc;
            }, []);
            
            throw new ConflictException({
              message: 'Some seats are no longer available',
              seats: uniqueConflicts,
            } as any);
          }
        }
      }
    }

    // Lock tables
    if (tables.length > 0) {
      const tableIds = tables.map(t => t.tableId);
      this.logger.log(`🍽️ Locking tables: ${tableIds.join(', ')}`);
      
      const lockedTables = await this.tableModel.updateMany(
        {
          table_id: { $in: tableIds },
          $or: [
            { bookingStatus: 'available' },
            { bookingStatus: 'locked', lockExpiry: { $lt: now } as any },
          ],
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      this.logger.log(`🍽️ Locked ${lockedTables.modifiedCount} out of ${tables.length} requested tables`);
      
      if (lockedTables.modifiedCount !== tables.length) {
        const conflictingTables = await this.tableModel
          .find({ 
            table_id: { $in: tableIds }, 
            $and: [
              { bookingStatus: { $ne: 'available' } },
              { 
                $or: [
                  { bookingStatus: { $ne: 'locked' } },
                  { bookingStatus: 'locked', lockExpiry: { $gte: now } }
                ]
              }
            ]
          })
          .select('table_id bookingStatus lockedBy lockExpiry')
          .lean();
          
        this.logger.log(`🍽️ Found ${conflictingTables.length} genuinely conflicting tables:`, conflictingTables);
          
        // Only throw if there are genuinely conflicting tables (not just expired locks)
        if (conflictingTables.length > 0) {
          throw new ConflictException({
            message: 'Some tables are no longer available',
            tables: conflictingTables.map((t: any) => ({
              tableId: t.table_id,
              status: t.bookingStatus,
            })),
          } as any);
        }
      }
    }

    // Lock booths
    if (booths.length > 0) {
      const boothIds = booths.map(b => b.boothId);
      this.logger.log(`🏢 Locking booths: ${boothIds.join(', ')}`);
      
      const lockedBooths = await this.boothModel.updateMany(
        {
          booth_id: { $in: boothIds },
          $or: [
            { bookingStatus: 'available' },
            { bookingStatus: 'locked', lockExpiry: { $lt: now } as any },
          ],
        },
        { 
          bookingStatus: 'locked',
          lockExpiry,
          lockedBy: lockKey
        }
      );
      
      this.logger.log(`🏢 Locked ${lockedBooths.modifiedCount} out of ${booths.length} requested booths`);
      
      if (lockedBooths.modifiedCount !== booths.length) {
        const conflictingBooths = await this.boothModel
          .find({ 
            booth_id: { $in: boothIds }, 
            $and: [
              { bookingStatus: { $ne: 'available' } },
              { 
                $or: [
                  { bookingStatus: { $ne: 'locked' } },
                  { bookingStatus: 'locked', lockExpiry: { $gte: now } }
                ]
              }
            ]
          })
          .select('booth_id bookingStatus lockedBy lockExpiry')
          .lean();
          
        this.logger.log(`🏢 Found ${conflictingBooths.length} genuinely conflicting booths:`, conflictingBooths);
          
        // Only throw if there are genuinely conflicting booths (not just expired locks)
        if (conflictingBooths.length > 0) {
          throw new ConflictException({
            message: 'Some booths are no longer available',
            booths: conflictingBooths.map((b: any) => ({
              boothId: b.booth_id,
              status: b.bookingStatus,
            })),
          } as any);
        }
      }
    }
    
    this.logger.log(`✅ Successfully locked all requested items with key: ${lockKey}`);
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
   * Create bookings for events and send email notifications to artists and equipment providers
   * Used for both admin-created events (no payment) and venue owner events (after payment)
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


  /**
   * Get real-time seat map for public event booking interface
   */
  async getRealTimeSeatMap(eventId: string): Promise<{
    seats: Array<{
      seatId: string;
      status: 'available' | 'booked' | 'locked' | 'blocked';
      price: number;
      categoryId: string;
      position: { x: number; y: number };
      rowLabel?: string;
      seatNumber?: number;
    }>;
    tables: Array<{
      tableId: string;
      status: 'available' | 'booked' | 'locked' | 'blocked';
      price: number;
      categoryId: string;
      position: { x: number; y: number };
      seatCount: number;
      name: string;
    }>;
    booths: Array<{
      boothId: string;
      status: 'available' | 'booked' | 'locked' | 'blocked';
      price: number;
      categoryId: string;
      position: { x: number; y: number };
      name: string;
    }>;
    lastUpdated: string;
  }> {
    try {
      // Get event to ensure it exists
      const event = await this.eventModel.findById(eventId);
      if (!event) {
        throw new NotFoundException('Event not found');
      }

      // Check if booking is open (optional - seat map can be viewed even when closed)
      const openLayout = await this.openBookingModel.findOne({ eventId: new Types.ObjectId(eventId) });
      const isBookingOpen = !!openLayout;
      
      // Log if booking is not open but still return seat map for viewing
      if (!isBookingOpen) {
        this.logger.log(`Seat map requested for event ${eventId} but booking is not open - returning view-only data`);
      }

      // Fetch all seats with current status
      const seats = await this.seatModel.find({
        eventId: new Types.ObjectId(eventId)
      }).lean();

      // Fetch all tables with current status
      const tables = await this.tableModel.find({
        eventId: new Types.ObjectId(eventId)
      }).lean();

      // Fetch all booths with current status
      const booths = await this.boothModel.find({
        eventId: new Types.ObjectId(eventId)
      }).lean();

      return {
        seats: seats.map(seat => ({
          seatId: seat.seatId,
          status: seat.bookingStatus as 'available' | 'booked' | 'locked' | 'blocked',
          price: seat.price,
          categoryId: seat.catId,
          position: { x: seat.pos?.x || 0, y: seat.pos?.y || 0 },
          rowLabel: seat.rl,
          seatNumber: seat.sn ? parseInt(seat.sn) : undefined
        })),
        tables: tables.map(table => ({
          tableId: table.table_id,
          status: table.bookingStatus as 'available' | 'booked' | 'locked' | 'blocked',
          price: table.price,
          categoryId: table.catId,
          position: { x: table.pos?.x || 0, y: table.pos?.y || 0 },
          seatCount: table.sc || table.ts || 0,
          name: table.lbl || table.name || table.table_id
        })),
        booths: booths.map(booth => ({
          boothId: booth.booth_id,
          status: booth.bookingStatus as 'available' | 'booked' | 'locked' | 'blocked',
          price: booth.price,
          categoryId: booth.catId,
          position: { x: booth.pos?.x || 0, y: booth.pos?.y || 0 },
          name: booth.lbl || booth.name || booth.booth_id
        })),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to get real-time seat map:', error);
      throw error;
    }
  }

  /**
   * Store pending event data before payment
   */
  async storePendingEventData(
    comboBookingId: string,
    data: {
      eventData: any;
      selectedArtists: any[];
      selectedEquipment: any[];
      coverPhoto: any;
      coverPhotoBase64?: string;
      token: string;
      timestamp: string;
    },
    userId: string
  ): Promise<{ success: boolean; comboBookingId: string }> {
    try {
      // Check if already exists
      const existing = await this.pendingEventDataModel.findOne({ comboBookingId });
      if (existing) {
        return { success: true, comboBookingId };
      }

      // Get venue owner profile to extract venueOwnerId
      this.logger.log(`Looking for venue owner profile with user ID: ${userId}`);
      
      // Try finding by user field (which is an ObjectId reference)
      let venueOwnerProfile = await this.venueOwnerProfileModel.findOne({ 
        user: new Types.ObjectId(userId) 
      });
      
      // If not found, the userId might already be the profile ID
      if (!venueOwnerProfile) {
        this.logger.log(`Not found by user field, trying to find by _id: ${userId}`);
        venueOwnerProfile = await this.venueOwnerProfileModel.findById(userId);
      }
      
      if (!venueOwnerProfile) {
        this.logger.error(`Venue owner profile not found for user ID: ${userId}`);
        // List all profiles for debugging
        const allProfiles = await this.venueOwnerProfileModel.find().limit(5);
        this.logger.log(`Sample venue owner profiles: ${JSON.stringify(allProfiles.map(p => ({ _id: p._id, user: p.user })))}`);
        throw new BadRequestException('Venue owner profile not found');
      }
      
      this.logger.log(`Found venue owner profile: ${venueOwnerProfile._id}`);

      // If eventData contains seatLayoutId, verify it belongs to this venue owner
      if (data.eventData.seatLayoutId) {
        const layout = await this.seatLayoutModel.findById(data.eventData.seatLayoutId);
        if (layout && layout.venueOwnerId) {
          const layoutOwnerId = layout.venueOwnerId.toString();
          const profileId = String(venueOwnerProfile._id);
          
          if (layoutOwnerId !== profileId) {
            this.logger.warn(`Seat layout ${data.eventData.seatLayoutId} belongs to ${layoutOwnerId} but venue owner is ${profileId}. Clearing seatLayoutId.`);
            // Clear the seatLayoutId to prevent validation error
            data.eventData.seatLayoutId = null;
          }
        }
      }

      await this.pendingEventDataModel.create({
        comboBookingId,
        eventData: data.eventData,
        selectedArtists: data.selectedArtists,
        selectedEquipment: data.selectedEquipment,
        coverPhotoBase64: data.coverPhotoBase64 || null,
        coverPhotoInfo: data.coverPhoto,
        userId,
        venueOwnerId: String(venueOwnerProfile._id),
        role: 'venue_owner',
        token: data.token,
        status: 'pending',
      });

      this.logger.log(`Stored pending event data for comboBookingId: ${comboBookingId}, venueOwnerId: ${String(venueOwnerProfile._id)}, seatLayoutId: ${data.eventData.seatLayoutId || 'none'}, hasCoverPhoto: ${!!data.coverPhotoBase64}`);
      return { success: true, comboBookingId };
    } catch (error) {
      this.logger.error('Failed to store pending event data:', error);
      throw new BadRequestException('Failed to store event data before payment');
    }
  }

  /**
   * Create event after successful payment
   */
  async createEventAfterPayment(
    comboBookingId: string,
    trackId: string
  ): Promise<{ success: boolean; eventId?: string; message: string }> {
    try {
      // Retrieve pending event data
      const pendingData = await this.pendingEventDataModel.findOne({ 
        comboBookingId
      });

      if (!pendingData) {
        throw new NotFoundException('Pending event data not found');
      }

      // Check if already processed to prevent duplicate creation
      if (pendingData.status === 'completed') {
        this.logger.log(`Event already created for comboBookingId: ${comboBookingId}`);
        // Try to find and return the existing event
        const existingEvent = await this.eventModel.findOne({
          'createdBy': pendingData.userId,
          'name': pendingData.eventData.name,
          'startDate': new Date(pendingData.eventData.startDate)
        }).sort({ createdAt: -1 }).limit(1);
        
        if (existingEvent) {
          return {
            success: true,
            eventId: String(existingEvent._id),
            message: 'Event already created'
          };
        }
      }

      if (pendingData.status !== 'pending') {
        throw new BadRequestException(`Pending data already processed with status: ${pendingData.status}`);
      }

      pendingData.status = 'processing';
      await pendingData.save();

      try {
        const paymentVerification = await this.paymentService.verifyPayment(
          trackId,
          comboBookingId,
          'artist' as BookingType,
          false,
          trackId
        );

        if (paymentVerification.result !== 'CAPTURED') {
          pendingData.status = 'pending';
          await pendingData.save();
          throw new BadRequestException('Payment not confirmed');
        }

        // Convert base64 cover photo to buffer for upload
        let coverPhotoFile: Express.Multer.File | undefined = undefined;
        if (pendingData.coverPhotoBase64 && pendingData.coverPhotoInfo) {
          try {
            // Extract base64 data (remove data:image/png;base64, prefix if present)
            const base64Data = pendingData.coverPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Create a multer-like file object
            coverPhotoFile = {
              buffer,
              originalname: pendingData.coverPhotoInfo.name || 'cover.jpg',
              mimetype: pendingData.coverPhotoInfo.type || 'image/jpeg',
              size: pendingData.coverPhotoInfo.size || buffer.length,
              fieldname: 'coverPhoto',
              encoding: '7bit',
              destination: '',
              filename: '',
              path: '',
              stream: null as any,
            } as Express.Multer.File;
            
            this.logger.log(`Converted base64 to file buffer: ${coverPhotoFile.originalname}, size: ${coverPhotoFile.size}`);
          } catch (error) {
            this.logger.error('Failed to convert base64 cover photo:', error);
          }
        }

        // Create the event with the stored data
        const eventData = pendingData.eventData as any;
        this.logger.log(`Creating event after payment - userId: ${pendingData.userId}, role: ${pendingData.role}, venueOwnerId: ${pendingData.venueOwnerId}, seatLayoutId: ${eventData.seatLayoutId}, hasCoverPhoto: ${!!coverPhotoFile}`);
        
        const event = await this.createEvent(
          eventData as CreateEventDto,
          pendingData.userId,
          pendingData.role as 'admin' | 'venue_owner',
          pendingData.venueOwnerId,
          coverPhotoFile,
          undefined,
          true // Skip duplicate check - payment already verified
        );

        // Mark pending data as completed
        pendingData.status = 'completed';
        await pendingData.save();

        this.logger.log(`Event created successfully after payment: ${event._id}`);

        return {
          success: true,
          eventId: String(event._id),
          message: 'Event created successfully'
        };
      } catch (error) {
        // Reset status on any failure so user can retry
        if (pendingData.status === 'processing') {
          pendingData.status = 'pending';
          await pendingData.save();
          this.logger.log(`Reset pending data status to 'pending' after error for comboBookingId: ${comboBookingId}`);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error('Failed to create event after payment:', error);
      throw error;
    }
  }
}
