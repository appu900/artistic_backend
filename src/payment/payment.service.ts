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
        returnUrl: `${this.returnUrl}/success`,
        cancelUrl: `${this.returnUrl}/failure`,
        notificationUrl: 'http://localhost:3000/callback'
      };
    
      // to be deleted after testing brooo
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
      this.logger.log(`Verified CAPTURED payment: trackId=${trackId}, payment_id=${data.payment_id}, tran_id=${data.tran_id}, auth=${data.auth}, total_price=${data.total_price} ${data.currency_type}, is_paid_from_cc=${data.is_paid_from_cc}`);

      const log = await this.paymentLogService.findPaymentLogByBookingId(bookingId);
      if (!log) {
        throw new HttpException('Payment log not found for booking', HttpStatus.NOT_FOUND);
      }
      const userId = log.user as unknown as string;
      await this.paymentLogService.updateStatus(bookingId, UpdatePaymentStatus.CONFIRMED, trackId,)

      await this.handlePayemntStatusUpdate(bookingId, UpdatePaymentStatus.CONFIRMED, type as BookingType, userId);
      return {
        success: true,
        orderId: data.order_id,
        merchantRequestedOrderId: data.merchant_requested_order_id, // Matches bookingId
        status: data.status,
        result: transaction.result,
        amount: parseFloat(data.total_price),
        currency: data.currency_type,
        trackId: data.track_id,
        paymentType: data.payment_type,
        paymentMethod: data.payment_method,
        paymentId: data.payment_id,
        invoiceId: data.invoice_id,
        tranId: data.tran_id,
        auth: data.auth,
        postDate: data.post_date,
        transactionDate: data.transaction_date,
        customer: data.customer,
        redirectUrl: data.redirect_url, 
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
      if (log && log.user) userId = String(log.user);
    }
    if (!userId) {
      const log = await this.paymentLogService.findLogBySessionId(bookingId);
      userId = log?.user ? String(log.user) : '';
    }
    await this.paymentLogService.updateStatus(bookingId, status, trackId);
  }
}
