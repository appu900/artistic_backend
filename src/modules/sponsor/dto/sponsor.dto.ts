import { 
  IsString, 
  IsOptional, 
  IsBoolean, 
  IsNumber, 
  IsUrl, 
  IsDateString,
  IsEnum 
} from 'class-validator';

export enum SponsorTier {
  PLATINUM = 'platinum',
  GOLD = 'gold',
  SILVER = 'silver',
  BRONZE = 'bronze',
  PARTNER = 'partner'
}

export class CreateSponsorDto {
  @IsString()
  name: string;

  @IsString()
  logo: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsEnum(SponsorTier)
  tier?: SponsorTier;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSponsorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsEnum(SponsorTier)
  tier?: SponsorTier;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSponsorOrderDto {
  @IsString()
  sponsorId: string;

  @IsNumber()
  order: number;
}
