import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
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
  private readonly returnUrl = process.env.UPAYMENTS_RETURN_URL;
  private readonly notificationUrl =
    process.env.UPAYMENTS_NOTIFICATION_URL ||
    `${process.env.UPAYMENTS_RETURN_URL}/webhook`;
  private readonly token = process.env.UPAYMENTS_API_KEY;

  constructor(
    private redisService: RedisService,
    private paymentLogService: PaymentlogsService,
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
    type:BookingType;
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
      const payload = {
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
        returnUrl: `${this.returnUrl}/success?type=${type}`,
        cancelUrl: `${this.returnUrl}/failure?type=${type}`,
        notificationUrl: this.notificationUrl,
      };

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
        log
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

  async verifyPayment(id: string, bookingId:string, type:BookingType, useSessionId = false) {
    try {
      const paramName = useSessionId ? 'session_id' : 'invoice_id';
      const url = `${this.baseUrl}/get-payment-status?${paramName}=${id}`;

      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      });

      // 'CAPTURED', 'PENDING', 'CANCELLED', 'DECLINED'
      if (!data?.order_id || !data?.status) {
        throw new HttpException(
          'Invalid response from UPayments (missing order_id or status)',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Payment verification for ${paramName} ${id}: ${data.status} (amount: ${data.amount || 'N/A'}, currency: ${data.currency || 'KWD'})`,
      );

      const log = await this.paymentLogService.findLogBySessionId(id);
      if (log) {
        await this.paymentLogService.updateStatus(log.bookingId, data.status);
      }


      return {
        orderId: data.order_id,
        status: data.status,
        amount: data.amount || 0, // Float from response (e.g., 1.00)
        currency: data.currency || 'KWD',
        trackId: data.track_id, // Optional: UPayments internal ID
        paymentMethod: data.payment_method,
      };
    } catch (error) {
      const errorDetails = {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: `${this.baseUrl}/get-payment-status`, // For debugging
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

 
}
