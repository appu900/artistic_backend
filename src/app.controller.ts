import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private logger = new Logger('RequestTime')
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  @Get("/health")
  getHealth(){
    const requestTime = new Date();
    this.logger.log(`Request recived at : ${requestTime.toISOString()}`)
    return this.appService.getHealth();
  }
}
