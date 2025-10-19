import { IsArray, IsDateString, IsNumber, IsOptional } from 'class-validator';

export class UnavailabilitySlotDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  hours?: number[]; 
}

export class BulkUnavailabilityDto {
  @IsArray()
  slots: UnavailabilitySlotDto[];
}
