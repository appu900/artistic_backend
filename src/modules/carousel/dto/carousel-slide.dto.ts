import { IsString, IsOptional, IsBoolean, IsNumber, IsUrl, IsDateString } from 'class-validator';

export class CreateCarouselSlideDto {
  @IsString()
  title: string;

  @IsString()
  titleHighlight: string;

  @IsString()
  subtitle: string;

  @IsString()
  image: string;

  @IsString()
  ctaText: string;

  @IsUrl()
  ctaLink: string;

  @IsString()
  category: string;

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
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateCarouselSlideDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  titleHighlight?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  ctaText?: string;

  @IsOptional()
  @IsUrl()
  ctaLink?: string;

  @IsOptional()
  @IsString()
  category?: string;

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
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSlideOrderDto {
  @IsString()
  slideId: string;

  @IsNumber()
  order: number;
}