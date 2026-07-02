import { IsNotEmpty, IsOptional, IsString, IsArray, ArrayMinSize } from 'class-validator';

export class SeatBookDto {
  @IsNotEmpty()
  @IsString()
  eventId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  seatIds: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}


