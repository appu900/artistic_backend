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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
