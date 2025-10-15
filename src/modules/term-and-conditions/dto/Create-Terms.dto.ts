import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TermsType } from 'src/infrastructure/database/schemas/terms-and-conditions.schema';


export class CreateSubSectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @IsString({ each: true })
  descriptions: string[];
}

export class CreateTermsDto {
  @IsEnum(TermsType)
  category: TermsType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubSectionDto)
  subSections: CreateSubSectionDto[];
}

export class UpdateTermsDto {
  @IsOptional()
  @IsEnum(TermsType)
  category?: TermsType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubSectionDto)
  subSections?: CreateSubSectionDto[];
}
