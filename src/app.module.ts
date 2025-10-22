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
import { EquipmentPackageBookingModule } from './modules/equipment-package-booking/equipment-package-booking.module';
import { TermAndConditionsModule } from './modules/term-and-conditions/term-and-conditions.module';
import { BookingModule } from './modules/booking/booking.module';
import { BookingAnalyticsModule } from './modules/booking-analytics/booking-analytics.module';
import { EventsModule } from './modules/events/events.module';
import { CustomEquipmentPackagesModule } from './modules/custom-equipment-packages/custom-equipment-packages.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { ArtistPricingModule } from './modules/artist-pricing/artist-pricing.module';
import { VenueOwnerModule } from './modules/venue-owner/venue-owner.module';
import { TranslationModule } from './modules/translation/translation.module';
import { VenueLayoutModule } from './modules/venue-layout/venue-layout.module';
import { PaymentModule } from './payment/payment.module';
import { PaymentlogsModule } from './modules/paymentlogs/paymentlogs.module';
import { BookingWorkerModule } from './workers/booking-worker.module';





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
    EquipmentPackageBookingModule,
    TermAndConditionsModule,
    BookingModule,
    BookingAnalyticsModule,
    EventsModule,
    CustomEquipmentPackagesModule,
    SuperAdminModule,
    ArtistPricingModule,
    VenueOwnerModule,
    TranslationModule,
    VenueLayoutModule,
    PaymentModule,
    PaymentlogsModule,
    BookingWorkerModule

  
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
