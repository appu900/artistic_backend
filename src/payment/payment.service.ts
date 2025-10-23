import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { BookingStatusQueue } from 'src/infrastructure/redis/queue/payment-status-queue';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { PaymentlogsController } from 'src/modules/paymentlogs/paymentlogs.controller';
import { PaymentlogsService } from 'src/modules/paymentlogs/paymentlogs.service';
import { getSessionId } from 'src/utils/extractSessionId';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl = 'https://uapi.upayments.com/api/v1';
  private readonly returnUrl = process.env.UPAYMENTS_RETURN_URL; // e.g. http://localhost:5000/payment/callback
  private readonly notificationUrl: string | undefined =
    process.env.UPAYMENTS_NOTIFICATION_URL ||
    (process.env.UPAYMENTS_RETURN_URL
      ? process.env.UPAYMENTS_RETURN_URL.replace(/\/callback\/?$/, '/webhook')
      : undefined);
  private readonly token = process.env.UPAYMENTS_API_KEY;

  constructor(
    private redisService: RedisService,
    private paymentLogService: PaymentlogsService,
    private readonly bookingQueue: BookingStatusQueue,
  ) {}

  async initiatePayment({
    bookingId,
    userId,
    amount,
    type,
    customerEmail,
    description,
  }: {
    bookingId: string;
    userId: string;
    amount: number;
    type: BookingType;
    customerEmail: string;
    description?: string;
  }) {
    const redisKey = `payment_lock:${type}:${bookingId}`;
    const existingLock = await this.redisService.exists(redisKey);
    if (existingLock) {
      throw new HttpException(
        'Payment is already being processed for this booking',
        HttpStatus.CONFLICT,
      );
    }

    await this.redisService.set(redisKey, 'locked', 300);

    try {
      const payload: any = {
        order: {
          id: bookingId,
          description: description || `${type} booking payment`,
          currency: 'KWD',
          amount: amount.toFixed(2),
        },
        reference: {
          id: bookingId,
        },
        customer: {
          email: customerEmail,
        },
        products: [
          {
            name: `${type} booking`,
            description: description || 'Payment for booking',
            price: parseFloat(amount.toFixed(2)),
            quantity: 1,
          },
        ],
        tokens: {},
        language: 'en',
        // Important: Do NOT include query params in return/cancel URLs because the gateway
        // appends its own params starting with '?', which would create '??' sequences.
        returnUrl: `${this.returnUrl}/success`,
        cancelUrl: `${this.returnUrl}/failure`,
      };

      if (this.notificationUrl) {
        payload.notificationUrl = this.notificationUrl;
      }

      const { data } = await axios.post(`${this.baseUrl}/charge`, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!data?.data?.link) {
        this.logger.error('Invalid response from UPayments:', data);
        throw new HttpException(
          'Failed to initiate payment with UPayments',
          HttpStatus.BAD_REQUEST,
        );
      }

      const paymentLink = data.data.link;
      const sessionId = getSessionId(paymentLink) ?? '';
      const log = await this.paymentLogService.createLog(
        userId,
        bookingId,
        type,
        amount,
        'KWD',
        'PENDING',
        sessionId,
      );
      this.logger.log(
        `Payment initiated for ${type} booking ${bookingId}: ${paymentLink}`,
      );
      return {
        paymentLink,
        log,
      };
    } catch (error) {
      console.log(error);
      await this.redisService.del(redisKey);
      await this.paymentLogService.createLog(
        userId,
        bookingId,
        type,
        amount,
        'KWD',
        'FAILED',
        '',
      );
      this.logger.error(
        'Payment initiation failed:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message || 'Error initiating payment',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyPayment(
    id: string,
    bookingId: string,
    type: BookingType,
    useSessionId = true,
  ) {
    this.logger.log(`Starting verification for booking ${bookingId}, id: ${id}, useSessionId: ${useSessionId}`);
    
    try {
      // Try verification with different UPayments identifiers
      let data = null;
      let lastError = null;
      
      // First try with the provided id as payment_id (if useSessionId is true)
      if (useSessionId) {
        try {
          const url1 = `${this.baseUrl}/get-payment-status?payment_id=${id}`;
          this.logger.log(`Trying verification with payment_id: ${url1}`);
          const response1 = await axios.get(url1, {
            headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
          });
          data = response1.data;
          this.logger.log(`SUCCESS: Verification with payment_id worked`);
        } catch (error) {
          lastError = error;
          this.logger.warn(`FAILED: Verification failed with payment_id: ${error.response?.data?.message || error.message}`);
        }
      }
      
      // If session verification failed or we're using invoice mode, try with invoice_id
      if (!data) {
        try {
          const url2 = `${this.baseUrl}/get-payment-status?invoice_id=${id}`;
          this.logger.log(`Trying verification with invoice_id: ${url2}`);
          const response2 = await axios.get(url2, {
            headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
          });
          data = response2.data;
          this.logger.log(`SUCCESS: Verification with invoice_id worked`);
        } catch (error) {
          lastError = error;
          this.logger.warn(`FAILED: Verification failed with invoice_id: ${error.response?.data?.message || error.message}`);
        }
      }
      
      // If both failed, try with order_id (common UPayments identifier)
      if (!data) {
        try {
          const url3 = `${this.baseUrl}/get-payment-status?order_id=${bookingId}`;
          this.logger.log(`Trying verification with order_id: ${url3}`);
          const response3 = await axios.get(url3, {
            headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
          });
          data = response3.data;
          this.logger.log(`SUCCESS: Verification with order_id worked`);
        } catch (error) {
          lastError = error;
          this.logger.warn(`FAILED: Verification failed with order_id: ${error.response?.data?.message || error.message}`);
        }
      }
      
      if (!data) {
        this.logger.error(`ALL VERIFICATION METHODS FAILED for booking ${bookingId}`);
        throw lastError || new Error('All verification methods failed');
      }

      // Normalize possible nesting from gateway
      const payload = (data as any)?.data ?? (data as any) ?? {};

      // 'CAPTURED', 'PENDING', 'CANCELLED', 'DECLINED'
      if (!payload?.order_id || !payload?.status) {
        throw new HttpException(
          'Invalid response from UPayments (missing order_id or status)',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Payment verification for ${useSessionId ? 'session/payment_id' : 'invoice_id'} ${id}: ${payload.status} (amount: ${payload.amount || 'N/A'}, currency: ${payload.currency || 'KWD'})`,
      );

      // Update payment log (prefer session mapping; always update by bookingId as fallback)
      const log = await this.paymentLogService.findLogBySessionId(id);
      if (log) {
        await this.paymentLogService.updateStatus(log.bookingId, payload.status);
      }
      await this.paymentLogService.updateStatus(bookingId, payload.status);

      // Map to internal status and enqueue booking update
      await this.handlePayemntStatusUpdate(
        bookingId,
        this.mapGatewayStatus(payload.status),
        type,
      );
      
      return {
        orderId: payload.order_id,
        status: payload.status,
        amount: payload.amount || 0, // Float from response (1.00)
        currency: payload.currency || 'KWD',
        trackId: payload.track_id, // UPayments internal ID
        paymentMethod: payload.payment_method,
      };
    } catch (error) {
      const errorDetails = {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: `${this.baseUrl}/get-payment-status`, // For console
      };
      this.logger.error('Payment verification failed:', errorDetails);
      throw new HttpException(
        `Payment verification failed: ${error.response?.data?.message || error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async releasePaymentLock(type: string, bookingId: string) {
    const redisKey = `payment_lock:${type}:${bookingId}`;
    await this.redisService.del(redisKey);
  }

  async handlePayemntStatusUpdate(
    bookingId: string,
    status: UpdatePaymentStatus,
    type: BookingType,
  ) {
    await this.bookingQueue.enqueueBookingUpdate(bookingId, type, status);
  }

  /**
   * Gateway -> Internal status mapping
   */
  private mapGatewayStatus(status: string): UpdatePaymentStatus {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'CAPTURED':
      case 'SUCCESS':
      case 'APPROVED':
        return UpdatePaymentStatus.CONFIRMED;
      case 'PENDING':
        return UpdatePaymentStatus.PENDING;
      case 'CANCEL':
      case 'CANCELLED':
      case 'CANCELED':
      case 'DECLINED':
      case 'FAILED':
        return UpdatePaymentStatus.CANCEL;
      default:
        return UpdatePaymentStatus.PENDING;
    }
  }

  /**
   * Helper used by webhook to update logs and booking
   */
  async updateLogAndBookingFromGateway(args: {
    bookingId: string;
    status: string;
    type?: BookingType;
    sessionId?: string;
  }) {
    const { bookingId, status, type, sessionId } = args;
    try {
      if (sessionId) {
        const log = await this.paymentLogService.findLogBySessionId(sessionId);
        if (log) {
          await this.paymentLogService.updateStatus(log.bookingId, status);
        }
      }
      if (bookingId) {
        await this.handlePayemntStatusUpdate(
          bookingId,
          this.mapGatewayStatus(status),
          // If type is unknown from webhook, downstream will need to infer
          (type as BookingType) || ('equipment' as unknown as BookingType),
        );
      }
    } catch (e) {
      this.logger.error('Failed to update from webhook', e);
    }
  }
}