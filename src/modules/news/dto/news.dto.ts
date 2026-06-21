import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostType } from '../../../infrastructure/database/schemas/news-post.schema';

export class CreateNewsPostDto {
  @ApiProperty({ example: 'New Feature: Live Booking Alerts' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'We are excited to announce...' })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: 'A short summary of the post' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ enum: PostType, default: PostType.NEWS })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({ example: ['announcement', 'music'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    return [];
  })
  tags?: string[];
}

export class UpdateNewsPostDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ enum: PostType })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    return undefined;
  })
  tags?: string[];
}

export class ReviewNewsPostDto {
  @ApiProperty({ example: true, description: 'true = approve, false = reject' })
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  approve: boolean;

  @ApiPropertyOptional({ example: 'Content violates community guidelines' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
