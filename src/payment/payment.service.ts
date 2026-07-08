import { HttpException, HttpStatus, Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { BookingStatusQueue } from 'src/infrastructure/redis/queue/payment-status-queue';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { PaymentlogsController } from 'src/modules/paymentlogs/paymentlogs.controller';
import { PaymentlogsService } from 'src/modules/paymentlogs/paymentlogs.service';
import { getSessionId } from 'src/utils/extractSessionId';
import { EquipmentPackageBookingService } from 'src/modules/equipment-package-booking/equipment-package-booking.service';
import { BookingStatus } from 'src/modules/booking/dto/booking.dto';
import { EmailService } from 'src/infrastructure/email/email.service';
import { BookingConfirmationMailerService } from 'src/infrastructure/booking-confirmation/booking-confirmation-mailer.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArtistBooking, ArtistBookingDocument } from 'src/infrastructure/database/schemas/artist-booking.schema';
import { EquipmentBooking, EquipmentBookingDocument } from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { CombineBooking, CombineBookingDocument } from 'src/infrastructure/database/schemas/Booking.schema';
import { Event, EventDocument } from 'src/infrastructure/database/schemas/event.schema';
import { Seat, SeatDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { Table, TableDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { Booth, BoothDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';
import { SeatBooking, SeatBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import { User, UserDocument } from 'src/infrastructure/database/schemas/user.schema';
import {
  PaymentGatewaySrc,
  CARD_TOKEN_CAPABLE_SRCS,
  sanitizeGatewaySrc,
  derivePaymentMethodLabel,
  getPaymentMethodLabel,
} from './payment-gateway.enum';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl = 'https://uapi.upayments.com/api/v1';
  private readonly returnUrl = process.env.UPAYMENTS_RETURN_URL;
  private readonly notificationUrl = process.env.UPAYMENTS_NOTIFICATION_URL;
  private readonly token = process.env.UPAYMENTS_API_KEY;

  // Circuit breaker state
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailureTime = 0;
  private readonly circuitBreakerFailureThreshold = 5;
  private readonly circuitBreakerTimeoutMs = 60000; // 1 minute

  constructor(
    private redisService: RedisService,
    private paymentLogService: PaymentlogsService,
    private readonly bookingQueue: BookingStatusQueue,
    // Inject BookingService for post-success side effects (circular dep)
    @Inject(forwardRef(() => BookingService))
    private readonly bookingService: BookingService,
    private readonly equipmentPackageBookingService: EquipmentPackageBookingService,
    private readonly emailService: EmailService,
    private readonly bookingConfirmationMailerService: BookingConfirmationMailerService,
    @InjectModel(Event.name)
    private readonly eventModel: Model<EventDocument>,
    @InjectModel(Seat.name)
    private readonly seatModel: Model<SeatDocument>,
    @InjectModel(Table.name)
    private readonly tableModel: Model<TableDocument>,
    @InjectModel(Booth.name)
    private readonly boothModel: Model<BoothDocument>,
    @InjectModel(ArtistBooking.name)
    private readonly artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(EquipmentBooking.name)
    private readonly equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(CombineBooking.name)
    private readonly combineBookingModel: Model<CombineBookingDocument>,
    @InjectModel(SeatBooking.name)
    private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(TableBooking.name)
    private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(BoothBooking.name)
    private readonly boothBookingModel: Model<BoothBookingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Simple circuit breaker to prevent overwhelming the payment gateway
   */
  private checkCircuitBreaker(): void {
    const now = Date.now();
    
    if (this.circuitBreakerState === 'OPEN') {
      if (now - this.circuitBreakerLastFailureTime < this.circuitBreakerTimeoutMs) {
        throw new HttpException(
          'Payment gateway is temporarily unavailable due to repeated failures. Please try again later.',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      } else {
        // Transition to half-open to allow one test request
        this.circuitBreakerState = 'HALF_OPEN';
        this.logger.log('Circuit breaker transitioning to HALF_OPEN state');
      }
    }
  }

  private recordCircuitBreakerSuccess(): void {
    if (this.circuitBreakerState === 'HALF_OPEN') {
      this.circuitBreakerState = 'CLOSED';
      this.circuitBreakerFailureCount = 0;
      this.logger.log('Circuit breaker reset to CLOSED state');
    }
  }

  private recordCircuitBreakerFailure(): void {
    this.circuitBreakerFailureCount++;
    this.circuitBreakerLastFailureTime = Date.now();
    
    if (this.circuitBreakerFailureCount >= this.circuitBreakerFailureThreshold) {
      this.circuitBreakerState = 'OPEN';
      this.logger.error(`Circuit breaker opened due to ${this.circuitBreakerFailureCount} consecutive failures`);
    }
  }

  private genComboId(): string {
    return `combo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }


  private async ensureCustomerUniqueToken(userId: string): Promise<string | null> {
    if (!userId) return null;
    try {
      const user = await this.userModel.findById(userId);
      if (!user) return null;
      if (user.paymentCustomerToken) return user.paymentCustomerToken;

    
      const idDigits = String(user._id)
        .replace(/[^0-9]/g, '')
        .slice(-6)
        .padStart(6, '1');
      const entropy = String(Date.now()).slice(-9);
      let candidateToken = `${idDigits}${entropy}`.slice(0, 18);
      if (candidateToken.length < 8) {
        candidateToken = candidateToken.padEnd(8, '0');
      }

      try {
        await axios.post(
          `${this.baseUrl}/create-customer-unique-token`,
          { customerUniqueToken: candidateToken },
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 10000,
            validateStatus: (status) => status < 500,
          },
        );
      } catch (gatewayError) {
        this.logger.warn(
          `create-customer-unique-token failed for user ${userId}: ${gatewayError.message}`,
        );
        return null;
      }

      user.paymentCustomerToken = candidateToken;
      await user.save();
      return candidateToken;
    } catch (error) {
      this.logger.warn(
        `ensureCustomerUniqueToken failed for user ${userId}: ${error.message}`,
      );
      return null;
    }
  }


  async getSavedCards(userId: string): Promise<Array<{ brand: string; last4: string; token: string }>> {
    try {
      const user = await this.userModel.findById(userId);
      const customerUniqueToken = user?.paymentCustomerToken;
      if (!customerUniqueToken) return [];

      const { data } = await axios.post(
        `${this.baseUrl}/retrieve-customer-cards`,
        { customerUniqueToken },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 10000,
          validateStatus: (status) => status < 500,
        },
      );

      const cards = data?.data?.customerCards;
      if (!Array.isArray(cards)) return [];
      return cards.map((c: any) => ({
        brand: c.brand || c.scheme || 'CARD',
        last4: String(c.number || '').slice(-4),
        token: c.token,
      }));
    } catch (error) {
      this.logger.warn(`getSavedCards failed for user ${userId}: ${error.message}`);
      return [];
    }
  }

  async createAddCardLink(userId: string, returnUrl: string): Promise<string> {
    const customerUniqueToken = await this.ensureCustomerUniqueToken(userId);
    if (!customerUniqueToken) {
      throw new HttpException(
        'Unable to initialize saved-card wallet. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/add-card`,
        { customerUniqueToken, returnUrl },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
          validateStatus: (status) => status < 500,
        },
      );
      if (!data?.status || !data?.data?.link) {
        throw new HttpException(
          data?.message || 'Failed to generate add-card link',
          HttpStatus.BAD_REQUEST,
        );
      }
      return data.data.link;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`createAddCardLink failed: ${error.message}`);
      throw new HttpException(
        'Unable to generate add-card link. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 2,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        this.logger.warn(`Payment gateway request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  private async trackPaymentGatewayHealth(operation: 'initiate' | 'verify', success: boolean, error?: any) {
    const key = `payment_gateway_health:${operation}`;
    const timestamp = Date.now();
    
    try {
      const redisClient = this.redisService.getClient();
      
      await redisClient.lpush(key, JSON.stringify({
        timestamp,
        success,
        error: error ? {
          message: error.message,
          status: error.response?.status,
          code: error.code
        } : null
      }));
      
      await redisClient.ltrim(key, 0, 99);
      
      if (!success) {
        const recentEntries = await redisClient.lrange(key, 0, 19); 
        const failures = recentEntries.filter(entry => {
          try {
            return !JSON.parse(entry).success;
          } catch {
            return false;
          }
        });
        
        if (recentEntries.length >= 10 && failures.length / recentEntries.length > 0.5) {
          this.logger.error(`⚠️ Payment gateway ${operation} failure rate is high: ${failures.length}/${recentEntries.length} failures in recent operations`);
        }
      }
    } catch (redisError) {
      this.logger.warn('Failed to track payment gateway health:', redisError.message);
    }
  }

  async getPaymentGatewayHealth(): Promise<{
    circuitBreakerState: string;
    failureCount: number;
    lastFailureTime: number;
    healthStats: {
      initiate: { successRate: number; recentOperations: number };
      verify: { successRate: number; recentOperations: number };
    };
  }> {
    const healthStats = { initiate: { successRate: 0, recentOperations: 0 }, verify: { successRate: 0, recentOperations: 0 } };
    
    try {
      const redisClient = this.redisService.getClient();
      
      for (const operation of ['initiate', 'verify'] as const) {
        const key = `payment_gateway_health:${operation}`;
        const recentEntries = await redisClient.lrange(key, 0, 19); // Last 20 operations
        
        if (recentEntries.length > 0) {
          const successes = recentEntries.filter(entry => {
            try {
              return JSON.parse(entry).success;
            } catch {
              return false;
            }
          });
          
          healthStats[operation] = {
            successRate: successes.length / recentEntries.length,
            recentOperations: recentEntries.length
          };
        }
      }
    } catch (error) {
      this.logger.warn('Failed to retrieve payment gateway health stats:', error.message);
    }
    
    return {
      circuitBreakerState: this.circuitBreakerState,
      failureCount: this.circuitBreakerFailureCount,
      lastFailureTime: this.circuitBreakerLastFailureTime,
      healthStats
    };
  }

  async initiateBatchPayment({
    items,
    userId,
    customerEmail,
    customerMobile,
    paymentMethod,
  }: {
    items: Array<{
      bookingId: string;
      type: BookingType;
      amount: number;
      description?: string;
    }>;
    userId: string;
    customerEmail: string;
    customerMobile?: string;
    paymentMethod?: string;
  }) {
    const total = items.reduce(
      (sum, it) => sum + (typeof it.amount === 'number' ? it.amount : 0),
      0,
    );
    if (total <= 0) {
      throw new HttpException(
        'Total amount must be > 0',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }
    const sanitizedMobile = customerMobile && /^\+[1-9]\d{1,14}$/.test(customerMobile)
      ? customerMobile
      : undefined;

    const comboId = this.genComboId();
    const redisKey = `payment_lock:${BookingType.COMBO}:${comboId}`;
    if (await this.redisService.exists(redisKey)) {
      throw new HttpException(
        'Payment already processing',
        HttpStatus.CONFLICT,
      );
    }
    await this.redisService.set(redisKey, 'locked', 300);

    try {
      const returnBase = (this.returnUrl || '')
        .replace(/\/$/, '')
        .replace(/\/payment(?:\/.*)?$/i, '')
        .replace(/\/$/, '');

      const requestedSrc = paymentMethod ? sanitizeGatewaySrc(paymentMethod) : undefined;
      const gatewaySrc: string | string[] = requestedSrc
        ? requestedSrc
        : ['cc', 'knet', 'apple-pay', 'google-pay'];

      const tokens: Record<string, string> = {};
      if (!requestedSrc || CARD_TOKEN_CAPABLE_SRCS.includes(requestedSrc)) {
        const customerUniqueToken = await this.ensureCustomerUniqueToken(userId);
        if (customerUniqueToken) tokens.customerUniqueToken = customerUniqueToken;
      }

      const payload = {
        products: items.map((it) => ({
          name: `${it.type} booking`,
          description: it.description || 'Payment for booking',
          price: parseFloat(it.amount.toFixed(2)),
          quantity: 1,
        })),
        order: {
          id: comboId,
          reference: comboId,
          description: 'Combined booking payment',
          currency: 'KWD',
          amount: parseFloat(total.toFixed(2)),
        },
        paymentGateway: { src: gatewaySrc },
        tokens,
        reference: { id: comboId },
        customer: {
          uniqueId: userId,
          name: 'Customer',
          email: customerEmail,
          ...(sanitizedMobile ? { mobile: sanitizedMobile } : {}),
        },
        language: 'en',
        returnUrl: `${returnBase}/payment/verify`,
        cancelUrl: `${returnBase}/payment/verify?cancelled=1&`,
        notificationUrl: this.notificationUrl || `${returnBase}/payment/webhook`,
      };

      this.logger.log(
        'Upayments batch payload:',
        JSON.stringify(payload, null, 2),
      );

      const { data } = await axios.post(`${this.baseUrl}/charge`, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!data?.status || !data?.data?.link) {
        throw new HttpException(
          data?.message || 'Failed to initiate',
          HttpStatus.BAD_REQUEST,
        );
      }

      const paymentLink = data.data.link;
      const sessionId = getSessionId(paymentLink) ?? '';
      const trackId = data.data.trackId;

      const log = await this.paymentLogService.createLog(
        userId,
        comboId,
        BookingType.COMBO,
        total,
        'KWD',
        UpdatePaymentStatus.PENDING,
        sessionId,
        trackId,
        requestedSrc || 'multiple',
      );

      await this.redisService.set(`combo_map:${comboId}`, items, 24 * 60 * 60);

      this.logger.log(
        `Initiated combo: comboId=${comboId}, userId=${userId}, trackId=${trackId}`,
      );
      return { paymentLink, log, comboId };
    } catch (error) {
      await this.redisService.del(redisKey);
      this.logger.error(
        'Batch initiate failed:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message || 'Initiate batch error',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resolveBookingType(
    bookingId: string,
    fallback?: string,
  ): Promise<BookingType> {
    if (fallback) return fallback as BookingType;
    const log =
      await this.paymentLogService.findPaymentLogByBookingId(bookingId);
    if (log?.bookingType) return log.bookingType as BookingType;
    throw new HttpException(
      'Booking type missing for verification',
      HttpStatus.BAD_REQUEST,
    );
  }



  async initiatePayment({
    bookingId,
    userId,
    amount,
    type,
    customerEmail,
    description,
    customerMobile,
    paymentMethod,
  }: {
    bookingId: string;
    userId: string;
    amount: number;
    type: BookingType;
    customerEmail: string;
    description?: string;
    customerMobile?: string;
    paymentMethod?: string;
  }) {
    if (!userId) {
      throw new HttpException('User required for payment initiation', HttpStatus.BAD_REQUEST);
    }
    if (amount <= 0)
      throw new HttpException('Amount must be > 0', HttpStatus.BAD_REQUEST);
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }
    const sanitizedMobile = customerMobile && /^\+[1-9]\d{1,14}$/.test(customerMobile)
      ? customerMobile
      : undefined;

    const redisKey = `payment_lock:${type}:${bookingId}`;
    if (await this.redisService.exists(redisKey)) {
      throw new HttpException(
        'Payment already processing',
        HttpStatus.CONFLICT,
      );
    }

    await this.redisService.set(redisKey, 'locked', 300);
    try {
      this.checkCircuitBreaker();
      
      const returnBase = (this.returnUrl || '')
        .replace(/\/$/, '')
        .replace(/\/payment(?:\/.*)?$/i, '')
        .replace(/\/$/, '');

      const gatewaySrc = sanitizeGatewaySrc(paymentMethod);
      const tokens: Record<string, string> = {};
      if (CARD_TOKEN_CAPABLE_SRCS.includes(gatewaySrc)) {
        const customerUniqueToken = await this.ensureCustomerUniqueToken(userId);
        if (customerUniqueToken) tokens.customerUniqueToken = customerUniqueToken;
      }

      const payload = {
        products: [
          {
            name: `${type} booking`,
            description: description || 'Payment for booking',
            price: parseFloat(amount.toFixed(2)),
            quantity: 1,
          },
        ],
        order: {
          id: bookingId,
          reference: bookingId,
          description: description || `${type} booking payment`,
          currency: 'KWD',
          amount: parseFloat(amount.toFixed(2)),
        },
        paymentGateway: { src: gatewaySrc },
        tokens,
        reference: { id: bookingId },
        customer: {
          uniqueId: userId,
          name: 'Customer',
          email: customerEmail,
          ...(sanitizedMobile ? { mobile: sanitizedMobile } : {}),
        },
        language: 'en',
        returnUrl: `${returnBase}/payment/verify`,
        cancelUrl: `${returnBase}/payment/verify?cancelled=1`,
        notificationUrl: this.notificationUrl || `${returnBase}/payment/webhook`,
      };

      this.logger.log('Upayments payload:', JSON.stringify(payload, null, 2));

      const { data } = await this.retryRequest(async () => {
        return await axios.post(`${this.baseUrl}/charge`, payload, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000, 
          validateStatus: (status) => status < 500, 
        });
      });

      if (!data?.status || !data?.data?.link) {
        throw new HttpException(
          data?.message || 'Failed to initiate',
          HttpStatus.BAD_REQUEST,
        );
      }

      const paymentLink = data.data.link;
      const sessionId = getSessionId(paymentLink) ?? '';
      const trackId = data.data.trackId;

      const log = await this.paymentLogService.createLog(
        userId,
        bookingId,
        type,
        amount,
        'KWD',
        UpdatePaymentStatus.PENDING,
        sessionId,
        trackId,
        gatewaySrc,
      );
      console.log('paynmnent logs for recent transaction', log);
      this.logger.log(
        `Initiated: bookingId=${bookingId}, userId=${userId}, trackId=${trackId}`,
      );

      await this.trackPaymentGatewayHealth('initiate', true);
      
      this.recordCircuitBreakerSuccess();

      return { paymentLink, log };
    } catch (error) {
      await this.trackPaymentGatewayHealth('initiate', false, error);
      
      this.recordCircuitBreakerFailure();
      
      await this.redisService.del(redisKey);
      await this.paymentLogService.createLog(
        userId,
        bookingId,
        type,
        amount,
        'KWD',
        UpdatePaymentStatus.CANCEL,
        '',
        '',
        paymentMethod,
      );

      let errorMessage = 'Payment gateway is temporarily unavailable. Please try again later.';
      let errorStatus = HttpStatus.SERVICE_UNAVAILABLE;

      if (error.response) {
        const responseData = error.response.data;
        
        if (typeof responseData === 'string' && responseData.includes('<!DOCTYPE html>')) {
          if (responseData.includes('Internal server error')) {
            errorMessage = 'Payment gateway is experiencing technical difficulties. Please try again in a few minutes.';
            errorStatus = HttpStatus.BAD_GATEWAY;
          } else if (responseData.includes('503') || responseData.includes('Service Unavailable')) {
            errorMessage = 'Payment gateway is temporarily under maintenance. Please try again later.';
            errorStatus = HttpStatus.SERVICE_UNAVAILABLE;
          }
          this.logger.error(`Payment gateway returned HTML error page. Status: ${error.response.status}`);
        } else if (typeof responseData === 'object' && responseData.message) {
          errorMessage = responseData.message;
          errorStatus = error.response.status || HttpStatus.BAD_REQUEST;
        } else {
          errorStatus = error.response.status || HttpStatus.INTERNAL_SERVER_ERROR;
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Unable to connect to payment gateway. Please check your internet connection and try again.';
        errorStatus = HttpStatus.BAD_GATEWAY;
        this.logger.error(`Network error connecting to payment gateway: ${error.code}`);
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Payment gateway request timed out. Please try again.';
        errorStatus = HttpStatus.REQUEST_TIMEOUT;
        this.logger.error('Payment gateway request timed out');
      }

      this.logger.error(
        'Payment initiation failed:',
        {
          message: error.message,
          status: error.response?.status,
          code: error.code,
          responseType: typeof error.response?.data,
          bookingId,
          userId,
          type
        }
      );

      throw new HttpException(errorMessage, errorStatus);
    }
  }

  /**
   * Best-effort lookup of the payment method the customer selected at
   * checkout, for use on failure/cancellation pages where no gateway
   * transaction result is available yet.
   */
  async getRequestedPaymentMethodLabel(bookingId: string): Promise<string | null> {
    try {
      const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (!log?.paymentMethod) return null;
      return getPaymentMethodLabel(log.paymentMethod);
    } catch {
      return null;
    }
  }

  /**
   * Return a normalized payment receipt for display on success/failure pages.
   */
  async getPaymentReceipt(bookingId: string) {
    const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
    if (!log) return null;

    return {
      bookingId: log.bookingId,
      bookingType: log.bookingType,
      amount: log.amount,
      currency: log.currency,
      status: log.status,
      trackId: log.trackId,
      sessionId: log.sessionId,
      paymentMethod:
        log.resultPaymentMethodLabel || getPaymentMethodLabel(log.paymentMethod),
      requestedPaymentMethod: getPaymentMethodLabel(log.paymentMethod),
      paymentType: log.resultPaymentType,
      paidAt: (log as any).updatedAt || log.date,
      createdAt: log.date,
    };
  }

  async verifyPayment(
    id: string,
    bookingId: string,
    type: string,
    useSessionId = false,
    trackId: string,
  ) {
    this.logger.log(
      `Verify: bookingId=${bookingId}, id=${id}, type=${type}, trackId=${trackId}`,
    );
    if (!trackId) {
      throw new HttpException(
        'trackId is required for verification',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.log(
      `Verify: bookingId=${bookingId}, type=${type}, trackId=${trackId} (sessionId ignored)`,
    );

    const existingLog =
      await this.paymentLogService.findPaymentLogByBookingId(bookingId);
    if (existingLog && existingLog.status === UpdatePaymentStatus.CONFIRMED) {
      this.logger.log(
        `Payment already confirmed for booking ${bookingId}; skipping re-processing.`,
      );
      return {
        success: true,
        orderId: undefined,
        merchantRequestedOrderId: bookingId,
        status: true,
        result: 'CAPTURED',
        amount: existingLog.amount,
        currency: existingLog.currency,
        trackId: existingLog.trackId || trackId,
        paymentType: existingLog.resultPaymentType,
        paymentMethod: existingLog.resultPaymentMethodLabel,
        alreadyProcessed: true,
      };
    }

    let data: any = null;
    let lastError: any = null;
    try {
      this.checkCircuitBreaker();

      const fetchStatus = async () => {
        const response = await this.retryRequest(async () => {
          return await axios.get(
            `${this.baseUrl}/get-payment-status/${trackId}`,
            {
              headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/json',
              },
              timeout: 15000,
              validateStatus: (status) => status < 500,
            },
          );
        }, 1);
        return response.data;
      };

      data = await fetchStatus();
      if (!data.status) {
        throw new HttpException(
          data.error_message || 'Upayments verification failed',
          HttpStatus.BAD_REQUEST,
        );
      }

      let transaction = data.data?.transaction;
      if (!transaction) {
        throw new HttpException(
          'No transaction data in response',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 3D-Secure/OTP card flows redirect the browser back to us as soon as the
      // OTP is submitted, but the issuing bank's final authorization can take a
      // few more seconds to reach UPayments. Querying get-payment-status at that
      // exact moment can return a stale/interim non-CAPTURED result (observed as
      // "FAILED") even though UPayments' own dashboard still shows the payment as
      // "Pending" (i.e. genuinely undecided, not actually declined). To avoid
      // prematurely cancelling a booking whose payment is still settling, poll a
      // few more times with a short delay before treating it as a final failure.
      if (transaction.result !== 'CAPTURED') {
        // Total wait budget ~10s across 3 attempts, giving the issuing bank/UPayments
        // a brief window to finish settling a 3D-Secure/OTP authorization before we
        // conclude the payment genuinely failed. (Longer waits were tested and did
        // not change the outcome for genuinely declined transactions — UPayments
        // returns the same terminal result immediately, so there's no benefit to
        // making the user wait longer than this.)
        const pollDelaysMs = [2000, 3000, 5000];
        for (const delay of pollDelaysMs) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          try {
            const retryData = await fetchStatus();
            const retryTransaction = retryData?.data?.transaction;
            if (retryTransaction) {
              data = retryData;
              transaction = retryTransaction;
              if (transaction.result === 'CAPTURED') {
                this.logger.log(
                  `Transaction settled to CAPTURED on retry for trackId=${trackId}, bookingId=${bookingId} (previous result was non-final)`,
                );
                break;
              }
            }
          } catch {
            // Ignore transient errors during the settlement-poll and keep the last known result.
          }
        }
      }

      if (transaction.result !== 'CAPTURED') {
        this.logger.warn(
          `Transaction still not CAPTURED after settlement-poll for trackId=${trackId}, bookingId=${bookingId}: result=${transaction.result}. Cancelling.`,
        );
        await this.paymentLogService.updateStatus(
          bookingId,
          UpdatePaymentStatus.CANCEL,
          trackId,
        );
        const cancelUserId = await this.resolveUserIdForBooking(bookingId);
        await this.handlePayemntStatusUpdate(
          bookingId,
          UpdatePaymentStatus.CANCEL,
          type as BookingType,
          cancelUserId,
        );
        throw new HttpException(
          `Payment not captured: ${transaction.result} (${data.status})`,
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.log(
        `Verified CAPTURED payment: trackId=${transaction.track_id}, payment_id=${transaction.payment_id}, tran_id=${transaction.tran_id}, auth=${transaction.auth}, total_price=${transaction.total_price} ${transaction.currency_type}, is_paid_from_cc=${transaction.is_paid_from_cc}`,
      );

      const paymentMethodLabel = derivePaymentMethodLabel(transaction);
      transaction.paymentMethodLabel = paymentMethodLabel;
      await this.paymentLogService.updateTransactionResult(
        bookingId,
        transaction.payment_type,
        paymentMethodLabel,
      );

      const log =
        await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (!log) {
        throw new HttpException(
          'Payment log not found for booking',
          HttpStatus.NOT_FOUND,
        );
      }
      const userId =
        typeof (log as any).user === 'string'
          ? (log as any).user
          : String((log as any).user?._id ?? (log as any).user ?? '');
      await this.paymentLogService.updateStatus(
        bookingId,
        UpdatePaymentStatus.CONFIRMED,
        trackId,
      );

      if ((type as BookingType) === BookingType.COMBO) {
        const items = await this.redisService.get<
          Array<{ bookingId: string; type: BookingType }>
        >(`combo_map:${bookingId}`);
        if (items && Array.isArray(items)) {
          for (const it of items) {
            if (it.type === BookingType.EQUIPMENT_PACKAGE) {
              await this.equipmentPackageBookingService.updateBookingStatus(
                it.bookingId,
                String(userId),
                { status: 'confirmed' },
              );
            } else if (it.type === BookingType.EQUIPMENT || it.type === BookingType.CUSTOM_EQUIPMENT_PACKAGE) {
              await this.bookingService.updateEquipmentBookingStatus(
                it.bookingId,
                BookingStatus.CONFIRMED,
                UpdatePaymentStatus.CONFIRMED,
              );
            } else if (it.type === BookingType.TICKET || it.type === BookingType.TABLE || it.type === BookingType.BOOTH) {
              await this.handlePayemntStatusUpdate(
                it.bookingId,
                UpdatePaymentStatus.CONFIRMED,
                it.type,
                String(userId),
              );
            } else {
              await this.handlePaymentStatusUpdate(
                it.bookingId,
                UpdatePaymentStatus.CONFIRMED,
                it.type,
                String(userId),
              );
            }
            const isEventPayment = it.bookingId.startsWith('event-');
            if (
              !isEventPayment &&
              it.type !== BookingType.TICKET &&
              it.type !== BookingType.TABLE &&
              it.type !== BookingType.BOOTH
            ) {
              await this.bookingService.handlePostPaymentSuccess(
                it.bookingId,
                it.type,
              );
              await this.sendBookingConfirmationEmails(it.bookingId, it.type, String(userId), transaction);
            }
          }
          await this.redisService.del(`combo_map:${bookingId}`);
        } else {
          this.logger.log(`Processing single combined booking: ${bookingId}`);
          await this.handlePaymentStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            BookingType.COMBO,
            String(userId),
          );
          
          const isEventPayment = bookingId.startsWith('event-');
          if (!isEventPayment) {
       
            await this.bookingService.handlePostPaymentSuccess(
              bookingId,
              BookingType.COMBO,
            );
            await this.sendBookingConfirmationEmails(bookingId, BookingType.COMBO, String(userId), transaction);
          }
        }
      } else {
        if ((type as BookingType) === BookingType.EQUIPMENT_PACKAGE) {
          await this.equipmentPackageBookingService.updateBookingStatus(
            bookingId,
            String(userId),
            { status: 'confirmed' },
          );
        } else if ((type as BookingType) === BookingType.EQUIPMENT || (type as BookingType) === BookingType.CUSTOM_EQUIPMENT_PACKAGE) {
          await this.bookingService.updateEquipmentBookingStatus(
            bookingId,
            BookingStatus.CONFIRMED,
            UpdatePaymentStatus.CONFIRMED,
          );
        } else if (
          (type as BookingType) === BookingType.TICKET ||
          (type as BookingType) === BookingType.TABLE ||
          (type as BookingType) === BookingType.BOOTH
        ) {
          await this.handlePayemntStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            type as BookingType,
            String(userId),
          );
        } else {
          await this.handlePaymentStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            type as BookingType,
            userId,
          );
        }
  
        const isEventPayment = bookingId.startsWith('event-');
        
        if (
          !isEventPayment &&
          (type as BookingType) !== BookingType.TICKET &&
          (type as BookingType) !== BookingType.TABLE &&
          (type as BookingType) !== BookingType.BOOTH
        ) {
          await this.bookingService.handlePostPaymentSuccess(
            bookingId,
            type as BookingType,
          );
          await this.sendBookingConfirmationEmails(bookingId, type as BookingType, String(userId), transaction);
        }
      }
      await this.trackPaymentGatewayHealth('verify', true);
      
      this.recordCircuitBreakerSuccess();

      return {
        success: true,
        orderId: transaction.order_id,
        merchantRequestedOrderId:
          transaction.merchant_requested_order_id || transaction.reference, 
        status: data.status,
        result: transaction.result,
        amount: parseFloat(transaction.total_price),
        currency: transaction.currency_type,
        trackId: transaction.track_id,
        paymentType: transaction.payment_type,
        paymentMethod: transaction.paymentMethodLabel || derivePaymentMethodLabel(transaction),
        paymentId: transaction.payment_id,
        invoiceId: transaction.invoice_id,
        tranId: transaction.tran_id,
        auth: transaction.auth,
        postDate: transaction.post_date,
        transactionDate: transaction.transaction_date,
        customer: transaction.customer,
        redirectUrl: transaction.redirect_url,
      };
    } catch (error) {
      await this.trackPaymentGatewayHealth('verify', false, error);
      
      if (!error.response || error.response.status >= 500) {
        this.recordCircuitBreakerFailure();
      }
      
      let errorMessage = 'Payment verification failed. Please contact support if the issue persists.';
      let errorStatus = HttpStatus.INTERNAL_SERVER_ERROR;

      if (error.response) {
        const responseData = error.response.data;
        
        if (error.response.status === 404) {
          errorMessage = 'Payment not found. Please check the payment details and try again.';
          errorStatus = HttpStatus.NOT_FOUND;
        } else if (error.response.status === 401) {
          errorMessage = 'Payment verification unauthorized. Please contact support.';
          errorStatus = HttpStatus.UNAUTHORIZED;
        } else if (error.response.status >= 500) {
          if (typeof responseData === 'string' && responseData.includes('<!DOCTYPE html>')) {
            if (responseData.includes('Internal server error')) {
              errorMessage = 'Payment gateway is experiencing technical difficulties. Please try verifying again in a few minutes.';
              errorStatus = HttpStatus.BAD_GATEWAY;
            } else if (responseData.includes('503') || responseData.includes('Service Unavailable')) {
              errorMessage = 'Payment gateway is temporarily under maintenance. Please try again later.';
              errorStatus = HttpStatus.SERVICE_UNAVAILABLE;
            }
          } else {
            errorMessage = 'Payment gateway is temporarily unavailable. Please try again later.';
            errorStatus = HttpStatus.SERVICE_UNAVAILABLE;
          }
        } else if (typeof responseData === 'object' && responseData.error_message) {
          errorMessage = responseData.error_message;
          errorStatus = error.response.status;
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Unable to connect to payment gateway for verification. Please check your internet connection and try again.';
        errorStatus = HttpStatus.BAD_GATEWAY;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Payment verification request timed out. Please try again.';
        errorStatus = HttpStatus.REQUEST_TIMEOUT;
      }

      this.logger.error('Payment verification failed:', {
        trackId,
        bookingId,
        message: error.message,
        status: error.response?.status,
        code: error.code,
        responseType: typeof error.response?.data,
      });

      throw new HttpException(errorMessage, errorStatus);
    }
  }

  async handleWebhookNotification(
    rawBody: Record<string, any>,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const transactionData =
        rawBody?.data?.transactionData || rawBody?.transactionData || rawBody?.data?.transaction || rawBody;
      const payMitResult = rawBody?.data?.payMit?.result || rawBody?.payMit?.result;

      const trackId: string | undefined =
        transactionData?.track_id || rawBody?.track_id || rawBody?.trackId;
      const bookingId: string | undefined =
        transactionData?.merchant_requested_order_id ||
        transactionData?.reference ||
        rawBody?.bookingId;

      if (!trackId && !bookingId) {
        this.logger.warn('Webhook received without trackId/bookingId; ignoring.', JSON.stringify(rawBody));
        return { success: true, message: 'Ignored: missing identifiers' };
      }

      let resolvedBookingId = bookingId;
      if (!resolvedBookingId && trackId) {
        const logByTrack = await this.paymentLogService.findLogByTrackId(trackId);
        resolvedBookingId = logByTrack?.bookingId;
      }
      if (!resolvedBookingId) {
        this.logger.warn(`Webhook: could not resolve bookingId for trackId=${trackId}`);
        return { success: true, message: 'Ignored: booking not found' };
      }

      const resolvedType = await this.resolveBookingType(resolvedBookingId).catch(() => null);
      if (!resolvedType) {
        this.logger.warn(`Webhook: could not resolve booking type for bookingId=${resolvedBookingId}`);
        return { success: true, message: 'Ignored: booking type unknown' };
      }

      const isCaptured =
        transactionData?.result === 'CAPTURED' ||
        payMitResult === 'SUCCESS' ||
        rawBody?.data?.payMit?.order?.status === 'CAPTURED';

      if (!isCaptured) {
        this.logger.log(
          `Webhook: payment not captured for booking ${resolvedBookingId} (result=${transactionData?.result})`,
        );
        await this.paymentLogService.updateStatus(
          resolvedBookingId,
          UpdatePaymentStatus.CANCEL,
          trackId || '',
        );
        const cancelUserId = await this.resolveUserIdForBooking(resolvedBookingId);
        await this.handlePayemntStatusUpdate(
          resolvedBookingId,
          UpdatePaymentStatus.CANCEL,
          resolvedType,
          cancelUserId,
        );
        await this.releasePaymentLock(String(resolvedType), resolvedBookingId);
        return { success: true, message: 'Cancellation acknowledged' };
      }

      if (!trackId) {
        this.logger.warn(`Webhook: captured payment missing trackId for booking ${resolvedBookingId}`);
        return { success: true, message: 'Ignored: missing trackId for verification' };
      }

      await this.verifyPayment(trackId, resolvedBookingId, String(resolvedType), false, trackId);
      await this.releasePaymentLock(String(resolvedType), resolvedBookingId);
      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`, error.stack);
      return { success: false, message: 'Webhook processing failed' };
    }
  }

  async releasePaymentLock(type: string, bookingId: string) {
    await this.redisService.del(`payment_lock:${type}:${bookingId}`);
  }

  async getTrackIdForBooking(bookingId: string): Promise<string> {
    const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
    return log?.trackId || '';
  }

  async resolveUserIdForBooking(bookingId: string): Promise<string> {
    try {
      const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (log?.user) {
        return typeof (log as any).user === 'string'
          ? (log as any).user
          : String((log as any).user?._id ?? (log as any).user);
      }
    } catch {
      // fall through to booking lookup
    }

    const seat = await this.seatBookingModel.findById(bookingId).select('userId').lean();
    if (seat?.userId) return String(seat.userId);

    const table = await this.tableBookingModel.findById(bookingId).select('userId').lean();
    if (table?.userId) return String(table.userId);

    const booth = await this.boothBookingModel.findById(bookingId).select('userId').lean();
    if (booth?.userId) return String(booth.userId);

    return '';
  }

  private async isBookingAlreadyCancelled(
    bookingId: string,
    type: BookingType,
  ): Promise<boolean> {
    const terminalStatuses = ['cancelled', 'expired'];
    switch (type) {
      case BookingType.TICKET: {
        const booking = await this.seatBookingModel.findById(bookingId).select('status').lean();
        return !!booking && terminalStatuses.includes(booking.status);
      }
      case BookingType.TABLE: {
        const booking = await this.tableBookingModel.findById(bookingId).select('status').lean();
        return !!booking && terminalStatuses.includes(booking.status);
      }
      case BookingType.BOOTH: {
        const booking = await this.boothBookingModel.findById(bookingId).select('status').lean();
        return !!booking && terminalStatuses.includes(booking.status);
      }
      default: {
        const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
        return log?.status === UpdatePaymentStatus.CANCEL;
      }
    }
  }

  async handlePayemntStatusUpdate(
    bookingId: string,
    status: UpdatePaymentStatus,
    type: BookingType,
    userId: string,
  ) {
    if (status === UpdatePaymentStatus.CONFIRMED) {
      try {
        switch (type) {
          case BookingType.EQUIPMENT:
          case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CONFIRMED,
              UpdatePaymentStatus.CONFIRMED,
            );
            this.logger.log(
              `Directly confirmed equipment booking ${bookingId} (type=${type})`,
            );
            return;
          }
          case BookingType.EQUIPMENT_PACKAGE: {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(userId),
              { status: 'confirmed' },
            );
            this.logger.log(
              `Directly confirmed equipment-package booking ${bookingId}`,
            );
            return;
          }
          default:
            break;
        }
      } catch (e) {
        this.logger.warn(
          `Synchronous confirm failed for ${bookingId} (type=${type}). Falling back to queue. Reason: ${(e as any)?.message}`,
        );
      }
    }

    if (status === UpdatePaymentStatus.CANCEL) {
      if (await this.isBookingAlreadyCancelled(bookingId, type)) {
        this.logger.log(
          `Skipping duplicate CANCEL for booking ${bookingId} (type=${type}) — already cancelled`,
        );
        return;
      }

      const cancelLockKey = `cancel_processing:${bookingId}`;
      const lockAcquired = await this.redisService.setNX(cancelLockKey, '1', 120);
      if (!lockAcquired) {
        this.logger.log(
          `Skipping duplicate CANCEL for booking ${bookingId} (type=${type}) — cancel already in progress`,
        );
        return;
      }

      const effectiveUserId = userId || (await this.resolveUserIdForBooking(bookingId));

      try {
        switch (type) {
          case BookingType.EQUIPMENT:
          case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CANCELLED,
              UpdatePaymentStatus.CANCEL,
            );
            this.logger.log(
              `Directly cancelled equipment booking ${bookingId} (type=${type})`,
            );
            return;
          }
          case BookingType.EQUIPMENT_PACKAGE: {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(effectiveUserId),
              { status: 'cancelled' },
            );
            this.logger.log(
              `Directly cancelled equipment-package booking ${bookingId}`,
            );
            return;
          }
          default:
            break;
        }
      } catch (e) {
        this.logger.warn(
          `Synchronous cancel failed for ${bookingId} (type=${type}). Falling back to queue. Reason: ${(e as any)?.message}`,
        );
      }

      userId = effectiveUserId;
    }

    const queueUserId =
      status === UpdatePaymentStatus.CANCEL && !userId
        ? await this.resolveUserIdForBooking(bookingId)
        : userId;

    await this.bookingQueue.enqueueBookingUpdate(
      bookingId,
      queueUserId,
      type,
      status,
    );
    this.logger.log(
      `Enqueued: bookingId=${bookingId}, userId=${queueUserId}, type=${type}, status=${status}`,
    );
  }

  async updateLogAndBookingFromGateway({
    bookingId,
    status,
    type,
    sessionId,
    trackId,
  }: {
    bookingId: string;
    status: string;
    type?: BookingType;
    sessionId?: string;
    trackId: string;
  }) {
    let userId = '';
    if (sessionId) {
      const log = await this.paymentLogService.findLogBySessionId(sessionId);
      if (log && log.user) {
        userId =
          typeof (log as any).user === 'string'
            ? (log as any).user
            : String((log as any).user?._id ?? (log as any).user);
      }
    }
    if (!userId) {
      const log = await this.paymentLogService.findLogBySessionId(bookingId);
      userId = log?.user
        ? typeof (log as any).user === 'string'
          ? (log as any).user
          : String((log as any).user?._id ?? (log as any).user)
        : '';
    }
    await this.paymentLogService.updateStatus(bookingId, status, trackId);
  }

  /**
   * 🎭 Send booking confirmation emails after successful payment
   */
  private async sendBookingConfirmationEmails(bookingId: string, type: BookingType, userId: string, transactionData?: any) {
    try {
      this.logger.log(`Preparing to send confirmation emails for booking ${bookingId} (type: ${type})`);

      switch (type) {
        case BookingType.COMBO: {
          await this.sendComboBookingEmails(bookingId, transactionData);
          break;
        }
        case BookingType.ARTIST: {
          await this.sendArtistBookingEmails(bookingId, transactionData);
          break;
        }
        case BookingType.EQUIPMENT:
        case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
          await this.sendEquipmentBookingEmails(bookingId, transactionData, type);
          break;
        }
        case BookingType.EQUIPMENT_PACKAGE: {
          await this.sendEquipmentPackageEmails(bookingId, transactionData);
          break;
        }
        case BookingType.TICKET:
        case BookingType.TABLE:
        case BookingType.BOOTH: {
          await this.sendSeatTableBoothEmails(bookingId, type, transactionData);
          break;
        }
        default:
          this.logger.warn(`No email handler for booking type: ${type}`);
      }
      
      this.logger.log(`Email sending completed for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to send confirmation emails for booking ${bookingId}: ${error.message}`);
    }
  }

  private async sendComboBookingEmails(bookingId: string, transactionData?: any) {
    try {
      const booking = await this.combineBookingModel
        .findById(bookingId)
        .populate('bookedBy')
        .populate({
          path: 'artistBookingId',
          populate: { path: 'artistId', populate: { path: 'user' } }
        })
        .populate({
          path: 'equipmentBookingId',
          populate: { path: 'equipmentItems.equipment', populate: { path: 'provider' } }
        })
        .lean();

      if (!booking) {
        this.logger.warn(`Combo booking ${bookingId} not found for email sending`);
        return;
      }

      const customer = booking.bookedBy as any;
      const artistBooking = booking.artistBookingId as any;
      const equipmentBooking = booking.equipmentBookingId as any;

      // Send the unified booking confirmation + m-ticket email to the customer
      await this.bookingConfirmationMailerService.sendTicketConfirmation(
        bookingId,
        BookingType.COMBO,
        transactionData,
      );

      // Send artist confirmation if artist booking exists
      if (artistBooking && artistBooking.artistId) {
        const artistEmail = artistBooking.artistId.user?.email || artistBooking.artistId.email;
        if (artistEmail) {
          const artistData = {
            artistName: artistBooking.artistId.stageName || artistBooking.artistId.user?.firstName,
            bookingId: bookingId,
            eventType: artistBooking.artistId.artistType || 'Performance',
            eventDate: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            duration: this.calculateDuration(booking.startTime, booking.endTime),
            artistFee: `${artistBooking.artistPrice || 0} KWD`,
            venueAddress: booking.address,
            customerName: booking.userDetails?.name || customer?.firstName,
            customerEmail: booking.userDetails?.email || customer?.email,
            customerPhone: booking.userDetails?.phone || customer?.phoneNumber,
            eventDescription: booking.eventDescription || 'Event booking',
          };

          await this.emailService.sendArtistBookingConfirmation(artistEmail, artistData);
        }
      }

      // Send equipment provider notification if equipment booking exists
      if (equipmentBooking && equipmentBooking.equipmentItems) {
        // Group by provider and send one email per provider
        const providerMap = new Map();
        
        for (const item of equipmentBooking.equipmentItems) {
          const equipment = item.equipment as any;
          if (equipment && equipment.provider) {
            const providerId = equipment.provider._id || equipment.provider;
            if (!providerMap.has(providerId.toString())) {
              providerMap.set(providerId.toString(), {
                provider: equipment.provider,
                items: []
              });
            }
            providerMap.get(providerId.toString()).items.push(equipment);
          }
        }

        for (const [providerId, data] of providerMap as any) {
          const providerEmail = data.provider.email;
          if (providerEmail) {
            const providerData = {
              providerName: data.provider.firstName || 'Provider',
              bookingId: bookingId,
              equipmentName: data.items.map((e: any) => e.name).join(', '),
              startDate: booking.date,
              endDate: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              duration: this.calculateDuration(booking.startTime, booking.endTime),
              equipmentFee: `${equipmentBooking.equipmentPrice || 0} KWD`,
              venueAddress: booking.address,
              customerName: booking.userDetails?.name || customer?.firstName,
              customerEmail: booking.userDetails?.email || customer?.email,
              customerPhone: booking.userDetails?.phone || customer?.phoneNumber,
              eventDescription: booking.eventDescription || 'Event booking',
              equipmentItems: data.items.map((e: any) => ({ name: e.name, quantity: 1 })),
            };

            await this.emailService.sendEquipmentProviderNotification(providerEmail, providerData);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send combo booking emails: ${error.message}`);
    }
  }

  private async sendArtistBookingEmails(bookingId: string, transactionData?: any) {
    try {
      const booking = await this.artistBookingModel
        .findById(bookingId)
        .populate('bookedBy')
        .populate({ path: 'artistId', populate: { path: 'user' } })
        .lean();

      if (!booking) {
        this.logger.warn(`Artist booking ${bookingId} not found for email sending`);
        return;
      }

      const customer = booking.bookedBy as any;
      const artist = booking.artistId as any;

      // Send the unified booking confirmation + m-ticket email to the customer
      await this.bookingConfirmationMailerService.sendTicketConfirmation(
        bookingId,
        BookingType.ARTIST,
        transactionData,
      );

      // Send artist confirmation
      const artistEmail = artist?.user?.email || artist?.email;
      if (artistEmail) {
        const artistData = {
          artistName: artist.stageName || artist.user?.firstName,
          bookingId: bookingId,
          eventType: artist.artistType || 'Performance',
          eventDate: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          duration: this.calculateDuration(booking.startTime, booking.endTime),
          artistFee: `${booking.totalPrice || booking.price} KWD`,
          venueAddress: booking.address || booking.venueDetails?.address || 'TBD',
          customerName: customer?.firstName,
          customerEmail: customer?.email,
          customerPhone: customer?.phoneNumber,
          eventDescription: booking.eventDescription || 'Artist performance',
        };

        await this.emailService.sendArtistBookingConfirmation(artistEmail, artistData);
      }
    } catch (error) {
      this.logger.error(`Failed to send artist booking emails: ${error.message}`);
    }
  }

  private async sendEquipmentBookingEmails(
    bookingId: string,
    transactionData?: any,
    type: BookingType = BookingType.EQUIPMENT,
  ) {
    try {
      const booking = await this.equipmentBookingModel
        .findById(bookingId)
        .populate('bookedBy')
        .populate({ path: 'equipments.equipmentId', populate: { path: 'provider' } })
        .lean();

      if (!booking) {
        this.logger.warn(`Equipment booking ${bookingId} not found for email sending`);
        return;
      }

      const customer = booking.bookedBy as any;

      // Send the unified booking confirmation + m-ticket email to the customer
      await this.bookingConfirmationMailerService.sendTicketConfirmation(bookingId, type, transactionData);

      if (booking.equipments) {
        const providerMap = new Map();
        
        for (const item of booking.equipments) {
          const equipment = item.equipmentId as any;
          if (equipment && equipment.provider) {
            const providerId = equipment.provider._id || equipment.provider;
            if (!providerMap.has(providerId.toString())) {
              providerMap.set(providerId.toString(), {
                provider: equipment.provider,
                items: []
              });
            }
            providerMap.get(providerId.toString()).items.push({ ...equipment, qty: item.quantity });
          }
        }

        for (const [providerId, data] of providerMap as any) {
          const providerEmail = data.provider.email;
          if (providerEmail) {
            const providerData = {
              providerName: data.provider.firstName || 'Provider',
              bookingId: bookingId,
              equipmentName: data.items.map((e: any) => e.name).join(', '),
              startDate: booking.date,
              endDate: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              duration: this.calculateDuration(booking.startTime, booking.endTime),
              equipmentFee: `${booking.totalPrice || 0} KWD`,
              venueAddress: booking.address || booking.venueDetails?.address || 'TBD',
              customerName: customer?.firstName,
              customerEmail: customer?.email,
              customerPhone: customer?.phoneNumber,
              eventDescription: booking.eventDescription || 'Equipment rental',
              equipmentItems: data.items.map((e: any) => ({ name: e.name, quantity: e.qty || 1 })),
            };

            await this.emailService.sendEquipmentProviderNotification(providerEmail, providerData);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send equipment booking emails: ${error.message}`);
    }
  }

  private async sendEquipmentPackageEmails(bookingId: string, transactionData?: any) {
    try {
      const EquipmentPackageBooking = this.combineBookingModel.db.model('EquipmentPackageBooking');
      const booking: any = await EquipmentPackageBooking
        .findById(bookingId)
        .populate('bookedBy')
        .populate({
          path: 'packageId',
          populate: [
            { path: 'createdBy' },
            { path: 'items.equipmentId', populate: { path: 'provider' } }
          ]
        })
        .lean();

      if (!booking) {
        this.logger.warn(`Equipment package booking ${bookingId} not found for email sending`);
        return;
      }

      const customer = booking.bookedBy as any;
      const packageData = booking.packageId as any;

      // Send the unified booking confirmation + m-ticket email to the customer
      await this.bookingConfirmationMailerService.sendTicketConfirmation(
        bookingId,
        BookingType.EQUIPMENT_PACKAGE,
        transactionData,
      );

      if (packageData && packageData.items) {
        const providerMap = new Map();
        
        for (const item of packageData.items) {
          const equipment = item.equipmentId as any;
          if (equipment && equipment.provider) {
            const providerId = equipment.provider._id || equipment.provider;
            if (!providerMap.has(providerId.toString())) {
              providerMap.set(providerId.toString(), {
                provider: equipment.provider,
                items: []
              });
            }
            providerMap.get(providerId.toString()).items.push({ ...equipment, qty: item.quantity });
          }
        }

        for (const [providerId, data] of providerMap as any) {
          const providerEmail = data.provider.email;
          if (providerEmail) {
            const providerData = {
              providerName: data.provider.firstName || 'Provider',
              bookingId: bookingId,
              equipmentName: packageData.name || 'Equipment Package',
              startDate: booking.startDate,
              endDate: booking.endDate,
              startTime: '00:00',
              endTime: '23:59',
              duration: `${booking.numberOfDays} days`,
              equipmentFee: `${booking.totalPrice} KWD`,
              venueAddress: booking.venueDetails?.address || 'TBD',
              customerName: booking.userDetails?.name || customer?.firstName,
              customerEmail: booking.userDetails?.email || customer?.email,
              customerPhone: booking.userDetails?.phone || customer?.phoneNumber,
              eventDescription: booking.eventDescription || 'Equipment package rental',
              equipmentItems: data.items.map((e: any) => ({ name: e.name, quantity: e.qty || 1 })),
            };

            await this.emailService.sendEquipmentProviderNotification(providerEmail, providerData);
          }
        }
      }

      this.logger.log(`Equipment package booking ${bookingId} emails sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send equipment package emails: ${error.message}`);
    }
  }

  private async sendSeatTableBoothEmails(bookingId: string, type: BookingType, transactionData?: any) {
    try {
      await this.bookingConfirmationMailerService.sendTicketConfirmation(bookingId, type, transactionData);
      this.logger.log(`Seat/table/booth ticket email dispatched for booking ${bookingId} (type=${type})`);
    } catch (error) {
      this.logger.error(`Failed to send seat/table/booth booking emails: ${error.message}`);
    }
  }

  private calculateDuration(startTime: string, endTime: string): string {
    try {
      const start = new Date(`2000-01-01 ${startTime}`);
      const end = new Date(`2000-01-01 ${endTime}`);
      const diffMs = end.getTime() - start.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    } catch {
      return 'N/A';
    }
  }

  private getBookingTypeLabel(type: BookingType): string {
    switch (type) {
      case BookingType.ARTIST: return 'Artist Booking';
      case BookingType.EQUIPMENT: return 'Equipment Rental';
      case BookingType.EQUIPMENT_PACKAGE: return 'Equipment Package';
      case BookingType.CUSTOM_EQUIPMENT_PACKAGE: return 'Custom Equipment Package';
      case BookingType.COMBO: return 'Combo Booking (Artist + Equipment)';
      case BookingType.TICKET: return 'Seat Booking';
      case BookingType.TABLE: return 'Table Booking';
      case BookingType.BOOTH: return 'Booth Booking';
      default: return 'Booking';
    }
  }

  async confirmSeatBooking(bookingId: string, userId?: string) {
    this.logger.log(`Looking for seat booking with ID: ${bookingId}`);
    const booking = await this.seatBookingModel.findById(bookingId);
    this.logger.log(`Found booking:`, booking ? 'YES' : 'NO');
    if (booking) {
      this.logger.log(`Booking status: ${booking.status}, paymentStatus: ${booking.paymentStatus}`);
    }
    
    if (!booking) throw new HttpException('Seat booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      {
        bookingStatus: 'booked',
        userId: booking.userId,
      },
    );

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    await booking.save();

    this.logger.log(`Seat booking ${bookingId} confirmed successfully`);
    return booking;
  }


  async confirmTableBooking(bookingId: string, userId?: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Table booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    // Mark tables as booked
    await this.tableModel.updateMany(
      { _id: { $in: booking.tableIds } },
      {
        bookingStatus: 'booked',
        userId: booking.userId,
      },
    );

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    await booking.save();

    this.logger.log(`Table booking ${bookingId} confirmed successfully`);
    return booking;
  }

  async confirmBoothBooking(bookingId: string, userId?: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Booth booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    await this.boothModel.updateMany(
      { _id: { $in: booking.boothIds } },
      {
        bookingStatus: 'booked',
        userId: booking.userId,
      },
    );

    booking.status = 'confirmed';
    booking.paymentStatus = 'confirmed';
    await booking.save();

    this.logger.log(`Booth booking ${bookingId} confirmed successfully`);
    return booking;
  }


  async cancelSeatBooking(bookingId: string, reason?: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Seat booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Seat booking ${bookingId} cancelled`);
    return booking;
  }


  async cancelTableBooking(bookingId: string, reason?: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Table booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    await this.tableModel.updateMany(
      { _id: { $in: booking.tableIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Table booking ${bookingId} cancelled`);
    return booking;
  }

  async cancelBoothBooking(bookingId: string, reason?: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Booth booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    await this.boothModel.updateMany(
      { _id: { $in: booking.boothIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Booth booking ${bookingId} cancelled`);
    return booking;
  }

  private async handlePaymentStatusUpdate(
    bookingId: string,
    status: UpdatePaymentStatus,
    type: BookingType,
    userId: string,
  ): Promise<void> {
    this.logger.log(`handlePaymentStatusUpdate: bookingId=${bookingId}, status=${status}, type=${type}, userId=${userId}`);

    try {
      switch (type) {
        case BookingType.COMBO: {
          const comboBooking = await this.combineBookingModel.findById(bookingId);
          if (!comboBooking) {
            this.logger.error(`Combo booking not found: ${bookingId}`);
            throw new HttpException('Combo booking not found', HttpStatus.NOT_FOUND);
          }

          if (status === UpdatePaymentStatus.CONFIRMED) {
            comboBooking.status = BookingStatus.CONFIRMED;
            await comboBooking.save();
            this.logger.log(`Combo booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            comboBooking.status = BookingStatus.CANCELLED;
            await comboBooking.save();
            this.logger.log(`Combo booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.ARTIST: {
          if (bookingId.startsWith('event-')) {
            this.logger.log(`Event creation payment detected: ${bookingId}. No booking update needed - event will be created via separate endpoint.`);
         
            break;
          }

      
          const artistBooking = await this.artistBookingModel.findById(bookingId);
          if (!artistBooking) {
            this.logger.error(`Artist booking not found: ${bookingId}`);
            throw new HttpException('Artist booking not found', HttpStatus.NOT_FOUND);
          }

          if (status === UpdatePaymentStatus.CONFIRMED) {
            artistBooking.status = BookingStatus.CONFIRMED;
            artistBooking.paymentStatus = 'confirmed';
            await artistBooking.save();
            this.logger.log(`Artist booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            artistBooking.status = BookingStatus.CANCELLED;
            artistBooking.paymentStatus = 'cancelled';
            await artistBooking.save();
            this.logger.log(`Artist booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.TICKET: {
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmSeatBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelSeatBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.TABLE: {
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmTableBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelTableBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.BOOTH: {
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmBoothBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelBoothBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.EQUIPMENT:
        case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CONFIRMED,
              UpdatePaymentStatus.CONFIRMED,
            );
            this.logger.log(`Equipment booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CANCELLED,
              UpdatePaymentStatus.CANCEL,
            );
            this.logger.log(`Equipment booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.EQUIPMENT_PACKAGE: {
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(userId),
              { status: 'confirmed' },
            );
            this.logger.log(` Equipment package booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(userId),
              { status: 'cancelled' },
            );
            this.logger.log(`Equipment package booking ${bookingId} cancelled`);
          }
          break;
        }

        default:
          this.logger.warn(`Unhandled booking type in handlePaymentStatusUpdate: ${type}, bookingId: ${bookingId}`);
      }
    } catch (error) {
      this.logger.error(`Error in handlePaymentStatusUpdate for booking ${bookingId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
