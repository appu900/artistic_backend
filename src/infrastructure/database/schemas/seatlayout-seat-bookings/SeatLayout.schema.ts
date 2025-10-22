import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatLayoutDocument = SeatLayout & Document;

export enum SeatMapItemType {
  SEAT = 'seat',
  ENTRY = 'entry',
  EXIT = 'exit',
  WASHROOM = 'washroom',
  SCREEN = 'screen',
  STAGE = 'stage',
  TABLE = 'table',
  BOOTH = 'booth',
}

export enum TableShape {
  ROUND = 'round',
  RECT = 'rect',
  HALF = 'half',
  TRIANGLE = 'triangle',
}

export enum SeatStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked',
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
}

// Embedded category schema for fast lookups
@Schema({ _id: false })
export class SeatCategory {
  @Prop({ required: true, index: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true, min: 0 })
  price: number;
}

// Optimized coordinate system with spatial indexing support
@Schema({ _id: false })
export class Coordinate {
  @Prop({ required: true, min: 0 })
  x: number;

  @Prop({ required: true, min: 0 })
  y: number;
}

// Optimized seat data - only static geometry (no status)
@Schema({ _id: false })
export class OptimizedSeat {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  pos: Coordinate; // position

  @Prop({ required: true })
  size: Coordinate; // width/height

  @Prop({ required: true })
  catId: string; // category ID

  @Prop({ default: 0 })
  rot?: number; // rotation

  @Prop()
  rl?: string; // row label

  @Prop()
  sn?: number; // seat number

  // Status removed - now handled by SeatState collection
}

// Non-seat items with minimal data
@Schema({ _id: false })
export class CompactItem {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: Object.values(SeatMapItemType) })
  type: SeatMapItemType;

  @Prop({ required: true })
  pos: Coordinate;

  @Prop({ required: true })
  size: Coordinate;

  @Prop({ default: 0 })
  rot?: number;

  @Prop()
  lbl?: string; // label

  @Prop({ enum: Object.values(TableShape) })
  shp?: TableShape; // shape

  @Prop()
  ts?: number; // table seats

  @Prop()
  sc?: number; // seat count
}

// Spatial grid for efficient viewport querying
@Schema({ _id: false })
export class SpatialGrid {
  @Prop({ required: true })
  cellSize: number;

  @Prop({ required: true })
  gridWidth: number;

  @Prop({ required: true })
  gridHeight: number;

  // Mapping of grid cells to seat IDs for fast spatial queries
  @Prop({ type: Object, default: {} })
  cellIndex: Record<string, string[]>;
}

// Aggregated statistics for fast dashboard queries
@Schema({ _id: false })
export class LayoutStats {
  @Prop({ default: 0 })
  totalSeats: number;

  @Prop({ default: 0 })
  availableSeats: number;

  @Prop({ default: 0 })
  bookedSeats: number;

  @Prop({ default: 0 })
  reservedSeats: number;

  @Prop({ type: Object, default: {} })
  categoryStats: Record<string, number>; // categoryId -> seat count

  @Prop({ default: Date.now })
  lastUpdated: Date;
}

// Main layout schema
@Schema({ 
  timestamps: true,
  // Enable automatic index creation
  autoIndex: true,
  // Optimize for read operations
  read: 'primary'
})
export class SeatLayout {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'VenueOwnerProfile', index: true })
  venueOwnerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', index: true })
  eventId?: Types.ObjectId;

  // Embedded categories for fast access
  @Prop({ type: [SeatCategory], default: [] })
  categories: SeatCategory[];

  // Separate collections for seats and items for better performance
  @Prop({ type: [OptimizedSeat], default: [] })
  seats: OptimizedSeat[];

  @Prop({ type: [CompactItem], default: [] })
  items: CompactItem[];

  // Canvas dimensions
  @Prop({ required: true, min: 100, max: 10000, default: 1200 })
  canvasW: number;

  @Prop({ required: true, min: 100, max: 10000, default: 700 })
  canvasH: number;

  // Spatial indexing for viewport queries
  @Prop({ type: SpatialGrid })
  spatialGrid?: SpatialGrid;

  // Removed stats, isActive, version - these are now event/show specific

  // Soft delete support
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const SeatLayoutSchema = SchemaFactory.createForClass(SeatLayout);

// Compound indexes for optimal query performance
SeatLayoutSchema.index({ venueOwnerId: 1, isActive: 1, isDeleted: 1 });
SeatLayoutSchema.index({ eventId: 1, isActive: 1, isDeleted: 1 });
SeatLayoutSchema.index({ 'seats.status': 1, 'seats.catId': 1 });
SeatLayoutSchema.index({ 'seats.pos.x': 1, 'seats.pos.y': 1 }); // 2D index for spatial queries
SeatLayoutSchema.index({ createdAt: -1, isDeleted: 1 });

// Instance methods for spatial indexing only
SeatLayoutSchema.methods.getSeatCount = function() {
  return this.seats.length;
};

SeatLayoutSchema.methods.updateSpatialGrid = function() {
  const cellSize = 100; // 100px grid cells
  const gridWidth = Math.ceil(this.canvasW / cellSize);
  const gridHeight = Math.ceil(this.canvasH / cellSize);
  
  const grid = {
    cellSize,
    gridWidth,
    gridHeight,
    cellIndex: {} as Record<string, string[]>
  };

  // Index all seats and items by grid cells
  [...this.seats, ...this.items].forEach((item: any) => {
    const startX = Math.floor(item.pos.x / cellSize);
    const startY = Math.floor(item.pos.y / cellSize);
    const endX = Math.floor((item.pos.x + item.size.x) / cellSize);
    const endY = Math.floor((item.pos.y + item.size.y) / cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const cellKey = `${x},${y}`;
        if (!grid.cellIndex[cellKey]) {
          grid.cellIndex[cellKey] = [];
        }
        grid.cellIndex[cellKey].push(item.id);
      }
    }
  });

  this.spatialGrid = grid;
};

// Pre-save middleware for spatial indexing
SeatLayoutSchema.pre('save', function() {
  if (this.isModified('seats') || this.isModified('items')) {
    (this as any).updateSpatialGrid();
  }
});

// Static methods for efficient queries
SeatLayoutSchema.statics.findByViewport = function(
  layoutId: string,
  viewport: { x: number; y: number; width: number; height: number }
) {
  return this.aggregate([
    { $match: { _id: new Types.ObjectId(layoutId) } },
    {
      $project: {
        name: 1,
        categories: 1,
        canvasW: 1,
        canvasH: 1,
        stats: 1,
        // Filter seats within viewport
        seats: {
          $filter: {
            input: '$seats',
            cond: {
              $and: [
                { $gte: ['$$this.pos.x', viewport.x - 50] }, // Add padding
                { $lte: ['$$this.pos.x', viewport.x + viewport.width + 50] },
                { $gte: ['$$this.pos.y', viewport.y - 50] },
                { $lte: ['$$this.pos.y', viewport.y + viewport.height + 50] }
              ]
            }
          }
        },
        // Filter items within viewport
        items: {
          $filter: {
            input: '$items',
            cond: {
              $and: [
                { $gte: ['$$this.pos.x', viewport.x - 50] },
                { $lte: ['$$this.pos.x', viewport.x + viewport.width + 50] },
                { $gte: ['$$this.pos.y', viewport.y - 50] },
                { $lte: ['$$this.pos.y', viewport.y + viewport.height + 50] }
              ]
            }
          }
        }
      }
    }
  ]);
};

// Removed updateSeatStatuses - now handled by SeatState collection