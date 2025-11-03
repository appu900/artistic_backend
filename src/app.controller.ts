import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { PaymentService } from './payment/payment.service';

@Controller()
export class AppController {
  private logger = new Logger('RequestTime')
  constructor(
    private readonly appService: AppService,
    private readonly paymentService: PaymentService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  @Get('basir')
  getRes(){
    return "hello basir"
  }


  @Get("/health")
  getHealth(){
    const requestTime = new Date();
    this.logger.log(`Request recived at : ${requestTime.toISOString()}`)
    return this.appService.getHealth();
  }

  @Get("/health/payment")
  async getPaymentHealth(){
    const requestTime = new Date();
    this.logger.log(`Payment health check requested at : ${requestTime.toISOString()}`)
    return await this.paymentService.getPaymentGatewayHealth();
  }
}
