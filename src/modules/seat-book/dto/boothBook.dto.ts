import { IsNotEmpty, IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

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
}
