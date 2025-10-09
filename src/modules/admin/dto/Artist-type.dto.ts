import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateArtistTypeDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'Singer', description: 'type name' })
  name: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    example: 'Singer is a person who sings',
    description: 'little abot the type',
  })
  description: string;
}
