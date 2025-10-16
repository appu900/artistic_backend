import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { ArtistModule } from './modules/artist/artist.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { EquipmentProviderModule } from './modules/equipment-provider/equipment-provider.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { BullMqModule } from './infrastructure/redis/queue/bullmq.module';
import { EmailModule } from './infrastructure/email/email.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { ArtistAvailabilityModule } from './modules/artist-availability/artist-availability.module';
import { EquipmentPackagesModule } from './modules/equipment-packages/equipment-packages.module';
import { TermAndConditionsModule } from './modules/term-and-conditions/term-and-conditions.module';
import { BookingModule } from './modules/booking/booking.module';
import { BookingAnalyticsModule } from './modules/booking-analytics/booking-analytics.module';




@Module({
  imports: [
    ConfigModule.forRoot({isGlobal:true}),
    DatabaseModule,
    S3Module,
    UserModule,
    AuthModule,
    AdminModule,
    ArtistModule,
    EquipmentProviderModule,
    RedisModule,
    BullMqModule,
    EmailModule,
    EquipmentModule,
    ArtistAvailabilityModule,
    EquipmentPackagesModule,
    TermAndConditionsModule,
    BookingModule,
    BookingAnalyticsModule
  
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
