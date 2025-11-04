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

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl = 'https://uapi.upayments.com/api/v1';
  private readonly returnUrl = process.env.UPAYMENTS_RETURN_URL;
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

  /**
   * Helper method to retry payment gateway requests with exponential backoff
   */
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
        
        // Don't retry on client errors (4xx) or authentication issues
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        // Don't retry if we've reached max attempts
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        this.logger.warn(`Payment gateway request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Track payment gateway health for monitoring
   */
  private async trackPaymentGatewayHealth(operation: 'initiate' | 'verify', success: boolean, error?: any) {
    const key = `payment_gateway_health:${operation}`;
    const timestamp = Date.now();
    
    try {
      const redisClient = this.redisService.getClient();
      
      // Store last 100 operations for health monitoring
      await redisClient.lpush(key, JSON.stringify({
        timestamp,
        success,
        error: error ? {
          message: error.message,
          status: error.response?.status,
          code: error.code
        } : null
      }));
      
      // Keep only last 100 entries
      await redisClient.ltrim(key, 0, 99);
      
      // If we have failures, check failure rate
      if (!success) {
        const recentEntries = await redisClient.lrange(key, 0, 19); // Last 20 operations
        const failures = recentEntries.filter(entry => {
          try {
            return !JSON.parse(entry).success;
          } catch {
            return false;
          }
        });
        
        // Alert if failure rate is > 50% in last 20 operations
        if (recentEntries.length >= 10 && failures.length / recentEntries.length > 0.5) {
          this.logger.error(`⚠️ Payment gateway ${operation} failure rate is high: ${failures.length}/${recentEntries.length} failures in recent operations`);
        }
      }
    } catch (redisError) {
      // Don't fail the main operation if health tracking fails
      this.logger.warn('Failed to track payment gateway health:', redisError.message);
    }
  }

  /**
   * Get payment gateway health status for monitoring
   */
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
    // Mobile is optional for payment initiation. If provided but invalid, omit it instead of failing.
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
        paymentGateway: { src: ['cc', 'knet', 'apple-pay', 'google-pay'] },
        tokens: {},
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
        notificationUrl: `${returnBase}/payment/verify`,


        
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

  // Resolve booking type from logs when not provided in callback
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
  }: {
    bookingId: string;
    userId: string;
    amount: number;
    type: BookingType;
    customerEmail: string;
    description?: string;
    customerMobile?: string;
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
      // Check circuit breaker before making payment gateway request
      this.checkCircuitBreaker();
      
      const returnBase = (this.returnUrl || '')
        .replace(/\/$/, '')
        .replace(/\/payment(?:\/.*)?$/i, '')
        .replace(/\/$/, '');

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
        paymentGateway: { src: 'cc' },
        tokens: {},
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
        // Upayments requires notificationUrl; route to same verify endpoint
        notificationUrl: `${returnBase}/payment/verify`,
      };

      // Debug payload (remove or reduce in production)
      this.logger.log('Upayments payload:', JSON.stringify(payload, null, 2));

      // send payload to upayments with retry mechanism
      const { data } = await this.retryRequest(async () => {
        return await axios.post(`${this.baseUrl}/charge`, payload, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000, // 30 seconds timeout
          validateStatus: (status) => status < 500, // Don't throw on 4xx errors, handle them gracefully
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
      );
      console.log('paynmnent logs for recent transaction', log);
      this.logger.log(
        `Initiated: bookingId=${bookingId}, userId=${userId}, trackId=${trackId}`,
      );

      // Track successful payment initiation
      await this.trackPaymentGatewayHealth('initiate', true);
      
      // Record circuit breaker success
      this.recordCircuitBreakerSuccess();

      return { paymentLink, log };
    } catch (error) {
      // Track failed payment initiation
      await this.trackPaymentGatewayHealth('initiate', false, error);
      
      // Record circuit breaker failure
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
      );

      // Enhanced error handling for payment gateway issues
      let errorMessage = 'Payment gateway is temporarily unavailable. Please try again later.';
      let errorStatus = HttpStatus.SERVICE_UNAVAILABLE;

      if (error.response) {
        const responseData = error.response.data;
        
        // Check if response is HTML (likely a Cloudflare error page)
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
          // Standard JSON error response
          errorMessage = responseData.message;
          errorStatus = error.response.status || HttpStatus.BAD_REQUEST;
        } else {
          // Fallback for unexpected response format
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
    let data: any = null;
    let lastError: any = null;
    try {
      // Check circuit breaker before making payment gateway request
      this.checkCircuitBreaker();
      
      const response = await this.retryRequest(async () => {
        return await axios.get(
          `${this.baseUrl}/get-payment-status/${trackId}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: 'application/json',
            },
            timeout: 15000, // 15 seconds timeout for verification
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors, handle them gracefully
          },
        );
      }, 1); // Only 1 retry for verification
      const data = response.data;
      // console.log('the main data of payment being verified', data);
      if (!data.status) {
        throw new HttpException(
          data.error_message || 'Upayments verification failed',
          HttpStatus.BAD_REQUEST,
        );
      }

      const transaction = data.data?.transaction;
      // console.log("this is a transaction",transaction)
      if (!transaction) {
        throw new HttpException(
          'No transaction data in response',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (transaction.result !== 'CAPTURED') {
        await this.paymentLogService.updateStatus(
          bookingId,
          UpdatePaymentStatus.CANCEL,
          trackId,
        );
        await this.handlePaymentStatusUpdate(bookingId,UpdatePaymentStatus.CANCEL,type as BookingType,'')
        console.log('log updates sucessfull');
        throw new HttpException(
          `Payment not captured: ${transaction.result} (${data.status})`,
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.log(
        `Verified CAPTURED payment: trackId=${transaction.track_id}, payment_id=${transaction.payment_id}, tran_id=${transaction.tran_id}, auth=${transaction.auth}, total_price=${transaction.total_price} ${transaction.currency_type}, is_paid_from_cc=${transaction.is_paid_from_cc}`,
      );

      const log =
        await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (!log) {
        throw new HttpException(
          'Payment log not found for booking',
          HttpStatus.NOT_FOUND,
        );
      }
      // Ensure we pass a string userId (logs may populate the full user object)
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
        // Check if this is a batch combo (multiple separate bookings) or single combo (combined booking)
        const items = await this.redisService.get<
          Array<{ bookingId: string; type: BookingType }>
        >(`combo_map:${bookingId}`);
        if (items && Array.isArray(items)) {
          // Handle batch combo (multiple separate bookings combined into one payment)
          for (const it of items) {
            if (it.type === BookingType.EQUIPMENT_PACKAGE) {
              // Directly confirm equipment-package bookings (no queue)
              await this.equipmentPackageBookingService.updateBookingStatus(
                it.bookingId,
                String(userId),
                { status: 'confirmed' },
              );
            } else if (it.type === BookingType.EQUIPMENT || it.type === BookingType.CUSTOM_EQUIPMENT_PACKAGE) {
              // Confirm equipment-only bookings synchronously to keep parity
              await this.bookingService.updateEquipmentBookingStatus(
                it.bookingId,
                BookingStatus.CONFIRMED,
                UpdatePaymentStatus.CONFIRMED,
              );
            } else if (it.type === BookingType.TICKET || it.type === BookingType.TABLE || it.type === BookingType.BOOTH) {
              // Route seat/table/booth confirmations through the worker
              await this.handlePayemntStatusUpdate(
                it.bookingId,
                UpdatePaymentStatus.CONFIRMED,
                it.type,
                String(userId),
              );
            } else {
              // Enqueue for other types (artist/combo)
              await this.handlePaymentStatusUpdate(
                it.bookingId,
                UpdatePaymentStatus.CONFIRMED,
                it.type,
                String(userId),
              );
            }
            // Perform post-success side effects synchronously for types handled directly here.
            if (
              it.type !== BookingType.TICKET &&
              it.type !== BookingType.TABLE &&
              it.type !== BookingType.BOOTH
            ) {
              await this.bookingService.handlePostPaymentSuccess(
                it.bookingId,
                it.type,
              );
              // 🎭 Send confirmation emails for each booking in combo (non-seat/table/booth)
              await this.sendBookingConfirmationEmails(it.bookingId, it.type, String(userId), transaction);
            }
          }
          await this.redisService.del(`combo_map:${bookingId}`);
        } else {
          // Handle single combined booking (artist + equipment as one entity)
          this.logger.log(`Processing single combined booking: ${bookingId}`);
          await this.handlePaymentStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            BookingType.COMBO,
            String(userId),
          );
          // Perform post-success side effects synchronously for combined booking
          await this.bookingService.handlePostPaymentSuccess(
            bookingId,
            BookingType.COMBO,
          );
          // 🎭 Send confirmation emails for combo booking
          await this.sendBookingConfirmationEmails(bookingId, BookingType.COMBO, String(userId), transaction);
        }
      } else {
        if ((type as BookingType) === BookingType.EQUIPMENT_PACKAGE) {
          // Directly confirm equipment-package bookings without enqueuing
          await this.equipmentPackageBookingService.updateBookingStatus(
            bookingId,
            String(userId),
            { status: 'confirmed' },
          );
        } else if ((type as BookingType) === BookingType.EQUIPMENT || (type as BookingType) === BookingType.CUSTOM_EQUIPMENT_PACKAGE) {
          // Confirm equipment-only bookings synchronously
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
          // Route seat/table/booth confirmations through the worker
          await this.handlePayemntStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            type as BookingType,
            String(userId),
          );
        } else {
          // For other booking types, use the original handler
          await this.handlePaymentStatusUpdate(
            bookingId,
            UpdatePaymentStatus.CONFIRMED,
            type as BookingType,
            userId,
          );
        }
        // Perform post-success side effects for single bookings handled directly here
        if (
          (type as BookingType) !== BookingType.TICKET &&
          (type as BookingType) !== BookingType.TABLE &&
          (type as BookingType) !== BookingType.BOOTH
        ) {
          await this.bookingService.handlePostPaymentSuccess(
            bookingId,
            type as BookingType,
          );
          // 🎭 Send confirmation emails for single booking (non-seat/table/booth)
          await this.sendBookingConfirmationEmails(bookingId, type as BookingType, String(userId), transaction);
        }
      }
      // Track successful payment verification
      await this.trackPaymentGatewayHealth('verify', true);
      
      // Record circuit breaker success
      this.recordCircuitBreakerSuccess();

      return {
        success: true,
        orderId: transaction.order_id,
        merchantRequestedOrderId:
          transaction.merchant_requested_order_id || transaction.reference, // Matches bookingId
        status: data.status,
        result: transaction.result,
        amount: parseFloat(transaction.total_price),
        currency: transaction.currency_type,
        trackId: transaction.track_id,
        paymentType: transaction.payment_type,
        paymentMethod: transaction.payment_method,
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
      // Track failed payment verification
      await this.trackPaymentGatewayHealth('verify', false, error);
      
      // Record circuit breaker failure for server errors only
      if (!error.response || error.response.status >= 500) {
        this.recordCircuitBreakerFailure();
      }
      
      // Enhanced error handling for payment verification
      let errorMessage = 'Payment verification failed. Please contact support if the issue persists.';
      let errorStatus = HttpStatus.INTERNAL_SERVER_ERROR;

      if (error.response) {
        const responseData = error.response.data;
        
        // Handle specific HTTP status codes
        if (error.response.status === 404) {
          errorMessage = 'Payment not found. Please check the payment details and try again.';
          errorStatus = HttpStatus.NOT_FOUND;
        } else if (error.response.status === 401) {
          errorMessage = 'Payment verification unauthorized. Please contact support.';
          errorStatus = HttpStatus.UNAUTHORIZED;
        } else if (error.response.status >= 500) {
          // Check if response is HTML (likely a Cloudflare error page)
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
          // Standard JSON error response
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

  async releasePaymentLock(type: string, bookingId: string) {
    await this.redisService.del(`payment_lock:${type}:${bookingId}`);
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
            // For other types, fall through to queue (artist/combo handled by worker confirm-only)
            break;
        }
      } catch (e) {
        this.logger.warn(
          `Synchronous confirm failed for ${bookingId} (type=${type}). Falling back to queue. Reason: ${(e as any)?.message}`,
        );
      }
    }

    // Cancel path: also handle equipment types synchronously to keep states consistent
    if (status === UpdatePaymentStatus.CANCEL) {
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
              String(userId),
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
    }

    // Default: enqueue for worker processing
    await this.bookingQueue.enqueueBookingUpdate(
      bookingId,
      userId,
      type,
      status,
    );
    this.logger.log(
      `Enqueued: bookingId=${bookingId}, userId=${userId}, type=${type}, status=${status}`,
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
          await this.sendEquipmentBookingEmails(bookingId, transactionData);
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
      
      this.logger.log(`✅ Email sending completed for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send confirmation emails for booking ${bookingId}: ${error.message}`);
      // Don't throw - email failure shouldn't block payment processing
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

      // Send customer receipt
      const customerData = {
        customerName: booking.userDetails?.name || customer?.firstName || 'Customer',
        bookingId: bookingId,
        bookingType: 'Combo Booking (Artist + Equipment)',
        eventDate: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        venueAddress: booking.address,
        artistName: artistBooking?.artistId?.stageName || artistBooking?.artistId?.user?.firstName || 'Artist',
        artistType: artistBooking?.artistId?.artistType || 'Performer',
        artistFee: artistBooking?.artistPrice || 0,
        equipmentDetails: equipmentBooking?.equipmentItems?.map((item: any) => item.equipment?.name).join(', ') || 'Equipment Package',
        equipmentFee: equipmentBooking?.equipmentPrice || 0,
        totalAmount: `${booking.totalPrice} KWD`,
        transactionId: transactionData?.track_id || 'N/A',
        paymentMethod: 'Credit Card',
        paymentDate: new Date().toLocaleDateString(),
        eventDescription: booking.eventDescription || 'Event booking',
      };

      await this.emailService.sendCustomerBookingReceipt(
        booking.userDetails?.email || customer?.email,
        customerData
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

        for (const [providerId, data] of providerMap) {
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

      // Send customer receipt
      const customerData = {
        customerName: customer?.firstName || 'Customer',
        bookingId: bookingId,
        bookingType: 'Artist Booking',
        eventDate: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        venueAddress: booking.address || booking.venueDetails?.address || 'TBD',
        artistName: artist?.stageName || artist?.user?.firstName || 'Artist',
        artistType: artist?.artistType || 'Performer',
        artistFee: `${booking.totalPrice || booking.price} KWD`,
        equipmentDetails: '',
        equipmentFee: '0 KWD',
        totalAmount: `${booking.totalPrice || booking.price} KWD`,
        transactionId: transactionData?.track_id || 'N/A',
        paymentMethod: 'Credit Card',
        paymentDate: new Date().toLocaleDateString(),
        eventDescription: booking.eventDescription || 'Artist performance',
      };

      await this.emailService.sendCustomerBookingReceipt(
        customer?.email,
        customerData
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

  private async sendEquipmentBookingEmails(bookingId: string, transactionData?: any) {
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

      // Send customer receipt
      const customerData = {
        customerName: customer?.firstName || 'Customer',
        bookingId: bookingId,
        bookingType: 'Equipment Rental',
        eventDate: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        venueAddress: booking.address || booking.venueDetails?.address || 'TBD',
        artistName: '',
        artistType: '',
        artistFee: '0 KWD',
        equipmentDetails: booking.equipments?.map((item: any) => item.equipmentId?.name).filter(Boolean).join(', ') || 'Equipment',
        equipmentFee: `${booking.totalPrice || 0} KWD`,
        totalAmount: `${booking.totalPrice || 0} KWD`,
        transactionId: transactionData?.track_id || 'N/A',
        paymentMethod: 'Credit Card',
        paymentDate: new Date().toLocaleDateString(),
        eventDescription: booking.eventDescription || 'Equipment rental',
      };

      await this.emailService.sendCustomerBookingReceipt(
        customer?.email,
        customerData
      );

      // Send equipment provider notifications
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

        for (const [providerId, data] of providerMap) {
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
      // Fetch equipment package booking from equipment-package-booking collection
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

      // Send customer receipt
      const customerData = {
        customerName: booking.userDetails?.name || customer?.firstName || 'Customer',
        bookingId: bookingId,
        bookingType: 'Equipment Package Booking',
        eventDate: booking.startDate,
        startTime: '00:00',
        endTime: '23:59',
        venueAddress: booking.venueDetails?.address || 'TBD',
        artistName: '',
        artistType: '',
        artistFee: '0 KWD',
        equipmentDetails: packageData?.name || 'Equipment Package',
        equipmentFee: `${booking.totalPrice} KWD`,
        totalAmount: `${booking.totalPrice} KWD`,
        transactionId: transactionData?.track_id || 'N/A',
        paymentMethod: 'Credit Card',
        paymentDate: new Date().toLocaleDateString(),
        eventDescription: booking.eventDescription || 'Equipment package rental',
      };

      await this.emailService.sendCustomerBookingReceipt(
        booking.userDetails?.email || customer?.email,
        customerData
      );

      // Send equipment provider notifications if package has items
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

        for (const [providerId, data] of providerMap) {
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

      this.logger.log(`✅ Equipment package booking ${bookingId} emails sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send equipment package emails: ${error.message}`);
    }
  }

  private async sendSeatTableBoothEmails(bookingId: string, type: BookingType, transactionData?: any) {
    try {
      let booking: any = null;
      let bookingTypeName = '';
      let seatingInfo = '';

      // Fetch the appropriate booking based on type
      if (type === BookingType.TICKET) {
        booking = await this.seatBookingModel
          .findById(bookingId)
          .populate('userId')
          .populate({
            path: 'eventId',
            populate: { path: 'createdBy' }
          })
          .populate('seatIds')
          .lean();
        bookingTypeName = 'Event Ticket Booking';
        seatingInfo = booking?.seatNumber?.join(', ') || 'Seats booked';
      } else if (type === BookingType.TABLE) {
        booking = await this.tableBookingModel
          .findById(bookingId)
          .populate('userId')
          .populate({
            path: 'eventId',
            populate: { path: 'createdBy' }
          })
          .populate('tableIds')
          .lean();
        bookingTypeName = 'Event Table Booking';
        seatingInfo = `${booking?.tableIds?.length || 0} table(s)`;
      } else if (type === BookingType.BOOTH) {
        booking = await this.boothBookingModel
          .findById(bookingId)
          .populate('userId')
          .populate({
            path: 'eventId',
            populate: { path: 'createdBy' }
          })
          .populate('boothIds')
          .lean();
        bookingTypeName = 'Event Booth Booking';
        seatingInfo = `${booking?.boothIds?.length || 0} booth(s)`;
      }

      if (!booking) {
        this.logger.warn(`${bookingTypeName} ${bookingId} not found for email sending`);
        return;
      }

      const customer = booking.userId as any;
      const event = booking.eventId as any;

      // Send customer receipt
      const customerData = {
        customerName: customer?.firstName || 'Customer',
        bookingId: bookingId,
        bookingType: bookingTypeName,
        eventDate: event?.eventDate || new Date().toLocaleDateString(),
        startTime: event?.startTime || 'TBD',
        endTime: event?.endTime || 'TBD',
        venueAddress: event?.location?.address || event?.location || 'TBD',
        artistName: '',
        artistType: '',
        artistFee: '0 KWD',
        equipmentDetails: seatingInfo,
        equipmentFee: '0 KWD',
        totalAmount: `${booking.totalAmount || 0} KWD`,
        transactionId: transactionData?.track_id || 'N/A',
        paymentMethod: 'Credit Card',
        paymentDate: new Date().toLocaleDateString(),
        eventDescription: `${event?.eventTitle || 'Event'} - ${seatingInfo}`,
      };

      await this.emailService.sendCustomerBookingReceipt(
        customer?.email,
        customerData
      );

      // Optionally send notification to event organizer
      if (event && event.createdBy && event.createdBy.email) {
        this.logger.log(`Event organizer notification for ${bookingTypeName} ${bookingId} can be added here`);
        // You can create a new email template for event organizers if needed
      }

      this.logger.log(`✅ ${bookingTypeName} ${bookingId} emails sent successfully`);
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

  /**
   * Confirm a seat booking after successful payment
   */
  async confirmSeatBooking(bookingId: string, userId?: string) {
    this.logger.log(`Looking for seat booking with ID: ${bookingId}`);
    const booking = await this.seatBookingModel.findById(bookingId);
    this.logger.log(`Found booking:`, booking ? 'YES' : 'NO');
    if (booking) {
      this.logger.log(`Booking status: ${booking.status}, paymentStatus: ${booking.paymentStatus}`);
    }
    
    if (!booking) throw new HttpException('Seat booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    // Mark seats as booked
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

  /**
   * Confirm a table booking after successful payment
   */
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

  /**
   * Confirm a booth booking after successful payment
   */
  async confirmBoothBooking(bookingId: string, userId?: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Booth booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    // Mark booths as booked
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

  /**
   * Cancel a pending seat booking and release locks
   */
  async cancelSeatBooking(bookingId: string, reason?: string) {
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Seat booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    // Release seats
    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Seat booking ${bookingId} cancelled`);
    return booking;
  }

  /**
   * Cancel a pending table booking and release locks
   */
  async cancelTableBooking(bookingId: string, reason?: string) {
    const booking = await this.tableBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Table booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    // Release tables
    await this.tableModel.updateMany(
      { _id: { $in: booking.tableIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Table booking ${bookingId} cancelled`);
    return booking;
  }

  /**
   * Cancel a pending booth booking and release locks
   */
  async cancelBoothBooking(bookingId: string, reason?: string) {
    const booking = await this.boothBookingModel.findById(bookingId);
    if (!booking) throw new HttpException('Booth booking not found', HttpStatus.NOT_FOUND);
    if (booking.status !== 'pending') return booking;

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    // Release booths
    await this.boothModel.updateMany(
      { _id: { $in: booking.boothIds } },
      { bookingStatus: 'available' },
    );

    this.logger.log(`Booth booking ${bookingId} cancelled`);
    return booking;
  }

  // Removed deprecated EventTicketBooking confirm/cancel handlers; separate seat/table/booth flows are used instead

  /**
   * Handle payment status updates for different booking types
   */
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
          // Handle combo booking (combined artist + equipment booking)
          const comboBooking = await this.combineBookingModel.findById(bookingId);
          if (!comboBooking) {
            this.logger.error(`Combo booking not found: ${bookingId}`);
            throw new HttpException('Combo booking not found', HttpStatus.NOT_FOUND);
          }

          if (status === UpdatePaymentStatus.CONFIRMED) {
            comboBooking.status = BookingStatus.CONFIRMED;
            await comboBooking.save();
            this.logger.log(`✅ Combo booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            comboBooking.status = BookingStatus.CANCELLED;
            await comboBooking.save();
            this.logger.log(`❌ Combo booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.ARTIST: {
          // Handle artist-only booking
          const artistBooking = await this.artistBookingModel.findById(bookingId);
          if (!artistBooking) {
            this.logger.error(`Artist booking not found: ${bookingId}`);
            throw new HttpException('Artist booking not found', HttpStatus.NOT_FOUND);
          }

          if (status === UpdatePaymentStatus.CONFIRMED) {
            artistBooking.status = BookingStatus.CONFIRMED;
            artistBooking.paymentStatus = 'confirmed';
            await artistBooking.save();
            this.logger.log(`✅ Artist booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            artistBooking.status = BookingStatus.CANCELLED;
            artistBooking.paymentStatus = 'cancelled';
            await artistBooking.save();
            this.logger.log(`❌ Artist booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.TICKET: {
          // Handle seat bookings
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmSeatBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelSeatBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.TABLE: {
          // Handle table bookings
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmTableBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelTableBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.BOOTH: {
          // Handle booth bookings
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.confirmBoothBooking(bookingId, userId);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.cancelBoothBooking(bookingId, 'Payment cancelled');
          }
          break;
        }

        case BookingType.EQUIPMENT:
        case BookingType.CUSTOM_EQUIPMENT_PACKAGE: {
          // Handle equipment bookings directly
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CONFIRMED,
              UpdatePaymentStatus.CONFIRMED,
            );
            this.logger.log(`✅ Equipment booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.bookingService.updateEquipmentBookingStatus(
              bookingId,
              BookingStatus.CANCELLED,
              UpdatePaymentStatus.CANCEL,
            );
            this.logger.log(`❌ Equipment booking ${bookingId} cancelled`);
          }
          break;
        }

        case BookingType.EQUIPMENT_PACKAGE: {
          // Handle equipment package bookings directly
          if (status === UpdatePaymentStatus.CONFIRMED) {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(userId),
              { status: 'confirmed' },
            );
            this.logger.log(`✅ Equipment package booking ${bookingId} confirmed successfully`);
          } else if (status === UpdatePaymentStatus.CANCEL) {
            await this.equipmentPackageBookingService.updateBookingStatus(
              bookingId,
              String(userId),
              { status: 'cancelled' },
            );
            this.logger.log(`❌ Equipment package booking ${bookingId} cancelled`);
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
