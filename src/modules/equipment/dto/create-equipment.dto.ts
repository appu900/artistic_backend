import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EquipmentCategory {
  SOUND = 'SOUND',
  DISPLAY = 'DISPLAY',
  LIGHT = 'LIGHT',
  OTHER = 'OTHER'
}

export class CreateEquipmentDto {
  @ApiProperty({ example: 'Professional Microphone' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'SOUND', enum: EquipmentCategory })
  @IsEnum(EquipmentCategory)
  category: EquipmentCategory;

  @ApiPropertyOptional({ example: 'High-quality professional microphone for concerts and events' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '50' })
  @IsString()
  pricePerHour: string;

  @ApiProperty({ example: '300' })
  @IsString()
  pricePerDay: string;

  @ApiProperty({ example: '5' })
  @IsString()
  quantity: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string;
}