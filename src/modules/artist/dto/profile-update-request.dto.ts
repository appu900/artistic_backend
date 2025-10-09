import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateArtistProfileDto {
  @ApiProperty({
    description: 'List of genres (music/dance categories)',
    example: ['rock', 'pop', 'jazz'],
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  genres?: string[];

   @ApiProperty({
    description: 'List of skills',
    example: ['Guitar', 'song', 'dumpstick'],
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  skills:string[]

  @ApiProperty({ example: 'music', description: 'Artist category' })
  @IsOptional()
  @IsString()
  category?: string;

  // These will be handled by File upload interceptor (S3)
  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  profileImage?: any;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  profileCoverImage?: any;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  demoVideo?: any;
}
