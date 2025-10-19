import { IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsEmail, Min, Max, ValidateNested, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PerformancePreference } from 'src/common/enums/roles.enum';

export class PricingEntryDto {
  @ApiProperty({ required: false })
  @IsNumber()
  hours: number;

  @ApiProperty({ required: false })
  @IsNumber()
  amount: number;
}

export class TimeSlotPricingDto {
  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @Max(23)
  hour: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  rate: number;
}

export class EditArtistDto {
  // User fields
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  // Artist profile fields
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stageName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  musicLanguages?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  awards?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerHour?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  artistType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ 
    required: false, 
    enum: PerformancePreference,
    isArray: true,
    example: [PerformancePreference.PRIVATE, PerformancePreference.PUBLIC]
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PerformancePreference, { each: true })
  performPreference?: PerformancePreference[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  youtubeLink?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  cooldownPeriodHours?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  maximumPerformanceHours?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Pricing fields
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pricingMode?: 'duration' | 'timeslot';

  @ApiProperty({ required: false, type: [PricingEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  privatePricing?: PricingEntryDto[];

  @ApiProperty({ required: false, type: [PricingEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  publicPricing?: PricingEntryDto[];

  @ApiProperty({ required: false, type: [PricingEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  workshopPricing?: PricingEntryDto[];

  @ApiProperty({ required: false, type: [PricingEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  internationalPricing?: PricingEntryDto[];

  @ApiProperty({ required: false, type: [TimeSlotPricingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotPricingDto)
  privateTimeSlotPricing?: TimeSlotPricingDto[];

  @ApiProperty({ required: false, type: [TimeSlotPricingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotPricingDto)
  publicTimeSlotPricing?: TimeSlotPricingDto[];

  @ApiProperty({ required: false, type: [TimeSlotPricingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotPricingDto)
  workshopTimeSlotPricing?: TimeSlotPricingDto[];

  @ApiProperty({ required: false, type: [TimeSlotPricingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotPricingDto)
  internationalTimeSlotPricing?: TimeSlotPricingDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrivateRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePublicRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseWorkshopRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseInternationalRate?: number;
}