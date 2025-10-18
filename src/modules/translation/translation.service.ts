import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { TranslateTextDto, TranslateResponseDto } from './dto';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly translateClient: TranslateClient;

  constructor(private readonly configService: ConfigService) {
    // Initialize AWS Translate client
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials are required. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    this.translateClient = new TranslateClient({
      region: this.configService.get<string>('AWS_TRANSLATE_REGION', 'us-east-1'),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async translateText(translateDto: TranslateTextDto): Promise<TranslateResponseDto> {
    try {
      const { text, sourceLanguage = 'en', targetLanguage = 'ar' } = translateDto;

      this.logger.log(`Translating text from ${sourceLanguage} to ${targetLanguage}`);

      // Create translation command
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: sourceLanguage,
        TargetLanguageCode: targetLanguage,
      });

      // Execute translation
      const response = await this.translateClient.send(command);

      if (!response.TranslatedText) {
        throw new BadRequestException('Translation failed - no result returned');
      }

      return {
        originalText: text,
        translatedText: response.TranslatedText,
        sourceLanguage,
        targetLanguage,
      };
    } catch (error) {
      this.logger.error('Translation failed:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(
        `Translation service error: ${error.message || 'Unknown error occurred'}`
      );
    }
  }

  async translateBulkText(texts: string[]): Promise<TranslateResponseDto[]> {
    try {
      this.logger.log(`Translating ${texts.length} texts in bulk`);
      
      const translationPromises = texts.map(text =>
        this.translateText({ text, sourceLanguage: 'en', targetLanguage: 'ar' })
      );

      return await Promise.all(translationPromises);
    } catch (error) {
      this.logger.error('Bulk translation failed:', error);
      throw new BadRequestException(
        `Bulk translation service error: ${error.message || 'Unknown error occurred'}`
      );
    }
  }

  async isServiceHealthy(): Promise<boolean> {
    try {
      // Test with a simple phrase
      await this.translateText({ 
        text: 'Hello', 
        sourceLanguage: 'en', 
        targetLanguage: 'ar' 
      });
      return true;
    } catch (error) {
      this.logger.warn('Translation service health check failed:', error);
      return false;
    }
  }
}