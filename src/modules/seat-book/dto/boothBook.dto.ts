import { IsNotEmpty, IsArray, IsOptional, IsString, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerDetailsDto } from './customer-details.dto';

export class BoothBookDto {
  @IsNotEmpty()
  @IsString()
  eventId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  boothIds: string[];

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
