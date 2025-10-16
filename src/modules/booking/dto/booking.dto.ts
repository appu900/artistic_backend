import {
  IsArray,
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

//
// Artist Booking DTO
//
export class CreateArtistBookingDto {
 
  bookedBy?: string; // userId

  @IsMongoId()
  @IsNotEmpty()
  artistId: string;

  @IsEnum(ArtistType)
  artistType: ArtistType;

  @IsString()
  @IsNotEmpty()
  date: string; // format: yyyy-mm-dd

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsNumber()
  @Min(1)
  price: number;

  @IsString()
  @IsOptional()
  address?:string
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

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  packages?: string[];

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
  @Min(1)
  totalPrice: number;

   @IsString()
   @IsOptional()
   address?:string
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

  @IsString()
  @IsNotEmpty()
  eventDate: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsNumber()
  @Min(0)
  artistPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  equipmentPrice?: number;

  @IsNumber()
  @Min(1)
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
