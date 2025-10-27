import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ArtistType {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

export class EquipmentItemDto {
  @IsMongoId()
  @IsNotEmpty()
  equipmentId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class UserEquipmentPackgesDTO {
  @IsNotEmpty()
  userPackageId: string;
}


export class CreateArtistBookingDto {
  bookedBy?: string;

  @IsMongoId()
  @IsNotEmpty()
  artistId: string;

  @IsEnum(ArtistType)
  artistType: ArtistType;

  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsString()
  @IsOptional()
  address?: string;
}

//
// Equipment Booking DTO
//
export class CreateEquipmentBookingDto {
  @IsOptional()
  bookedBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipmentItemDto)
  @IsOptional()
  equipments?: EquipmentItemDto[];

  @IsOptional()
  @IsArray()
  userEquipmentPackages?: string[];

  @IsArray()
  @IsOptional()
  packages?: string[];

  // Multi-day support
  @IsOptional()
  @IsBoolean()
  isMultiDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDateDto)
  equipmentDates?: EventDateDto[];

  // Legacy single-day fields (for backward compatibility)
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsNumber()
  @Min(0.01)
  totalPrice: number;

  @IsString()
  @IsOptional()
  address?: string;
}

//
// 🌍 3. Combined Booking DTO (Artist + Equipment)
//
export class UserDetailsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class VenueDetailsDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  venueType?: string;

  @IsString()
  @IsOptional()
  additionalInfo?: string;
}

export class CreateCombinedBookingDto {
  @IsOptional()
  bookedBy?: string;

  @IsMongoId()
  @IsNotEmpty()
  artistId: string;

  @IsString()
  @IsNotEmpty()
  eventType: string;

  // Artist booking configuration
  @IsOptional()
  @IsBoolean()
  isArtistMultiDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDateDto)
  artistEventDates?: EventDateDto[];

  // Equipment booking configuration
  @IsOptional()
  @IsBoolean()
  isEquipmentMultiDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDateDto)
  equipmentEventDates?: EventDateDto[];

  // Legacy fields (for backward compatibility)
  @IsOptional()
  @IsBoolean()
  isMultiDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDateDto)
  eventDates?: EventDateDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalHours?: number;

  @IsOptional()
  @IsString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsNumber()
  @Min(0)
  artistPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  equipmentPrice?: number;

  @IsNumber()
  @Min(0.01)
  totalPrice: number;

  @ValidateNested()
  @Type(() => UserDetailsDto)
  userDetails: UserDetailsDto;

  @ValidateNested()
  @Type(() => VenueDetailsDto)
  venueDetails: VenueDetailsDto;

  @IsString()
  @IsOptional()
  eventDescription?: string;

  @IsString()
  @IsOptional()
  specialRequests?: string;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  selectedEquipmentPackages?: string[];

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  selectedCustomPackages?: string[];
}

export class EventDateDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;
}

export class CalculatePricingDto {
  @IsMongoId()
  @IsOptional()
  artistId?: string;

  @IsEnum(ArtistType)
  eventType: ArtistType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDateDto)
  eventDates?: EventDateDto[];

  @IsOptional()
  @IsString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  selectedEquipmentPackages?: string[];

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  selectedCustomPackages?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipmentItemDto)
  @IsOptional()
  equipments?: EquipmentItemDto[];
}

//
// 🧾 4. Query DTOs (for dashboards)
//
export class ArtistBookingQueryDto {
  @IsMongoId()
  artistId: string;
}

export class EquipmentProviderBookingQueryDto {
  @IsMongoId()
  userId: string;
}

export class UserBookingQueryDto {
  @IsMongoId()
  userId: string;
}
