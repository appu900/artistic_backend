import { Types } from 'mongoose';

export class DatabasePrimaryValidation {
  static validateIds(id: string) {
    return Types.ObjectId.isValid(id);
  }
}
