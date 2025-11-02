import { IsNotEmpty, IsArray } from 'class-validator';

export class BoothBookDto {
  @IsNotEmpty()
  eventId: string;

  @IsArray()
  @IsNotEmpty({ each: true })
  boothIds: string[];
}
