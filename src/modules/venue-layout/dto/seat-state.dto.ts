import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';

export enum SeatStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked', 
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
  HELD = 'held',
}

export enum SeatHoldReason {
  PAYMENT_PROCESSING = 'payment_processing',
  ADMIN_HOLD = 'admin_hold',
  MAINTENANCE = 'maintenance',
}

export class CreateSeatStateDto {
  @IsString()
  layoutId: string;

  @IsString()
  eventId: string;

  @IsString()
  seatId: string;

  @IsEnum(SeatStatus)
  status: SeatStatus = SeatStatus.AVAILABLE;

  @IsOptional()
  @IsString()
  bookedBy?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsDateString()
  bookedAt?: string;

  @IsOptional()
  @IsString()
  heldBy?: string;

  @IsOptional()
  @IsDateString()
  holdExpiresAt?: string;

  @IsOptional()
  @IsEnum(SeatHoldReason)
  holdReason?: SeatHoldReason;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bookedPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSeatStateDto {
  @IsOptional()
  @IsEnum(SeatStatus)
  status?: SeatStatus;

  @IsOptional()
  @IsString()
  bookedBy?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsDateString()
  bookedAt?: string;

  @IsOptional()
  @IsString()
  heldBy?: string;

  @IsOptional()
  @IsDateString()
  holdExpiresAt?: string;

  @IsOptional()
  @IsEnum(SeatHoldReason)
  holdReason?: SeatHoldReason;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bookedPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkSeatStateUpdateDto {
  @IsString()
  seatId: string;

  @IsEnum(SeatStatus)
  status: SeatStatus;

  @IsOptional()
  @IsString()
  bookedBy?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bookedPrice?: number;
}

export class BulkSeatStateUpdatesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSeatStateUpdateDto)
  updates: BulkSeatStateUpdateDto[];
}

export class SeatLockRequestDto {
  @IsArray()
  @IsString({ each: true })
  seatIds: string[];

  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30) // Maximum 30 minutes hold
  lockDurationMinutes?: number = 10;
}

export class SeatLockReleaseDto {
  @IsArray()
  @IsString({ each: true })
  seatIds: string[];

  @IsString()
  userId: string;
}

export class SeatLockExtendDto {
  @IsArray()
  @IsString({ each: true })
  seatIds: string[];

  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15) // Maximum 15 minutes extension
  additionalMinutes?: number = 5;
}

export class InitializeEventSeatsDto {
  @IsString()
  layoutId: string;

  @IsString()
  eventId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatIds?: string[]; // If not provided, will initialize all seats from layout
}

export class SeatAvailabilityQueryDto {
  @IsString()
  eventId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatIds?: string[]; // If provided, check specific seats only

  @IsOptional()
  @IsString()
  categoryId?: string; // Filter by category

  @IsOptional()
  @IsEnum(SeatStatus)
  status?: SeatStatus; // Filter by status
}

