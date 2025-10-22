import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PaymentsLog,
  PaymentsLogDocument,
} from 'src/infrastructure/database/schemas/PaymentLog.schema';

@Injectable()
export class PaymentlogsService {
  constructor(
    @InjectModel(PaymentsLog.name)
    private readonly paymentLogModel: Model<PaymentsLogDocument>,
  ) {}

  async createLog(
    userId: string,
    bookingId: string,
    bookingtype: string,
    amount: number,
    currency: string,
    status: string = 'PENDING',
    session_id: string,
  ) {
    const paymentLog = new this.paymentLogModel({
      user: userId,
      amount,
      currency,
      status,
      sessionId: session_id,
      bookingId: bookingId,
      bookingType: bookingtype,
      date: new Date(),
    });
    const data = await paymentLog.save();
    return data;
  }

  async updateStatus(bookingId:string,status:string){
    const update = { status, updatedAt: new Date() };
    await this.paymentLogModel.updateOne({ bookingId }, update);
  }

  async findPaymentLogByBookingId(bookingId:string){
    return await this.paymentLogModel.findOne({bookingId}).populate('user').exec()
  }

  async findByUser(userId:string){
    return await this.paymentLogModel.find({user:userId}).sort({createdAt: -1}).exec()
  }

  async findLogBySessionId(sessionId:string){
    return await this.paymentLogModel.findOne({sessionId})
  }
}
