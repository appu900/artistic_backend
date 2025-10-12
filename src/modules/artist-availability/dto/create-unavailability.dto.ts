import { IsArray, IsDateString, IsNumber, IsOptional } from 'class-validator';

export class UnavailabilitySlotDto {
  @IsDateString()
  date: string; // e.g. "2025-10-21"

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  hours?: number[]; // e.g. [18,19,20] (optional means full-day)
}

export class BulkUnavailabilityDto {
  @IsArray()
  slots: UnavailabilitySlotDto[];
}
