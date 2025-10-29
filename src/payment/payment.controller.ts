import {
  BadRequestException,
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
    body.customerEmail = userEmail;

    const res = await this.paymentService.initiatePayment(body);

    return {
      paymentLink: res.paymentLink,
      trackId: res.log.trackId,
      bookingId: body.bookingId,
      type: body.type,
    };
  }

  @Post('initiate-batch')
  @UseGuards(JwtAuthGuard)
  async initiateBatchPayment(@Body() body: any, @GetUser() user: any) {
    const { items, customerMobile } = body || {};
    if (!Array.isArray(items) || items.length < 2) {
      throw new HttpException('items must be an array with at least 2 entries', HttpStatus.BAD_REQUEST);
    }
    // Validate each item
    for (const [idx, it] of items.entries()) {
      if (!it?.bookingId || !it?.type || typeof it?.amount !== 'number') {
        throw new HttpException(`Invalid item at index ${idx}: bookingId, type, amount required`, HttpStatus.BAD_REQUEST);
      }
      if (it.amount <= 0) {
        throw new HttpException(`Invalid amount at index ${idx}`, HttpStatus.BAD_REQUEST);
      }
    }

    const userId = user.userId;
    const userEmail = user.email;
    const res = await this.paymentService.initiateBatchPayment({ items, userId, customerEmail: userEmail, customerMobile });
    return {
      paymentLink: res.paymentLink,
      trackId: res.log.trackId,
      bookingId: res.comboId,
      type: 'combo',
    };
  }

   
  @Get('verify')
  async verifyPayment(
    @Query() allParams: Record<string, string>,
    @Res() res: Response,
  ) {
    // Normalize params coming from gateway
    let bookingId = allParams.requested_order_id || allParams.order_id || allParams.bookingId || '';
    // Clean up if gateway appended its own query after bookingId (e.g., bookingId=...?...)
    if (bookingId.includes('?')) bookingId = bookingId.split('?')[0];
    let type = allParams.type as string | undefined;
    const trackId = allParams.trackId || allParams.track_id;
    const sessionId = allParams.sessionId || allParams.session_id;
    const invoiceId = allParams.invoiceId || allParams.invoice_id;
    const isCancelled = allParams.cancelled === '1' || allParams.result === 'CANCELED';

    const successRedirect = process.env.FRONTEND_PAYMENT_SUCCESS_URL;
    const failureRedirect = process.env.FRONTEND_PAYMENT_FAILURE_URL || successRedirect?.replace('/success', '/failure');

    if (!bookingId || (!trackId && !sessionId && !invoiceId)) {
      const msg = 'Missing required params: bookingId, type, and one of trackId/sessionId/invoiceId';
      if (failureRedirect) {
        const usp = new URLSearchParams({ message: msg, ...(bookingId ? { bookingId } : {}), ...(type ? { type } : {}) });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }

    if (isCancelled) {
      const resolvedType = await this.paymentService.resolveBookingType(bookingId, type);
      await this.paymentService.releasePaymentLock(String(resolvedType), bookingId);
      if (failureRedirect) {
        const usp = new URLSearchParams({ bookingId, type: String(resolvedType), message: 'Payment was cancelled' });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      return res.status(400).json({ success: false, message: 'Payment was cancelled', bookingId, type: String(resolvedType) });
    }

    try {
      // If type is not present, resolve from payment logs
      const resolvedType = await this.paymentService.resolveBookingType(bookingId, type);
      // We verify strictly via trackId per upstream API
      const effectiveTrackId = trackId;
      const verification = await this.paymentService.verifyPayment(
        effectiveTrackId,
        bookingId,
        String(resolvedType) as BookingType,
        false,
        effectiveTrackId,
      );
      if (verification.result !== 'CAPTURED') {
        await this.paymentService.releasePaymentLock(String(resolvedType), bookingId);
        if (failureRedirect) {
          const usp = new URLSearchParams({ bookingId, type: String(resolvedType), trackId: effectiveTrackId, message: 'Payment not captured' });
          return res.redirect(`${failureRedirect}?${usp.toString()}`);
        }
        throw new BadRequestException('Payment verification failed');
      }

      // Optionally release lock; booking update is enqueued inside service
      await this.paymentService.releasePaymentLock(String(resolvedType), bookingId);

      if (successRedirect) {
        const usp = new URLSearchParams({ bookingId, type: String(resolvedType), trackId: effectiveTrackId });
        return res.redirect(`${successRedirect}?${usp.toString()}`);
      }
      return res.status(200).json({ success: true, message: 'Payment verified successfully', bookingId, type: String(resolvedType), trackId: effectiveTrackId });
    } catch (error) {
      const resolvedType = type ? String(type) : 'equipment';
      await this.paymentService.releasePaymentLock(resolvedType, bookingId);
      if (failureRedirect) {
        const usp = new URLSearchParams({ bookingId, type: String(resolvedType), message: 'Payment verification failed' });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Verify error:', error);
      throw new HttpException('Payment verification failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Optional: handle server-to-server notifications if the gateway posts to notificationUrl
  @Post('verify')
  async verifyPaymentNotify(
    @Body() allParams: Record<string, any>,
    @Res() res: Response,
  ) {
    // Normalize the fields from the POST body
    const bookingId = allParams.bookingId || allParams.requested_order_id || allParams.order_id;
    const type = allParams.type;
    const trackId = allParams.trackId || allParams.track_id;
    const sessionId = allParams.sessionId || allParams.session_id;
    const invoiceId = allParams.invoiceId || allParams.invoice_id;
    const isCancelled = allParams.cancelled === '1' || allParams.result === 'CANCELED';

    if (!bookingId || !type || (!trackId && !sessionId && !invoiceId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Missing required params: bookingId, type, and one of trackId/sessionId/invoiceId',
      });
    }

    if (isCancelled) {
      await this.paymentService.releasePaymentLock(type, bookingId);
      return res.status(HttpStatus.OK).json({ success: true, message: 'Cancellation acknowledged', bookingId, type });
    }

    try {
      const effectiveTrackId = trackId;
      const verification = await this.paymentService.verifyPayment(
        effectiveTrackId,
        bookingId,
        type as BookingType,
        false,
        effectiveTrackId,
      );
      if (verification.result !== 'CAPTURED') {
        await this.paymentService.releasePaymentLock(type, bookingId);
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Payment not captured',
          bookingId,
          type,
          trackId: effectiveTrackId,
        });
      }
      await this.paymentService.releasePaymentLock(type, bookingId);
      return res.status(HttpStatus.OK).json({ success: true, message: 'Payment verified successfully', bookingId, type, trackId: effectiveTrackId });
    } catch (error) {
      await this.paymentService.releasePaymentLock(type, bookingId);
      const msg = error instanceof HttpException ? error.message : 'Payment verification failed';
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: msg });
    }
  }


  @Get('/success')
  async paymentSuccess(
    @Query('type') type: string,
    @Query() allParams: Record<string, string>,
    @Res() res: Response,
  ) {
    const bookingId = allParams.requested_order_id || allParams.order_id;
    console.log('Success callback:', { bookingId, type, params: allParams });

    const baseFrontUrl = process.env.FRONTEND_PAYMENT_SUCCESS_URL;
    if (baseFrontUrl) {
      const usp = new URLSearchParams({ type, ...(bookingId ? { bookingId } : {}), ...allParams });
      return res.redirect(`${baseFrontUrl}?${usp.toString()}`);
    }
    return res.status(200).json({
      success: true,
      message: 'Payment success—verify via /payment/verify?bookingId=...&type=...&trackId=...',
      bookingId,
      type,
      params: allParams,
    });
  }



  @Get('/failure')
  async paymentFailure(@Query('type') type: string, @Res() res: Response) {
    const baseFrontUrl = process.env.FRONTEND_PAYMENT_FAILURE_URL || process.env.FRONTEND_PAYMENT_SUCCESS_URL?.replace('/success', '/failure');
    
    if (baseFrontUrl) {
      const usp = new URLSearchParams({ type });
      return res.redirect(`${baseFrontUrl}${usp.toString() ? `?${usp.toString()}` : ''}`);
    }
    return res.status(200).json({ success: false, message: 'Payment cancelled' });
  }
}
