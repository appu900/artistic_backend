import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
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
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';
import { SUPPORTED_GATEWAY_SRCS } from './payment-gateway.enum';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

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
    if (body.paymentMethod && !SUPPORTED_GATEWAY_SRCS.includes(String(body.paymentMethod).toLowerCase())) {
      throw new HttpException(
        `Unsupported paymentMethod. Must be one of: ${SUPPORTED_GATEWAY_SRCS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    body.userId = userId;
    body.customerEmail = userEmail;

    const res = await this.paymentService.initiatePayment(body);

    return {
      paymentLink: res.paymentLink,
      trackId: res.log.trackId,
      bookingId: body.bookingId,
      type: body.type,
      paymentMethod: res.log.paymentMethod,
    };
  }

  @Post('initiate-batch')
  @UseGuards(JwtAuthGuard)
  async initiateBatchPayment(@Body() body: any, @GetUser() user: any) {
    const { items, customerMobile, paymentMethod } = body || {};
    if (!Array.isArray(items) || items.length < 2) {
      throw new HttpException(
        'items must be an array with at least 2 entries',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const [idx, it] of items.entries() as any) {
      if (!it?.bookingId || !it?.type || typeof it?.amount !== 'number') {
        throw new HttpException(
          `Invalid item at index ${idx}: bookingId, type, amount required`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (it.amount <= 0) {
        throw new HttpException(
          `Invalid amount at index ${idx}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (paymentMethod && !SUPPORTED_GATEWAY_SRCS.includes(String(paymentMethod).toLowerCase())) {
      throw new HttpException(
        `Unsupported paymentMethod. Must be one of: ${SUPPORTED_GATEWAY_SRCS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const userId = user.userId;
    const userEmail = user.email;
    const res = await this.paymentService.initiateBatchPayment({
      items,
      userId,
      customerEmail: userEmail,
      customerMobile,
      paymentMethod,
    });
    return {
      paymentLink: res.paymentLink,
      trackId: res.log.trackId,
      bookingId: res.comboId,
      type: 'combo',
      paymentMethod: res.log.paymentMethod,
    };
  }

  @Get('methods')
  getSupportedPaymentMethods() {
    return { methods: SUPPORTED_GATEWAY_SRCS };
  }

  @Get('saved-cards')
  @UseGuards(JwtAuthGuard)
  async getSavedCards(@GetUser() user: any) {
    const cards = await this.paymentService.getSavedCards(user.userId);
    return { cards };
  }

  @Get('receipt')
  @UseGuards(JwtAuthGuard)
  async getPaymentReceipt(@Query('bookingId') bookingId: string) {
    if (!bookingId) {
      throw new HttpException('bookingId is required', HttpStatus.BAD_REQUEST);
    }
    const receipt = await this.paymentService.getPaymentReceipt(bookingId);
    if (!receipt) {
      throw new HttpException('Payment receipt not found', HttpStatus.NOT_FOUND);
    }
    return receipt;
  }

  @Post('saved-cards/add-link')
  @UseGuards(JwtAuthGuard)
  async addSavedCardLink(@Body() body: { returnUrl?: string }, @GetUser() user: any) {
    const returnUrl =
      body?.returnUrl ||
      process.env.FRONTEND_PAYMENT_SUCCESS_URL ||
      'https://artistic.global/payment/success';
    const link = await this.paymentService.createAddCardLink(user.userId, returnUrl);
    return { link };
  }

  @Post('webhook')
  async webhook(@Body() body: Record<string, any>, @Res() res: Response) {
    this.logger.log(`[webhook] Received raw payload: ${JSON.stringify(body)}`);
    const result = await this.paymentService.handleWebhookNotification(body);
    this.logger.log(`[webhook] Result: ${JSON.stringify(result)}`);
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('verify')
  async verifyPayment(
    @Query() allParams: Record<string, string>,
    @Res() res: Response,
  ) {
    let bookingId =
      allParams.requested_order_id ||
      allParams.order_id ||
      allParams.bookingId ||
      '';
 
    if (bookingId.includes('?')) bookingId = bookingId.split('?')[0];
    let type = allParams.type as string | undefined;
    const trackId = allParams.trackId || allParams.track_id;
    const sessionId = allParams.sessionId || allParams.session_id;
    const invoiceId = allParams.invoiceId || allParams.invoice_id;

    let cancelledVal = allParams.cancelled;
    if (cancelledVal && cancelledVal.includes('?')) {
      cancelledVal = cancelledVal.split('?')[0];
    }
    // Note: only an explicit `cancelled=1` (set on our own cancelUrl) is trusted here.
    // `result` on the redirect URL can reflect a transient/interim gateway state
    // (e.g. right after 3D Secure/OTP submission, before the charge is finalized),
    // so it must NOT be used to short-circuit straight to cancellation — doing so
    // previously caused bookings to be cancelled even when the card was later captured.
    const isCancelled = cancelledVal === '1';

    this.logger.log(
      `[verify:GET] Incoming redirect — bookingId=${bookingId}, type=${type}, trackId=${trackId}, sessionId=${sessionId}, invoiceId=${invoiceId}, cancelledVal=${cancelledVal}, isCancelled=${isCancelled}, rawParams=${JSON.stringify(allParams)}`,
    );

    const successRedirect = process.env.FRONTEND_PAYMENT_SUCCESS_URL;
    const failureRedirect =
      process.env.FRONTEND_PAYMENT_FAILURE_URL ||
      successRedirect?.replace('/success', '/failure');

    if (!bookingId) {
      const msg = 'Missing required param: bookingId';
      if (failureRedirect) {
        const usp = new URLSearchParams({ message: msg });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }

    if (isCancelled) {
      const resolvedType = await this.paymentService.resolveBookingType(
        bookingId,
        type,
      );

      // Before trusting the "cancelled" redirect, confirm with the gateway if we
      // have a trackId — the browser can bounce through this URL mid-flow (e.g.
      // 3D Secure/OTP) even though the charge ultimately gets captured. Only
      // treat it as a real cancellation once the gateway also agrees.
      const effectiveTrackId = trackId || (await this.paymentService.getTrackIdForBooking(bookingId));
      // Distinguish a genuine user cancellation from a gateway/bank decline.
      // UPayments routes declined card charges (result=FAILED, e.g. after 3D
      // Secure/OTP) back to our cancelUrl too, so `cancelled=1` alone does not
      // mean the customer chose to cancel. If we attempted a gateway
      // re-verification and it came back as a definitive decline, report that
      // instead of the misleading "Payment was cancelled".
      let gatewayDeclined = false;
      this.logger.log(
        `[verify:GET:cancelled=1] bookingId=${bookingId}, resolvedType=${resolvedType}, effectiveTrackId=${effectiveTrackId || '(none)'} — will ${effectiveTrackId ? 're-verify with gateway before cancelling' : 'cancel immediately (no trackId to verify against)'}`,
      );
      if (effectiveTrackId) {
        try {
          const verification = await this.paymentService.verifyPayment(
            effectiveTrackId,
            bookingId,
            String(resolvedType) as BookingType,
            false,
            effectiveTrackId,
          );
          this.logger.log(
            `[verify:GET:cancelled=1] Gateway re-verification for bookingId=${bookingId} returned: ${JSON.stringify(verification)}`,
          );
          if (verification.result === 'CAPTURED') {
            this.logger.log(
              `[verify:GET:cancelled=1] bookingId=${bookingId} was actually CAPTURED despite cancelled=1 redirect — routing to SUCCESS instead of cancelling.`,
            );
            await this.paymentService.releasePaymentLock(String(resolvedType), bookingId);
            if (successRedirect) {
              const usp = new URLSearchParams({
                bookingId,
                type: String(resolvedType),
                trackId: effectiveTrackId,
                ...(verification.paymentMethod ? { paymentMethod: String(verification.paymentMethod) } : {}),
                ...(verification.paymentType ? { paymentType: String(verification.paymentType) } : {}),
                ...(verification.amount != null && !Number.isNaN(verification.amount) ? { amount: String(verification.amount) } : {}),
                ...(verification.currency ? { currency: String(verification.currency) } : {}),
              });
              return res.redirect(`${successRedirect}?${usp.toString()}`);
            }
            return res.status(200).json({
              success: true,
              message: 'Payment verified successfully',
              bookingId,
              type: String(resolvedType),
              trackId: effectiveTrackId,
            });
          }
        } catch (verifyErr) {
          // Gateway couldn't confirm capture either — fall through to cancel below.
          // A business decline (gateway answered with a non-captured result such
          // as FAILED) means the bank declined the charge, not that the user
          // cancelled — surface that so the failure page is diagnosable.
          gatewayDeclined = !!(verifyErr as any)?.isBusinessDecline;
          this.logger.log(
            `[verify:GET:cancelled=1] Gateway re-verification failed/declined for bookingId=${bookingId} (businessDecline=${gatewayDeclined}): ${(verifyErr as any)?.message}. Proceeding to cancel.`,
          );
        }
      }

      this.logger.log(
        `[verify:GET:cancelled=1] Proceeding to CANCEL bookingId=${bookingId} (type=${resolvedType}).`,
      );
      const userId = await this.paymentService.resolveUserIdForBooking(bookingId);
      try {
        await this.paymentService.handlePayemntStatusUpdate(
          bookingId,
          UpdatePaymentStatus.CANCEL,
          String(resolvedType) as BookingType,
          userId,
        );
      } catch {}
      await this.paymentService.releasePaymentLock(
        String(resolvedType),
        bookingId,
      );
      const cancelMessage = gatewayDeclined
        ? 'Payment was declined by your bank. No amount was charged — please try again or use a different card/method.'
        : 'Payment was cancelled';
      if (failureRedirect) {
        const requestedMethod = await this.paymentService.getRequestedPaymentMethodLabel(bookingId);
        const usp = new URLSearchParams({
          bookingId,
          type: String(resolvedType),
          message: cancelMessage,
          processed: '1',
          ...(gatewayDeclined ? { reason: 'declined' } : {}),
          ...(requestedMethod ? { paymentMethod: requestedMethod } : {}),
        });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      return res.status(400).json({
        success: false,
        message: cancelMessage,
        bookingId,
        type: String(resolvedType),
      });
    }

    if (!trackId && !sessionId && !invoiceId) {
      const msg =
        'Missing required params: bookingId, type, and one of trackId/sessionId/invoiceId';
      if (failureRedirect) {
        const usp = new URLSearchParams({
          message: msg,
          ...(bookingId ? { bookingId } : {}),
          ...(type ? { type } : {}),
        });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }

    try {
      const resolvedType = await this.paymentService.resolveBookingType(
        bookingId,
        type,
      );
      const effectiveTrackId = trackId;
      this.logger.log(
        `[verify:GET:main] Verifying bookingId=${bookingId}, resolvedType=${resolvedType}, trackId=${effectiveTrackId}`,
      );
      const verification = await this.paymentService.verifyPayment(
        effectiveTrackId,
        bookingId,
        String(resolvedType) as BookingType,
        false,
        effectiveTrackId,
      );
      this.logger.log(
        `[verify:GET:main] Verification result for bookingId=${bookingId}: ${JSON.stringify(verification)}`,
      );
      if (verification.result !== 'CAPTURED') {
        await this.paymentService.releasePaymentLock(
          String(resolvedType),
          bookingId,
        );
        if (failureRedirect) {
          const requestedMethod = await this.paymentService.getRequestedPaymentMethodLabel(bookingId);
          const usp = new URLSearchParams({
            bookingId,
            type: String(resolvedType),
            trackId: effectiveTrackId,
            message: 'Payment not captured',
            processed: '1',
            ...(requestedMethod ? { paymentMethod: requestedMethod } : {}),
          });
          return res.redirect(`${failureRedirect}?${usp.toString()}`);
        }
        throw new BadRequestException('Payment verification failed');
      }

      // Optionally release lock; booking update is enqueued inside service
      await this.paymentService.releasePaymentLock(
        String(resolvedType),
        bookingId,
      );

      if (successRedirect) {
        const usp = new URLSearchParams({
          bookingId,
          type: String(resolvedType),
          trackId: effectiveTrackId,
          ...(verification.paymentMethod ? { paymentMethod: String(verification.paymentMethod) } : {}),
          ...(verification.paymentType ? { paymentType: String(verification.paymentType) } : {}),
          ...(verification.amount != null && !Number.isNaN(verification.amount) ? { amount: String(verification.amount) } : {}),
          ...(verification.currency ? { currency: String(verification.currency) } : {}),
          ...(verification.transactionDate ? { transactionDate: String(verification.transactionDate) } : {}),
          ...(verification.invoiceId != null ? { invoiceId: String(verification.invoiceId) } : {}),
          ...(verification.paymentId ? { paymentId: String(verification.paymentId) } : {}),
          ...(verification.tranId ? { tranId: String(verification.tranId) } : {}),
          ...(verification.auth ? { auth: String(verification.auth) } : {}),
          ...(verification.merchantRequestedOrderId ? { ref: String(verification.merchantRequestedOrderId) } : {}),
          ...(verification.result ? { result: String(verification.result) } : {}),
        });
        return res.redirect(`${successRedirect}?${usp.toString()}`);
      }
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        bookingId,
        type: String(resolvedType),
        trackId: effectiveTrackId,
      });
    } catch (error) {
      const resolvedType = type ? String(type) : 'equipment';
      this.logger.warn(
        `[verify:GET:main] Verification threw for bookingId=${bookingId}, type=${resolvedType}, trackId=${trackId}: ${(error as any)?.message}`,
      );
      await this.paymentService.releasePaymentLock(resolvedType, bookingId);
      if (failureRedirect) {
        const requestedMethod = await this.paymentService.getRequestedPaymentMethodLabel(bookingId);
        const usp = new URLSearchParams({
          bookingId,
          type: String(resolvedType),
          message: 'Payment verification failed',
          processed: '1',
          ...(requestedMethod ? { paymentMethod: requestedMethod } : {}),
        });
        return res.redirect(`${failureRedirect}?${usp.toString()}`);
      }
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

  @Post('verify')
  async verifyPaymentNotify(
    @Body() allParams: Record<string, any>,
    @Res() res: Response,
  ) {
    const bookingId =
      allParams.bookingId || allParams.requested_order_id || allParams.order_id;
    const type = allParams.type;
    const trackId = allParams.trackId || allParams.track_id;
    const sessionId = allParams.sessionId || allParams.session_id;
    const invoiceId = allParams.invoiceId || allParams.invoice_id;
    const isCancelled = allParams.cancelled === '1';

    if (!bookingId || !type || (!trackId && !sessionId && !invoiceId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message:
          'Missing required params: bookingId, type, and one of trackId/sessionId/invoiceId',
      });
    }

    if (isCancelled) {
      await this.paymentService.releasePaymentLock(type, bookingId);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Cancellation acknowledged',
        bookingId,
        type,
      });
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
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Payment verified successfully',
        bookingId,
        type,
        trackId: effectiveTrackId,
      });
    } catch (error) {
      await this.paymentService.releasePaymentLock(type, bookingId);
      const msg =
        error instanceof HttpException
          ? error.message
          : 'Payment verification failed';
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ success: false, message: msg });
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
      const usp = new URLSearchParams({
        type,
        ...(bookingId ? { bookingId } : {}),
        ...allParams,
      });
      return res.redirect(`${baseFrontUrl}?${usp.toString()}`);
    }
    return res.status(200).json({
      success: true,
      message:
        'Payment success—verify via /payment/verify?bookingId=...&type=...&trackId=...',
      bookingId,
      type,
      params: allParams,
    });
  }

  @Get('/failure')
  async paymentFailure(@Query('type') type: string, @Res() res: Response) {
    const baseFrontUrl =
      process.env.FRONTEND_PAYMENT_FAILURE_URL ||
      process.env.FRONTEND_PAYMENT_SUCCESS_URL?.replace('/success', '/failure');

    if (baseFrontUrl) {
      const usp = new URLSearchParams({ type });
      return res.redirect(
        `${baseFrontUrl}${usp.toString() ? `?${usp.toString()}` : ''}`,
      );
    }
    return res
      .status(200)
      .json({ success: false, message: 'Payment cancelled' });
  }
}
