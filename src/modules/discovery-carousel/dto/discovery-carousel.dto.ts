import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDiscoveryCardDto {
  @IsString()
  category: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsEnum(['image', 'video'])
  mediaType: 'image' | 'video';

  @IsString()
  mediaUrl: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDiscoveryCardDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsEnum(['image', 'video'])
  mediaType?: 'image' | 'video';

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDiscoverySettingsDto {
  @IsOptional()
  @IsString()
  eyebrow?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;
}
