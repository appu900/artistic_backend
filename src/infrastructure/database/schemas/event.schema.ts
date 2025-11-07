import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PerformancePreference } from './artist-profile.schema';

export type EventDocument = Event & Document;

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum EventVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
  INTERNATIONAL = 'international',
  WORKSHOP = 'workshop',
}

@Schema({ _id: false })
export class Coordinates {
  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;
}

@Schema({ _id: false })
export class EventArtist {
  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artistId: Types.ObjectId;

  @Prop({ required: true })
  artistName: string;

  @Prop()
  artistPhoto?: string;

  @Prop({ required: true, min: 0 })
  fee: number;

  @Prop({ default: false })
  isCustomArtist: boolean; // For venue owner's own artists

  @Prop()
  customArtistName?: string;

  @Prop()
  customArtistPhoto?: string;

  @Prop()
  notes?: string;
}

@Schema({ _id: false })
export class EventEquipment {
  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipmentId: Types.ObjectId;

  @Prop({ required: true })
  equipmentName: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  pricePerUnit: number;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop()
  notes?: string;
}

@Schema({ _id: false })
export class EventVenue {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  country: string;

  @Prop()
  postalCode?: string;

  @Prop({ type: Coordinates })
  coordinates?: Coordinates;

  @Prop()
  capacity?: number;

  @Prop()
  venueType?: string;

  @Prop()
  facilities?: string[];
}

@Schema({ _id: false })
export class EventPricing {
  @Prop({ required: true, min: 0 })
  basePrice: number;

  @Prop({ type: Object, default: {} })
  categoryPricing: Record<string, number>; // seat category -> price

  @Prop({ type: Object, default: {} })
  tablePricing: Record<string, number>; // table category -> price

  @Prop({ type: Object, default: {} })
  boothPricing: Record<string, number>; // booth category -> price

  @Prop({ default: 0 })
  serviceFee: number;

  @Prop({ default: 0 })
  taxPercentage: number;
}

@Schema({ timestamps: true })
export class Event {
  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ required: true, maxlength: 2000 })
  description: string;

  @Prop()
  coverPhoto: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true })
  startTime: string; // Format: "HH:mm"

  @Prop({ required: true })
  endTime: string; // Format: "HH:mm"

  @Prop({ 
    type: String,
    enum: Object.values(EventVisibility),
    required: true 
  })
  visibility: EventVisibility;

  @Prop({ 
    type: String,
    enum: Object.values(EventStatus),
    default: EventStatus.DRAFT 
  })
  status: EventStatus;

  // Creator information
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ 
    enum: ['admin', 'venue_owner'],
    required: true,
    index: true 
  })
  createdByRole: 'admin' | 'venue_owner';

  @Prop({ type: Types.ObjectId, ref: 'VenueOwnerProfile', index: true })
  venueOwnerId?: Types.ObjectId;

  // Performance and category
  @Prop({ required: true })
  performanceType: string; // This is the event category

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  genres: string[];

  // Artists and Equipment
  @Prop({ type: [EventArtist], default: [] })
  artists: EventArtist[];

  @Prop({ type: [EventEquipment], default: [] })
  equipment: EventEquipment[];

  // Venue and Layout
  @Prop({ type: EventVenue, required: true })
  venue: EventVenue;

  @Prop({ type: Types.ObjectId, ref: 'SeatLayout', index: true })
  seatLayoutId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OpenBookingLayout', index: true })
  openBookingLayoutId?: Types.ObjectId;

  // Pricing
  @Prop({ type: EventPricing, required: true })
  pricing: EventPricing;

  // Booking settings
  @Prop({ default: true })
  allowBooking: boolean;

  @Prop()
  bookingStartDate?: Date;

  @Prop()
  bookingEndDate?: Date;

  @Prop({ default: 0 })
  maxTicketsPerUser: number;

  @Prop({ default: 0 })
  totalCapacity: number;

  @Prop({ default: 0 })
  availableTickets: number;

  @Prop({ default: 0 })
  soldTickets: number;

  // Additional information
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop()
  videoUrl?: string;

  @Prop()
  termsAndConditions?: string;

  @Prop()
  cancellationPolicy?: string;

  @Prop({ type: Map, of: String, default: {} })
  socialLinks: Map<string, string>;

  // Contact information
  @Prop()
  contactEmail?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  contactPerson?: string;

  // SEO and metadata
  @Prop()
  slug?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop()
  metaDescription?: string;

  // Analytics
  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0 })
  shareCount: number;

  @Prop({ default: 0 })
  likeCount: number;

  // Soft delete
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// Indexes for optimal query performance
EventSchema.index({ createdBy: 1, isDeleted: 1 });
EventSchema.index({ venueOwnerId: 1, isDeleted: 1 });
EventSchema.index({ status: 1, isDeleted: 1 });
EventSchema.index({ visibility: 1, isDeleted: 1 });
EventSchema.index({ performanceType: 1, isDeleted: 1 });
EventSchema.index({ startDate: 1, endDate: 1 });
EventSchema.index({ 'venue.city': 1, 'venue.state': 1 });
EventSchema.index({ slug: 1 }, { unique: true, sparse: true });
EventSchema.index({ createdAt: -1, isDeleted: 1 });

// Text search index
EventSchema.index({
  name: 'text',
  description: 'text',
  performanceType: 'text',
  tags: 'text',
  genres: 'text',
  'venue.name': 'text',
  'venue.city': 'text'
});

// Pre-save middleware for slug generation
EventSchema.pre('save', function() {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
});

// Virtual for total event cost
EventSchema.virtual('totalEventCost').get(function() {
  const artistCost = this.artists.reduce((sum, artist) => sum + artist.fee, 0);
  const equipmentCost = this.equipment.reduce((sum, eq) => sum + eq.totalPrice, 0);
  return artistCost + equipmentCost;
});

// Virtual for event duration in hours
EventSchema.virtual('durationHours').get(function() {
  const start = new Date(`1970-01-01T${this.startTime}:00`);
  const end = new Date(`1970-01-01T${this.endTime}:00`);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
});

// Instance methods
EventSchema.methods.canUserBook = function(userId: string) {
  if (!this.allowBooking) return false;
  if (this.visibility === EventVisibility.PRIVATE) return false;
  if (this.status !== EventStatus.PUBLISHED) return false;
  if (this.bookingStartDate && new Date() < this.bookingStartDate) return false;
  if (this.bookingEndDate && new Date() > this.bookingEndDate) return false;
  if (this.availableTickets <= 0) return false;
  return true;
};

EventSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Static methods
EventSchema.statics.findPublicEvents = function(filters: any = {}) {
  return this.find({
    ...filters,
    visibility: { $ne: EventVisibility.PRIVATE },
    status: EventStatus.PUBLISHED,
    isDeleted: false,
    startDate: { $gte: new Date() }
  }).sort({ startDate: 1 });
};

EventSchema.statics.findByPerformanceType = function(performanceType: string) {
  return this.find({
    performanceType,
    visibility: { $ne: EventVisibility.PRIVATE },
    status: EventStatus.PUBLISHED,
    isDeleted: false,
    startDate: { $gte: new Date() }
  }).sort({ startDate: 1 });
};
