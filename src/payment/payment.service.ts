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
  private readonly returnUrl = process.env.UPAYMENTS_RETURN_URL;
  private readonly token = process.env.UPAYMENTS_API_KEY;

  constructor(
    private redisService: RedisService,
    private paymentLogService: PaymentlogsService,
    private readonly bookingQueue: BookingStatusQueue,
  ) {}

  private genComboId(): string {
    return `combo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async initiateBatchPayment({
    items,
    userId,
    customerEmail,
    customerMobile,
  }: {
    items: Array<{ bookingId: string; type: BookingType; amount: number; description?: string }>;
    userId: string;
    customerEmail: string;
    customerMobile?: string;
  }) {
    const total = items.reduce((sum, it) => sum + (typeof it.amount === 'number' ? it.amount : 0), 0);
    if (total <= 0) {
      throw new HttpException('Total amount must be > 0', HttpStatus.BAD_REQUEST);
    }
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }
    if (customerMobile && !/^\+[1-9]\d{1,14}$/.test(customerMobile)) {
      throw new HttpException('Invalid mobile (E.164 format)', HttpStatus.BAD_REQUEST);
    }

    const comboId = this.genComboId();
    const redisKey = `payment_lock:${BookingType.COMBO}:${comboId}`;
    if (await this.redisService.exists(redisKey)) {
      throw new HttpException('Payment already processing', HttpStatus.CONFLICT);
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
        paymentGateway: { src: 'cc' },
        tokens: {},
        reference: { id: comboId },
        customer: {
          uniqueId: userId,
          name: 'Customer',
          email: customerEmail,
          mobile: customerMobile,
        },
        language: 'en',
        returnUrl: `${returnBase}/payment/verify`,
        cancelUrl: `${returnBase}/payment/verify?cancelled=1`,
        notificationUrl: `${returnBase}/payment/verify`,
      };

      this.logger.log('Upayments batch payload:', JSON.stringify(payload, null, 2));

      const { data } = await axios.post(`${this.baseUrl}/charge`, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!data?.status || !data?.data?.link) {
        throw new HttpException(data?.message || 'Failed to initiate', HttpStatus.BAD_REQUEST);
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

      this.logger.log(`Initiated combo: comboId=${comboId}, userId=${userId}, trackId=${trackId}`);
      return { paymentLink, log, comboId };
    } catch (error) {
      await this.redisService.del(redisKey);
      this.logger.error('Batch initiate failed:', error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.message || 'Initiate batch error',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Resolve booking type from logs when not provided in callback
  async resolveBookingType(bookingId: string, fallback?: string): Promise<BookingType> {
    if (fallback) return fallback as BookingType;
    const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
    if (log?.bookingType) return log.bookingType as BookingType;
    throw new HttpException('Booking type missing for verification', HttpStatus.BAD_REQUEST);
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
    if (amount <= 0)
      throw new HttpException('Amount must be > 0', HttpStatus.BAD_REQUEST);
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }
    if (customerMobile && !/^\+[1-9]\d{1,14}$/.test(customerMobile)) {
      throw new HttpException(
        'Invalid mobile (E.164 format)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const redisKey = `payment_lock:${type}:${bookingId}`;
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
          mobile: customerMobile,
        },
        language: 'en',
        returnUrl: `${returnBase}/payment/verify`,
        cancelUrl: `${returnBase}/payment/verify?cancelled=1`,
        // Upayments requires notificationUrl; route to same verify endpoint
        notificationUrl: `${returnBase}/payment/verify`,
      };
    
  // Debug payload (remove or reduce in production)
      this.logger.log('Upayments payload:', JSON.stringify(payload, null, 2));

      // send paylod to upayments
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
        bookingId,
        type,
        amount,
        'KWD',
        UpdatePaymentStatus.PENDING,
        sessionId,
        trackId,
      );

      this.logger.log(
        `Initiated: bookingId=${bookingId}, userId=${userId}, trackId=${trackId}`,
      );

      return { paymentLink, log };
    } catch (error) {
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
      this.logger.error(
        'Initiate failed:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message || 'Initiate error',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      throw new HttpException('trackId is required for verification', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`Verify: bookingId=${bookingId}, type=${type}, trackId=${trackId} (sessionId ignored)`);
    let data: any = null;
    let lastError: any = null;
    try {
      const response = await axios.get(`${this.baseUrl}/get-payment-status/${trackId}`, {
        headers: { 
          Authorization: `Bearer ${this.token}`, 
          Accept: 'application/json' 
        },
      });
      const data = response.data;
      console.log( "the main data of payment being verified",data)
      if (!data.status) {
        throw new HttpException(data.error_message || 'Upayments verification failed', HttpStatus.BAD_REQUEST);
      }

      const transaction = data.data?.transaction;
      if (!transaction) {
  throw new HttpException('No transaction data in response', HttpStatus.BAD_REQUEST);
}
      if (transaction.result !== 'CAPTURED') {
        await this.paymentLogService.updateStatus(bookingId,UpdatePaymentStatus.CANCEL,trackId)
        console.log("log updates sucessfull")
        throw new HttpException(`Payment not captured: ${transaction.result} (${data.status})`, HttpStatus.BAD_REQUEST);
      }
      this.logger.log(`Verified CAPTURED payment: trackId=${transaction.track_id}, payment_id=${transaction.payment_id}, tran_id=${transaction.tran_id}, auth=${transaction.auth}, total_price=${transaction.total_price} ${transaction.currency_type}, is_paid_from_cc=${transaction.is_paid_from_cc}`);

      const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (!log) {
        throw new HttpException('Payment log not found for booking', HttpStatus.NOT_FOUND);
      }
      // Ensure we pass a string userId (logs may populate the full user object)
      const userId =
        typeof (log as any).user === 'string'
          ? (log as any).user
          : String((log as any).user?._id ?? (log as any).user ?? '');
      await this.paymentLogService.updateStatus(bookingId, UpdatePaymentStatus.CONFIRMED, trackId,)

      if ((type as BookingType) === BookingType.COMBO) {
        const items = await this.redisService.get<Array<{ bookingId: string; type: BookingType }>>(
          `combo_map:${bookingId}`,
        );
        if (items && Array.isArray(items)) {
          for (const it of items) {
            await this.handlePayemntStatusUpdate(
              it.bookingId,
              UpdatePaymentStatus.CONFIRMED,
              it.type,
              String(userId),
            );
          }
          await this.redisService.del(`combo_map:${bookingId}`);
        } else {
          this.logger.warn(`No combo mapping found for ${bookingId}`);
        }
      } else {
        await this.handlePayemntStatusUpdate(bookingId, UpdatePaymentStatus.CONFIRMED, type as BookingType, userId);
      }
      return {
        success: true,
        orderId: transaction.order_id,
        merchantRequestedOrderId: transaction.merchant_requested_order_id || transaction.reference, // Matches bookingId
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
      if (error.response?.status === 404) {
        throw new HttpException('Invalid trackId: Payment not found', HttpStatus.NOT_FOUND);
      }
      if (error.response?.status === 401) {
        throw new HttpException('Unauthorized: Check API token', HttpStatus.UNAUTHORIZED);
      }
      this.logger.error('Verify failed:', {
        trackId,
        bookingId,
        error: error.response?.data || error.message,
        status: error.response?.status,
      });
      throw new HttpException(
        error.response?.data?.error_message || 'Verification failed',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  
  }


  async releasePaymentLock(type: string, bookingId: string) {
    await this.redisService.del(`payment_lock:${type}:${bookingId}`);
  }

 async handlePayemntStatusUpdate(bookingId: string, status: UpdatePaymentStatus, type: BookingType, userId: string) {
    await this.bookingQueue.enqueueBookingUpdate(bookingId, userId, type, status);
    this.logger.log(`Enqueued: bookingId=${bookingId}, userId=${userId}, type=${type}, status=${status}`);
  }


  async updateLogAndBookingFromGateway({ bookingId, status, type, sessionId, trackId }: { bookingId: string; status: string; type?: BookingType; sessionId?: string; trackId: string; }) {
    let userId = '';
    if (sessionId) {
      const log = await this.paymentLogService.findLogBySessionId(sessionId);
      if (log && log.user) {
        userId = typeof (log as any).user === 'string'
          ? (log as any).user
          : String((log as any).user?._id ?? (log as any).user);
      }
    }
    if (!userId) {
      const log = await this.paymentLogService.findLogBySessionId(bookingId);
      userId = log?.user
        ? (typeof (log as any).user === 'string'
            ? (log as any).user
            : String((log as any).user?._id ?? (log as any).user))
        : '';
    }
    await this.paymentLogService.updateStatus(bookingId, status, trackId);
  }
}
