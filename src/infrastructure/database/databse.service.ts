import { Injectable, Logger } from '@nestjs/common';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  constructor(@InjectConnection() private readonly connection: Connection) {
    this.connection.once('open', () => this.logger.log('MongoDB Connected'));
    this.connection.on('error', (err) => this.logger.log('MongoDB Error', err));
  }

  async isConnected(): Promise<boolean> {
    return this.connection.readyState === 1;
  }

  getConnection(): Connection {
    return this.connection;
  }
}
