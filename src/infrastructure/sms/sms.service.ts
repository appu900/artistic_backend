import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendSmsOptions {
  mobile: string;
  message: string;
  test?: boolean;
}

export interface SmsApiResponse {
  result: string;
  'msg-id'?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiUrl = 'https://www.kwtsms.com/API/send/';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Sends SMS using KWT SMS API
   * @param options SMS sending options
   * @returns Promise<SmsApiResponse>
   */
  async sendSms(options: SendSmsOptions): Promise<SmsApiResponse> {
    const username = this.configService.get<string>('KWT_USERNAME');
    const password = this.configService.get<string>('KWT_PASSWORD');
    const sender = this.configService.get<string>('KWT_SENDER', 'ARTISTIC');
    const testMode = this.configService.get<string>('TEST_MODE') === '1';

    if (!username || !password) {
      throw new Error('Missing KWT SMS credentials in environment variables');
    }

    if (!options.mobile) {
      throw new Error('Mobile number is required');
    }

    if (!options.message) {
      throw new Error('Message content is required');
    }

    // Validate if the phone number is supported for SMS
    if (!this.isPhoneNumberSupported(options.mobile)) {
      this.logger.warn(`SMS not supported for phone number: ${options.mobile}`);
      throw new Error(`SMS service not available for this phone number region`);
    }

    const formattedMobile = this.formatMobileNumber(options.mobile);

    const payload = {
      username,
      password,
      sender,
      mobile: formattedMobile,
      lang: '1', 
      test: (options.test !== undefined ? options.test : testMode) ? '1' : '0',
      message: options.message,
    };

    try {
      this.logger.log(`Sending SMS to ${formattedMobile} (test: ${payload.test})`);
      
      const response = await axios.post(this.apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
        httpsAgent: new (require('https').Agent)({ keepAlive: true }),
      });

      this.logger.log(`SMS API Response - Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);

      if (response.data?.result === 'OK') {
        this.logger.log(`SMS sent successfully to ${formattedMobile}, Message ID: ${response.data['msg-id'] || 'N/A'}`);
      } else {
        this.logger.warn(`SMS send failed: ${JSON.stringify(response.data)}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`SMS send error for ${formattedMobile}:`, error.message);
      
      if (error.response) {
        this.logger.error(`API Error - Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}`);
        return {
          result: 'ERROR',
          error: error.response.data?.error || `HTTP ${error.response.status}`,
        };
      }

      throw new Error(`SMS service unavailable: ${error.message}`);
    }
  }

  /**
   * Sends OTP SMS to user
   * @param mobile Mobile number
   * @param otp OTP code
   * @param firstName User's first name
   * @returns Promise<SmsApiResponse>
   */
  async sendOtpSms(mobile: string, otp: string, firstName?: string): Promise<SmsApiResponse> {
    const platformName = this.configService.get<string>('PLATFORM_NAME', 'Artistic');
    const greeting = firstName ? `Hello ${firstName}` : 'Hello';
    
    const message = `${greeting}, your ${platformName} verification code is: ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`;

    return this.sendSms({
      mobile,
      message,
    });
  }

  /**
   * Formats mobile number for international SMS delivery
   * @param mobile Original mobile number with country code
   * @returns Formatted mobile number for SMS API
   */
  private formatMobileNumber(mobile: string): string {
    // If already starts with +, remove it for API compatibility
    if (mobile.startsWith('+')) {
      return mobile.substring(1);
    }

    // If starts with digits, assume it's already formatted correctly
    if (/^\d+$/.test(mobile)) {
      return mobile;
    }

    // Clean and return numbers only
    return mobile.replace(/\D/g, '');
  }

  /**
   * Validates if phone number format is supported for SMS
   * @param mobile Phone number to validate
   * @returns boolean indicating if SMS can be sent
   */
  private isPhoneNumberSupported(mobile: string): boolean {
    const formattedMobile = this.formatMobileNumber(mobile);
    
    // Define supported country codes for SMS
    const supportedCountryCodes = [
      '965', // Kuwait
      '1',   // US/Canada  
      '44',  // UK
      '971', // UAE
      '966', // Saudi Arabia
      '974', // Qatar
      '973', // Bahrain
      '968', // Oman
      '91',  // India
    ];

    return supportedCountryCodes.some(code => formattedMobile.startsWith(code));
  }

  /**
   * Generates a 6-digit OTP
   * @returns string OTP code
   */
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Checks if OTP is expired
   * @param otpExpiry Expiry timestamp
   * @returns boolean
   */
  isOtpExpired(otpExpiry: Date): boolean {
    return new Date() > otpExpiry;
  }

  /**
   * Gets OTP expiry time (10 minutes from now)
   * @returns Date
   */
  getOtpExpiry(): Date {
    return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  }
}
