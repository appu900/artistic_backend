import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './databse.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
        dbName: config.get<string>('MONGO_DB_NAME') || 'artisticDev',
        autoIndex: true,
        retryWrites: true,
        maxPoolSize: 10,
      }),
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService,MongooseModule],
})
export class DatabaseModule {}
