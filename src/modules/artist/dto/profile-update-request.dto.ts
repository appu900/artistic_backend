import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsNumber, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PerformancePreference } from 'src/common/enums/roles.enum';

export class UpdateArtistProfileDto {
  @ApiProperty({
    description: 'List of genres (music/dance categories)',
    example: ['rock', 'pop', 'jazz'],
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  genres?: string[];

  @ApiProperty({
    description: 'List of skills',
    example: ['Guitar', 'song', 'drumstick'],
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  skills?: string[];

  @ApiProperty({ example: 'music', description: 'Artist category', required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'A passionate musician...', description: 'About section', required: false })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiProperty({ example: 5, description: 'Years of experience', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;

  @ApiProperty({
    description: 'Music languages',
    example: ['English', 'Spanish'],
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  musicLanguages?: string[];

  @ApiProperty({
    description: 'Awards received',
    example: ['Best Singer 2023', 'Music Award 2024'],
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  awards?: string[];

  @ApiProperty({ example: 100, description: 'Price per hour', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerHour?: number;

  @ApiProperty({
    description: 'Performance preferences',
    example: [PerformancePreference.PRIVATE, PerformancePreference.PUBLIC],
    enum: PerformancePreference,
    isArray: true,
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  performPreference?: PerformancePreference[];

  // These will be handled by File upload interceptor (S3)
  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  profileImage?: any;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  profileCoverImage?: any;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  demoVideo?: any;
}
