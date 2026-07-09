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
    trackId:string,
    paymentMethod?: string,
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
      trackId,
      paymentMethod: paymentMethod || 'cc',
    });
    const data = await paymentLog.save();
    return data;
  }

  async updateStatus(bookingId: string, status: string, trackId?: string) {
    // A single booking can accumulate several payment logs (initial failure +
    // retry, double-click, etc.). Target the exact charge by trackId when we
    // have it (unique per charge); otherwise fall back to the most recent log
    // for the booking so we never mutate a stale/older attempt.
    const filter = trackId ? { trackId } : { bookingId };
    await this.paymentLogModel.findOneAndUpdate(
      filter,
      { $set: { status, updatedAt: new Date() } },
      { sort: { createdAt: -1 } },
    );
  }

  async updateTransactionResult(
    bookingId: string,
    resultPaymentType?: string,
    resultPaymentMethodLabel?: string,
    trackId?: string,
  ) {
    const filter = trackId ? { trackId } : { bookingId };
    await this.paymentLogModel.findOneAndUpdate(
      filter,
      { $set: { resultPaymentType, resultPaymentMethodLabel } },
      { sort: { createdAt: -1 } },
    );
  }

  async findPaymentLogByBookingId(bookingId: string) {
    // Return the latest log for the booking — older attempts (e.g. a CANCEL
    // written when a previous initiate failed) must not shadow the current one.
    return await this.paymentLogModel
      .findOne({ bookingId })
      .sort({ createdAt: -1 })
      .populate('user')
      .exec();
  }

  async findByUser(userId:string){
    return await this.paymentLogModel.find({user:userId}).sort({createdAt: -1}).exec()
  }

  async findLogBySessionId(sessionId:string){
    return await this.paymentLogModel.findOne({sessionId})
  }

  async findLogByTrackId(trackId: string){
    return await this.paymentLogModel.findOne({ trackId }).populate('user').exec()
  }
}
