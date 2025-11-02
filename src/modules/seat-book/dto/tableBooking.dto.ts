import { IsNotEmpty, IsArray } from 'class-validator';

export class TableBookDto {
  @IsNotEmpty()
  eventId: string;

  @IsArray()
  @IsNotEmpty({ each: true })
  tableIds: string[];
}
