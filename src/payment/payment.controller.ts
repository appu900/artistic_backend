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
    body.customerEmai = userEmail;
    const res = await this.paymentService.initiatePayment(body);
    return { paymentLink: res.paymentLink };
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Query('bookingId') bookingId: string,
    @Query('type') type: string,
    @Query('sessionId') sessionId: string,
  ) {
    if (!bookingId || !type || !sessionId) {
      throw new HttpException(
        'Missing required params: bookingId, type, or sessionId',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const verification = await this.paymentService.verifyPayment(
        sessionId,
        bookingId,
        type as BookingType,
        true,
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

  @Get('callback/failure')
  async paymentFailure(@Query('type') type: string, @Res() res: Response) {
    return res.redirect(
      `https://yourfrontend.com/payment/failure?type=${type}`,
    );
  }
}
