import { IsString, IsNotEmpty, IsNumber, Min, IsEmail, IsOptional, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserDetailsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
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

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  venueType?: string;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}

export class CreateEquipmentPackageBookingDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string; // Format: YYYY-MM-DD

  @IsDateString()
  @IsNotEmpty()
  endDate: string; // Format: YYYY-MM-DD

  @ValidateNested()
  @Type(() => UserDetailsDto)
  userDetails: UserDetailsDto;

  @ValidateNested()
  @Type(() => VenueDetailsDto)
  venueDetails: VenueDetailsDto;

  @IsOptional()
  @IsString()
  eventDescription?: string;

  @IsOptional()
  @IsString()
  specialRequests?: string;
}

export class UpdateEquipmentPackageBookingStatusDto {
  @IsString()
  @IsNotEmpty()
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';

  @IsOptional()
  @IsString()
  cancellationReason?: string;
}