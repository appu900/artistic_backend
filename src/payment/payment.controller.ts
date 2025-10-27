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

   
  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Query('bookingId') bookingId: string,
    @Query('type') type: string,
    @Query('trackId') trackId: string,
    @Query('sessionId') sessionId?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    if (!bookingId || !type || (!trackId && !sessionId && !invoiceId)) {
      throw new HttpException(
        'Missing required params: bookingId, type, and one of trackId/sessionId/invoiceId',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const id = trackId 
      const useSession = !!sessionId;
      const verification = await this.paymentService.verifyPayment(
        id,
        bookingId,
        type as BookingType,
        useSession,
        trackId,
      );
      console.log("from controller",verification)
      if(verification.result !== 'CAPTURED'){
        await this.paymentService.releasePaymentLock(type,bookingId)
        throw new BadRequestException("payment verification failed")
      }
      return {
        message:"payment verificatiinn successful"
      }
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
