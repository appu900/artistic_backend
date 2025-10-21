import { IsString, IsNumber, IsArray, IsOptional, IsEnum, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export enum SeatMapItemType {
  SEAT = 'seat',
  ENTRY = 'entry',
  EXIT = 'exit',
  WASHROOM = 'washroom',
  SCREEN = 'screen',
  STAGE = 'stage',
  TABLE = 'table',
  BOOTH = 'booth',
}

export enum TableShape {
  ROUND = 'round',
  RECT = 'rect',
  HALF = 'half',
  TRIANGLE = 'triangle',
}

export class SeatCategoryDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  color: string;

  @IsNumber()
  price: number;
}

export class SeatMapItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsEnum(SeatMapItemType)
  type: SeatMapItemType;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  w: number;

  @IsNumber()
  h: number;

  @IsNumber()
  @IsOptional()
  rotation?: number;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsEnum(TableShape)
  @IsOptional()
  shape?: TableShape;

  @IsString()
  @IsOptional()
  rowLabel?: string;

  @IsNumber()
  @IsOptional()
  seatNumber?: number;

  @IsNumber()
  @IsOptional()
  tableSeats?: number;

  @IsNumber()
  @IsOptional()
  seatCount?: number;

  @IsString()
  @IsOptional()
  seatId?: string;

  @IsString()
  @IsOptional()
  sectionId?: string;

  @IsString()
  @IsOptional()
  subSectionId?: string;

  @IsString()
  @IsOptional()
  rowId?: string;
}

export class CreateVenueLayoutDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  venueOwnerId?: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatMapItemDto)
  items: SeatMapItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatCategoryDto)
  categories: SeatCategoryDto[];

  @IsNumber()
  @IsOptional()
  canvasW?: number;

  @IsNumber()
  @IsOptional()
  canvasH?: number;
}
