import { IsString, IsEnum, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PortfolioItemType } from 'src/infrastructure/database/schemas/portfolio-item.schema';

export class CreatePortfolioItemDto {
  @ApiProperty({ description: 'Title of the portfolio item' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Description of the portfolio item' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiProperty({ 
    description: 'Type of portfolio item',
    enum: PortfolioItemType
  })
  @IsEnum(PortfolioItemType)
  type: PortfolioItemType;
}

export class ReviewPortfolioItemDto {
  @ApiProperty({ description: 'Review comment from admin' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reviewComment?: string;
}