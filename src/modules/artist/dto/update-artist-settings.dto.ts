import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateArtistSettingsDto {
  @ApiProperty({
    description: 'Hours to wait after a booking before next availability',
    example: 2,
    minimum: 1,
    maximum: 24,
    required: false
  })
  @IsOptional()
  @IsNumber({}, { message: 'Cooldown period must be a number' })
  @Min(1, { message: 'Cooldown period must be at least 1 hour' })
  @Max(24, { message: 'Cooldown period cannot exceed 24 hours' })
  cooldownPeriodHours?: number;

  @ApiProperty({
    description: 'Maximum consecutive hours per booking',
    example: 4,
    minimum: 1,
    maximum: 12,
    required: false
  })
  @IsOptional()
  @IsNumber({}, { message: 'Maximum performance hours must be a number' })
  @Min(1, { message: 'Maximum performance hours must be at least 1 hour' })
  @Max(12, { message: 'Maximum performance hours cannot exceed 12 hours' })
  maximumPerformanceHours?: number;
}