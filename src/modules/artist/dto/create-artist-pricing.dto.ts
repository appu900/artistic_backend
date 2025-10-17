import { ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PricingEntryDto } from 'src/modules/artist/dto/create-artist.dto'; 

export class CreateArtistPricingDto {
  @ApiProperty({
    example: '653fa1209a0b22ab547fe12c',
    description: 'Artist Profile ObjectId reference',
  })
  @IsMongoId()
  artistProfileId: string;

  @ApiProperty({
    example: [
      { hours: 1, amount: 2000 },
      { hours: 3, amount: 5000 },
    ],
    required: false,
    type: [PricingEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  privatePricing?: PricingEntryDto[];

  @ApiProperty({
    example: [
      { hours: 2, amount: 4000 },
      { hours: 4, amount: 7500 },
    ],
    required: false,
    type: [PricingEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  publicPricing?: PricingEntryDto[];

  @ApiProperty({
    example: [
      { hours: 2, amount: 6000 },
      { hours: 5, amount: 12000 },
    ],
    required: false,
    type: [PricingEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingEntryDto)
  workshopPricing?: PricingEntryDto[];



}
