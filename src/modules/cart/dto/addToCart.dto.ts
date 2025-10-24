
import { IsArray, IsBoolean, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @IsNotEmpty()
  @IsString()
  artistId: string;

  @IsNotEmpty()
  @IsISO8601()
  bookingDate: string; 

  @IsNotEmpty()
  @IsString()
  startTime: string; 


  @IsNotEmpty()
  @IsString()
  endTime: string; 

  @IsNumber()
  @Min(1)
  hours: number;

  @IsNumber()
  @Min(0)
  totalPrice: number;

  // Equipment selections
  @IsOptional()
  @IsArray()
  selectedEquipmentPackages?: string[];

  @IsOptional()
  @IsArray()
  selectedCustomPackages?: string[];

  @IsOptional()
  @IsBoolean()
  isEquipmentMultiDay?: boolean;

  @IsOptional()
  @IsArray()
  equipmentEventDates?: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;

  // Persisted user and venue details for checkout 
  @IsOptional()
  userDetails?: {
    name: string;
    email: string;
    phone: string;
  };

  @IsOptional()
  venueDetails?: {
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode?: string;
    venueType?: string;
    additionalInfo?: string;
  };
}
