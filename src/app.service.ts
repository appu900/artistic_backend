import { Injectable } from '@nestjs/common';
import { timeStamp } from 'console';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
  getHealth() {
    return {
      message:"Hello world",
      timeStamp:new Date()
    }
  }
}
