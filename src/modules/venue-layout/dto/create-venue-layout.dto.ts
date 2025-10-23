import { IsString, IsArray, IsNumber, IsOptional, ValidateNested, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';

export enum SeatStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked',
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
}

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

export class CoordinateDto {
  @IsNumber()
  @Min(0)
  x: number;

  @IsNumber()
  @Min(0)
  y: number;
}

export class SeatCategoryDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()  
  color: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsEnum(['seat', 'table', 'booth'] as any)
  appliesTo?: 'seat' | 'table' | 'booth';
}

export class OptimizedSeatDto {
  @IsString()
  id: string;

  @ValidateNested()
  @Type(() => CoordinateDto)
  pos: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  size: CoordinateDto;

  @IsString()
  catId: string;

  @IsOptional()
  @IsNumber()
  rot?: number;

  @IsOptional()
  @IsString()
  rl?: string;

  @IsOptional()
  @IsNumber()
  sn?: number;

  // Optional label for seats (used for tables/booths)
  @IsOptional()
  @IsString()
  lbl?: string;

  // Optional group id (e.g., table id)
  @IsOptional()
  @IsString()
  grpId?: string;

  // Status removed - now handled by SeatState collection
}

export class OptimizedItemDto {
  @IsString()
  id: string;

  @IsEnum(SeatMapItemType)
  type: SeatMapItemType;

  @ValidateNested()
  @Type(() => CoordinateDto)
  pos: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  size: CoordinateDto;

  @IsOptional()
  @IsNumber()
  rot?: number;

  @IsOptional()
  @IsString()
  lbl?: string;

  @IsOptional()
  @IsEnum(TableShape)
  shp?: TableShape;

  @IsOptional()
  @IsNumber()
  ts?: number;

  @IsOptional()
  @IsNumber()
  sc?: number;

  // Optional category link for non-seat items (tables/booths)
  @IsOptional()
  @IsString()
  catId?: string;

  // Direct price for tables/booths to support user-side rendering
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class CreateVenueLayoutDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  venueOwnerId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatCategoryDto)
  categories: SeatCategoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptimizedSeatDto)
  seats: OptimizedSeatDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptimizedItemDto)
  items: OptimizedItemDto[];

  @IsNumber()
  @Min(100)
  @Max(10000)
  canvasW: number;

  @IsNumber()
  @Min(100)
  @Max(10000)
  canvasH: number;
}

export class ViewportDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  @Min(1)
  width: number;

  @IsNumber()
  @Min(1)
  height: number;
}

export class SeatStatusUpdateDto {
  @IsString()
  seatId: string;

  @IsEnum(SeatStatus)
  status: SeatStatus;
}

export class BulkSeatStatusUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatStatusUpdateDto)
  updates: SeatStatusUpdateDto[];
}