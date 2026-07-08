import { IsNotEmpty, IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class TableBookDto {
  @IsNotEmpty()
  @IsString()
  eventId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  tableIds: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
