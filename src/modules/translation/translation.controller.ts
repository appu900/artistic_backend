import {
  Controller,
  Post,
  Body,
  Get,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TranslationService } from './translation.service';
import { TranslateTextDto, TranslateResponseDto } from './dto';

@ApiTags('Translation')
@Controller('translation')
/**
 * Translation controller for converting English text to Arabic
 * These endpoints are public (no authentication required) to support
 * language switching on public pages like homepage
 */
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Translate text from English to Arabic',
    description: 'Converts English text to Arabic using AWS Translate service for navbar language toggle and public content',
  })
  @ApiResponse({
    status: 200,
    description: 'Text translated successfully',
    type: TranslateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input or translation failed',
  })
  async translateText(@Body() translateDto: TranslateTextDto): Promise<TranslateResponseDto> {
    return this.translationService.translateText(translateDto);
  }

  @Post('translate-bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Translate multiple texts from English to Arabic',
    description: 'Bulk translation for UI elements when switching to Arabic language - available for public content',
  })
  @ApiResponse({
    status: 200,
    description: 'Texts translated successfully',
    type: [TranslateResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input or translation failed',
  })
  async translateBulkText(@Body() texts: string[]): Promise<TranslateResponseDto[]> {
    return this.translationService.translateBulkText(texts);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check translation service health',
    description: 'Verify AWS Translate service connectivity and credentials',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        service: { type: 'string', example: 'AWS Translate' },
        timestamp: { type: 'string', example: '2025-10-19T10:30:00.000Z' },
      },
    },
  })
  async checkHealth() {
    const isHealthy = await this.translationService.isServiceHealthy();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'AWS Translate',
      timestamp: new Date().toISOString(),
    };
  }
}