import { IsString, IsArray, IsOptional, IsNumber, IsEnum, IsEmail, IsPhoneNumber, ValidateNested, Min, Max, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SeatHoldReason } from '../../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';

export class ContactInfoDto {
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'john.smith@email.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class PaymentInfoDto {
  @ApiProperty({ example: 'card', description: 'Payment method used' })
  @IsString()
  method: string;

  @ApiPropertyOptional({ example: 'stripe_tx_123456' })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiPropertyOptional({ example: 'stripe' })
  @IsOptional()
  @IsString()
  gateway?: string;
}

export class HoldSeatsDto {
  @ApiProperty({ example: '64f123456789abcd12345678' })
  @IsString()
  eventId: string;

  @ApiProperty({ 
    example: ['seat_A1', 'seat_A2', 'seat_A3'],
    description: 'Array of seat IDs to hold' 
  })
  @IsArray()
  @ArrayMaxSize(50, { message: 'Cannot hold more than 50 seats at once' })
  @IsString({ each: true })
  seatIds: string[];

  @ApiPropertyOptional({ 
    example: 10, 
    description: 'Hold duration in minutes (default: 10)' 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120) // Maximum 2 hours hold
  holdDurationMinutes?: number;

  @ApiPropertyOptional({ 
    example: 'payment_processing',
    enum: SeatHoldReason 
  })
  @IsOptional()
  @IsEnum(SeatHoldReason)
  reason?: SeatHoldReason;
}

export class HoldTableDto {
  @ApiProperty({ example: '64f123456789abcd12345678' })
  @IsString()
  eventId: string;

  @ApiProperty({ example: 'table_VIP_001' })
  @IsString()
  tableId: string;

  @ApiPropertyOptional({ 
    example: 10, 
    description: 'Hold duration in minutes (default: 10)' 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  holdDurationMinutes?: number;

  @ApiPropertyOptional({ 
    example: 'payment_processing',
    enum: SeatHoldReason 
  })
  @IsOptional()
  @IsEnum(SeatHoldReason)
  reason?: SeatHoldReason;
}

export class ConfirmBookingDto {
  @ApiProperty({ example: '64f123456789abcd12345678' })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({ 
    example: ['seat_A1', 'seat_A2'],
    description: 'Individual seat IDs (if not booking entire tables)' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatIds?: string[];

  @ApiPropertyOptional({ 
    example: ['table_VIP_001'],
    description: 'Table IDs to book entirely' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tableIds?: string[];

  @ApiProperty({ description: 'Contact information for the booking' })
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contactInfo: ContactInfoDto;

  @ApiPropertyOptional({ description: 'Payment information (if payment already processed)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInfoDto)
  paymentInfo?: PaymentInfoDto;

  @ApiPropertyOptional({ example: 'Birthday celebration booking' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Need wheelchair accessibility' })
  @IsOptional()
  @IsString()
  specialRequests?: string;
}

export class ViewportDto {
  @ApiProperty({ example: 0 })
  @IsNumber()
  x: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  y: number;

  @ApiProperty({ example: 800 })
  @IsNumber()
  @Min(1)
  width: number;

  @ApiProperty({ example: 600 })
  @IsNumber()
  @Min(1)
  height: number;
}

// Response DTOs
export class BookingResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  bookingId?: string;

  @ApiPropertyOptional()
  heldSeats?: string[];

  @ApiPropertyOptional()
  conflictingSeats?: string[];

  @ApiPropertyOptional()
  totalAmount?: number;
}

export class SeatStateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  position: { x: number; y: number };

  @ApiProperty()
  size: { x: number; y: number };

  @ApiProperty()
  categoryId: string;

  @ApiProperty()
  rotation: number;

  @ApiPropertyOptional()
  rowLabel?: string;

  @ApiPropertyOptional()
  seatNumber?: number;

  @ApiProperty({ enum: ['available', 'booked', 'held', 'blocked'] })
  status: string;

  @ApiPropertyOptional()
  bookedBy?: string;

  @ApiPropertyOptional()
  heldBy?: string;

  @ApiPropertyOptional()
  holdExpiresAt?: Date;

  @ApiPropertyOptional()
  bookedAt?: Date;

  @ApiPropertyOptional()
  bookedPrice?: number;
}

export class LayoutResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: {
    layout: {
      id: string;
      name: string;
      canvasW: number;
      canvasH: number;
      categories: any[];
    };
    seats: SeatStateResponseDto[];
    items: any[];
    stats: any[];
  };
}