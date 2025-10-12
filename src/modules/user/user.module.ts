import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { EmailModule } from 'src/infrastructure/email/email.module';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:User.name,schema:UserSchema}
    ]),
    EmailModule
  ],
  providers: [UserService],
  controllers: [UserController],
  exports:[UserService]
})
export class UserModule {}
