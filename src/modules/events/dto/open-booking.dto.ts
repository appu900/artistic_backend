import { IsOptional, IsString } from 'class-validator';

export class OpenBookingDto {
  @IsString()
  eventId: string;

  @IsString()
  layoutId: string;
}
