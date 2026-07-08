import { IsNotEmpty, IsOptional, IsString, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CustomerDetailsDto } from './customer-details.dto';

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

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerDetailsDto)
  customerDetails?: CustomerDetailsDto;
}


