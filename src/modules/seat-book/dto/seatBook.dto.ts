import { IsNotEmpty } from 'class-validator';

export class SeatBookDto {
  @IsNotEmpty()
  eventId: string;

  @IsNotEmpty()
  seatIds: string[];
}
