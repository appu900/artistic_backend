
import { IsISO8601, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class AddToCartDto {
  @IsNotEmpty()
  @IsString()
  artistId: string;

  @IsNotEmpty()
  @IsISO8601()
  bookingDate: string; // "2025-10-24"

  @IsNotEmpty()
  @IsString()
  startTime: string; 


  @IsNotEmpty()
  @IsString()
  endTime: string; 

  @IsNumber()
  @Min(1)
  hours: number;

  @IsNumber()
  @Min(0)
  totalPrice: number;
}
