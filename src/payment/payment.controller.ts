import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { Response } from 'express';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly redisService: RedisService,
  ) {}

  //   ** this endpoint will responsible for start a payment process for any booking

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiatePayment(@Body() body: any, @GetUser() user: any) {
    const requiredFields = ['bookingId', 'amount', 'type'];
    const userId = user.userId;
    const userEmail = user.email;
    for (const field of requiredFields) {
      if (!body[field]) {
        throw new HttpException(
          `Missing required field: ${field}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    body.userId = userId;
    // Ensure downstream service receives the correct customer email
    body.customerEmail = userEmail;
    const res = await this.paymentService.initiatePayment(body);
    return { paymentLink: res.paymentLink };
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Query('bookingId') bookingId: string,
    @Query('type') type: string,
    @Query('sessionId') sessionId?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    console.log('paymentr verify just hit');
    if (!bookingId || !type || !sessionId) {
      throw new HttpException(
        'Missing required params: bookingId, type, and one of sessionId or invoiceId',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const useSession = !!sessionId;
      const id = (sessionId || invoiceId)!;
      const verification = await this.paymentService.verifyPayment(
        id,
        bookingId,
        type as BookingType,
        false,
      );
      if (verification.status !== 'CAPTURED') {
        await this.paymentService.releasePaymentLock(type, bookingId);
        throw new HttpException(
          `Payment not captured: ${verification.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        `Marked ${type} booking ${bookingId} as paid (amount: ${verification.amount} ${verification.currency})`,
      );
      await this.paymentService.releasePaymentLock(type, bookingId);
      console.log('payment verified successfully', verification);
      return {
        success: true,
        message: 'Payment verified and booking updated',
        data: verification, // Full details: orderId, status, etc.
      };
    } catch (error) {
      await this.paymentService.releasePaymentLock(type, bookingId);
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Verify error:', error);
      throw new HttpException(
        'Payment verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // @Get('callback/success')
  // async paymentSuccess(
  //   @Query() query: Record<string, string>,
  //   @Res() res: Response,
  // ) {
  //   try {
  //     const { type, bookingId, invoice_id, payment_id } = query;
  //     // const isSessionPayment = payment_id?.startsWith('SESSION');
  //     const isSessionPayment = true;

  //     const id = isSessionPayment ? payment_id : invoice_id;
  //     console.log("id",id)
  //     const verification = await this.paymentService.verifyPayment(
  //       id,
  //       bookingId,
  //       type as BookingType,
  //       isSessionPayment
  //     );
  //     if (verification.status !== 'CAPTURED') {
  //       await this.paymentService.releasePaymentLock(type, bookingId);
  //       throw new HttpException(
  //         `Payment not captured: ${verification.status}`,
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }
  //     console.log(
  //       `Marked ${type} booking ${bookingId} as paid (amount: ${verification.amount} ${verification.currency})`,
  //     );
  //     await this.paymentService.releasePaymentLock(type, bookingId);
  //     console.log('payment verified successfully', verification);
  //     return {
  //       success: true,
  //       message: 'Payment verified and booking updated',
  //       data: verification, // Full details: orderId, status, etc.
  //     };
  //   } catch (error) {
  //     // await this.paymentService.releasePaymentLock(t, booking_Id);
  //     if (error instanceof HttpException) {
  //       throw error;
  //     }
  //     console.error('Verify error:', error);
  //     throw new HttpException(
  //       'Payment verification failed',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  @Get('callback/failure')
  async paymentFailure(@Query('type') type: string, @Res() res: Response) {
    const baseFrontUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || process.env.FRONTEND_PAYMENT_SUCCESS_URL?.replace('/success', '/failure');
    if (baseFrontUrl) {
      const usp = new URLSearchParams();
      if (type) usp.set('type', type);
      // Pass along any gateway params (they may arrive here as well)
      return res.redirect(`${baseFrontUrl}${usp.toString() ? `?${usp.toString()}` : ''}`);
    }
    return res.status(200).json({ success: false, message: 'Payment cancelled' });
  }

  // Success callback endpoint for UPayments returnUrl
  // Note: UPayments will redirect the customer's browser here on success.
  // We intentionally keep it simple and let the frontend perform /payment/verify with JWT.
  @Get('callback/success')
  async paymentSuccess(
    @Query('type') type: string,
    @Query() allParams: Record<string, string>,
    @Res() res: Response,
  ) {
    // Common providers append identifiers like session_id, invoice_id, order_id
    // We pass through to the frontend so it can call our protected verify endpoint.
    // If you have a configured frontend URL, prefer redirecting there.
    const baseFrontUrl = process.env.FRONTEND_PAYMENT_SUCCESS_URL;
    if (baseFrontUrl) {
      const usp = new URLSearchParams({ type, ...allParams });
      return res.redirect(`${baseFrontUrl}?${usp.toString()}`);
    }

    // Fallback: simple OK message with metadata for debugging
    return res.status(200).json({
      success: true,
      message: 'Payment success callback received',
      type,
      params: allParams,
    });
  }

  // Optional: Webhook endpoint for server-to-server notifications from UPayments
  // Strongly recommended for reliability; configure UPAYMENTS_NOTIFICATION_URL to this path.
  @Post('webhook')
  async paymentWebhook(@Body() payload: any) {
    // Basic safety: accept known fields and log all for investigation
    // Depending on UPayments setup, payload may include: status, order_id, amount, currency, session_id, invoice_id, track_id, reference.id
    try {
      const status = payload?.status || payload?.data?.status;
      const orderId = payload?.order_id || payload?.data?.order_id || payload?.reference?.id;
      const bookingType = payload?.type || payload?.metadata?.type; // Optional if you set it
      const sessionId = payload?.session_id || payload?.data?.session_id;

      if (!orderId || !status) {
        // Accept but note missing required values
        return { received: true, note: 'Missing orderId or status in webhook' };
      }

      // Update logs if session is present, otherwise by orderId
      await this.paymentService.updateLogAndBookingFromGateway({
        bookingId: orderId,
        status,
        type: bookingType,
        sessionId,
      });

      return { received: true };
    } catch (e) {
      throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
