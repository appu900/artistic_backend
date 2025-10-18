import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TranslateTextDto {
  @ApiProperty({
    description: 'Text to translate from English to Arabic',
    example: 'Hello, welcome to our artistic platform!',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Source language code (default: en)',
    example: 'en',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(['en'])
  sourceLanguage?: string = 'en';

  @ApiProperty({
    description: 'Target language code (default: ar)',
    example: 'ar',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(['ar'])
  targetLanguage?: string = 'ar';
}

export class TranslateResponseDto {
  @ApiProperty({
    description: 'Original text in English',
    example: 'Hello, welcome to our artistic platform!',
  })
  originalText: string;

  @ApiProperty({
    description: 'Translated text in Arabic',
    example: 'مرحباً، أهلاً بك في منصتنا الفنية!',
  })
  translatedText: string;

  @ApiProperty({
    description: 'Source language used for translation',
    example: 'en',
  })
  sourceLanguage: string;

  @ApiProperty({
    description: 'Target language used for translation',
    example: 'ar',
  })
  targetLanguage: string;
}